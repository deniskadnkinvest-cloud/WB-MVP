export const GENERATION_JOBS_STORAGE_KEY = 'vton_generationJobs';
export const GENERATION_JOB_STALE_MS = 15 * 60 * 1000;
export const MAX_CONCURRENT_GENERATIONS = 10;

const TERMINAL_TASK_STATUSES = new Set(['success', 'error']);

export function countActiveGenerationTasks(jobs = []) {
  return jobs.reduce((total, job) => total + (job.tasks || []).filter(task => (
    !TERMINAL_TASK_STATUSES.has(task.status === 'completed' ? 'success' : task.status)
  )).length, 0);
}

export function getAvailableGenerationSlots(jobs = []) {
  return Math.max(0, MAX_CONCURRENT_GENERATIONS - countActiveGenerationTasks(jobs));
}

const normalizeTask = (task = {}) => ({
  id: String(task.id || task.clientTaskId || ''),
  label: task.label || task.clientTaskLabel || 'Генерация',
  status: task.status === 'completed' ? 'success' : (task.status || 'running'),
  imageUrl: task.imageUrl || null,
  error: task.error || '',
  generationId: task.generationId || null,
  updatedAt: task.updatedAt || Date.now(),
});

export function summarizeGenerationJob(job) {
  const tasks = (job.tasks || []).map(normalizeTask);
  const completed = tasks.filter(task => task.status === 'success').length;
  const failed = tasks.filter(task => task.status === 'error').length;
  const running = tasks.filter(task => !TERMINAL_TASK_STATUSES.has(task.status)).length;
  const total = Math.max(Number(job.total) || 0, tasks.length, 1);

  let status = 'running';
  if (running === 0 && failed === 0 && completed > 0) status = 'success';
  else if (running === 0 && failed >= total) status = 'error';
  else if (running === 0 && failed > 0) status = 'partial';

  return {
    ...job,
    tasks,
    total,
    completed,
    failed,
    running,
    status,
    updatedAt: Math.max(job.updatedAt || 0, ...tasks.map(task => task.updatedAt || 0), Date.now()),
  };
}

export function ensureGenerationJob(jobs, descriptor) {
  const batchId = String(descriptor.batchId || descriptor.id || '');
  const taskId = String(descriptor.taskId || '');
  if (!batchId || !taskId) return jobs;

  const now = Date.now();
  const existingIndex = jobs.findIndex(job => String(job.id) === batchId);
  const existing = existingIndex >= 0 ? jobs[existingIndex] : null;
  const task = normalizeTask({
    id: taskId,
    label: descriptor.taskLabel,
    status: descriptor.taskStatus || 'running',
    updatedAt: now,
  });
  const existingTasks = existing?.tasks || [];
  const taskIndex = existingTasks.findIndex(item => String(item.id) === taskId);
  const tasks = taskIndex >= 0
    ? existingTasks.map((item, index) => index === taskIndex ? { ...item, ...task } : item)
    : [...existingTasks, task];

  const nextJob = summarizeGenerationJob({
    ...(existing || {}),
    id: batchId,
    title: descriptor.title || existing?.title || 'Генерация',
    kind: descriptor.kind || existing?.kind || 'generation',
    total: Math.max(Number(descriptor.total) || 1, existing?.total || 0, tasks.length),
    startedAt: existing?.startedAt || descriptor.startedAt || now,
    updatedAt: now,
    resumeContext: { ...(existing?.resumeContext || {}), ...(descriptor.resumeContext || {}) },
    tasks,
    dismissed: Boolean(existing?.dismissed),
  });

  const next = existingIndex >= 0
    ? jobs.map((job, index) => index === existingIndex ? nextJob : job)
    : [nextJob, ...jobs];
  return next.slice(0, 12);
}

export function patchGenerationTask(jobs, batchId, taskId, patch) {
  let found = false;
  const next = jobs.map(job => {
    if (String(job.id) !== String(batchId)) return job;
    const tasks = (job.tasks || []).map(task => {
      if (String(task.id) !== String(taskId)) return task;
      found = true;
      return normalizeTask({ ...task, ...patch, updatedAt: Date.now() });
    });
    return summarizeGenerationJob({ ...job, tasks, dismissed: Boolean(job.dismissed) });
  });
  return found ? next : jobs;
}

export function mergeGenerationRecords(jobs, records = []) {
  let next = jobs;
  records.forEach(record => {
    const batchId = record.clientBatchId;
    const taskId = record.clientTaskId;
    if (!batchId || !taskId) return;

    next = ensureGenerationJob(next, {
      batchId,
      taskId,
      taskLabel: record.clientTaskLabel,
      title: record.clientJobTitle,
      kind: record.clientJobKind,
      total: record.clientTaskTotal,
      startedAt: record.createdAt ? new Date(record.createdAt).getTime() : Date.now(),
      resumeContext: {
        appMode: record.clientResumeMode,
        quickMode: record.clientQuickMode,
        sourceImage: record.clientSourceImage,
      },
    });

    const status = ['success', 'completed'].includes(record.status) || record.success === true
      ? 'success'
      : record.status === 'running' || record.status === 'pending'
        ? 'running'
        : 'error';
    next = patchGenerationTask(next, batchId, taskId, {
      status,
      imageUrl: record.imageUrl || null,
      error: status === 'error' ? (record.error || 'Генерация не завершилась') : '',
      generationId: record.id || null,
    });
  });
  return [...next].sort((left, right) => (right.startedAt || 0) - (left.startedAt || 0));
}

export function markStaleGenerationJobs(jobs, now = Date.now()) {
  return jobs.map(job => {
    if (job.status !== 'running' || now - (job.startedAt || now) < GENERATION_JOB_STALE_MS) return job;
    const tasks = (job.tasks || []).map(task => TERMINAL_TASK_STATUSES.has(task.status)
      ? task
      : normalizeTask({
        ...task,
        status: 'error',
        error: 'Сервер не подтвердил результат. Откройте «Мои работы» или повторите генерацию.',
        updatedAt: now,
      }));
    return summarizeGenerationJob({ ...job, tasks });
  });
}
