import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GENERATION_JOB_STALE_MS,
  MAX_CONCURRENT_GENERATIONS,
  countActiveGenerationTasks,
  getAvailableGenerationSlots,
  ensureGenerationJob,
  markStaleGenerationJobs,
  mergeGenerationRecords,
  patchGenerationTask,
} from '../src/lib/generationTaskStore.js';
import {
  MAX_CONCURRENT_USER_GENERATIONS,
  UserGenerationConcurrencyLimiter,
} from '../api/_generation-concurrency.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('parallel tasks remain grouped and expose partial completion', () => {
  let jobs = [];
  for (let index = 1; index <= 3; index += 1) {
    jobs = ensureGenerationJob(jobs, {
      batchId: 'batch-1',
      taskId: `task-${index}`,
      taskLabel: `Кадр ${index}`,
      total: 3,
      title: 'Фотосессия',
      kind: 'photoshoot',
      startedAt: 1_000,
    });
  }

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].total, 3);
  assert.equal(jobs[0].running, 3);
  assert.equal(jobs[0].status, 'running');

  jobs = patchGenerationTask(jobs, 'batch-1', 'task-1', { status: 'success', imageUrl: 'https://cdn.test/1.jpg' });
  jobs = patchGenerationTask(jobs, 'batch-1', 'task-2', { status: 'error', error: 'provider failed' });
  jobs = patchGenerationTask(jobs, 'batch-1', 'task-3', { status: 'success', imageUrl: 'https://cdn.test/3.jpg' });

  assert.equal(jobs[0].completed, 2);
  assert.equal(jobs[0].failed, 1);
  assert.equal(jobs[0].running, 0);
  assert.equal(jobs[0].status, 'partial');
});

test('server records restore a generation after the app was closed', () => {
  const jobs = mergeGenerationRecords([], [
    {
      id: 901,
      clientBatchId: 'restored-batch',
      clientTaskId: 'restored-task-1',
      clientTaskLabel: 'Кадр 1',
      clientTaskTotal: 2,
      clientJobTitle: 'Виртуальная примерка',
      clientJobKind: 'fashion',
      clientResumeMode: 'fashion',
      status: 'running',
      createdAt: '2026-07-18T12:00:00.000Z',
    },
    {
      id: 902,
      clientBatchId: 'restored-batch',
      clientTaskId: 'restored-task-2',
      clientTaskLabel: 'Кадр 2',
      clientTaskTotal: 2,
      clientJobTitle: 'Виртуальная примерка',
      clientJobKind: 'fashion',
      clientResumeMode: 'fashion',
      status: 'success',
      success: true,
      imageUrl: 'https://cdn.test/result.jpg',
      createdAt: '2026-07-18T12:00:00.000Z',
    },
  ]);

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].status, 'running');
  assert.equal(jobs[0].completed, 1);
  assert.equal(jobs[0].running, 1);
  assert.equal(jobs[0].resumeContext.appMode, 'fashion');
  assert.equal(jobs[0].tasks[1].imageUrl, 'https://cdn.test/result.jpg');
});

test('unconfirmed background work becomes a visible error instead of spinning forever', () => {
  const now = Date.now();
  const jobs = ensureGenerationJob([], {
    batchId: 'stale-batch',
    taskId: 'stale-task',
    total: 1,
    startedAt: now - GENERATION_JOB_STALE_MS - 1,
  });
  const stale = markStaleGenerationJobs(jobs, now);
  assert.equal(stale[0].status, 'error');
  assert.match(stale[0].tasks[0].error, /Мои работы/u);
});

test('a dismissed completed notification stays dismissed after server reconciliation', () => {
  const records = [{
    id: 903,
    clientBatchId: 'dismissed-batch',
    clientTaskId: 'dismissed-task',
    clientTaskTotal: 1,
    status: 'success',
    success: true,
    imageUrl: 'https://cdn.test/done.jpg',
  }];
  const initial = mergeGenerationRecords([], records);
  const dismissed = initial.map(job => ({ ...job, dismissed: true }));
  const reconciled = mergeGenerationRecords(dismissed, records);
  assert.equal(reconciled[0].dismissed, true);
  assert.equal(reconciled[0].status, 'success');
});

test('restored jobs remain ordered newest first', () => {
  const restored = mergeGenerationRecords([], [
    { clientBatchId: 'newer', clientTaskId: 'newer-1', status: 'running', createdAt: '2026-07-18T13:00:00.000Z' },
    { clientBatchId: 'older', clientTaskId: 'older-1', status: 'running', createdAt: '2026-07-18T12:00:00.000Z' },
  ]);
  assert.deepEqual(restored.map(job => job.id), ['newer', 'older']);
});

test('the client exposes only the remaining part of the global ten-image capacity', () => {
  let jobs = [];
  for (let index = 1; index <= 8; index += 1) {
    jobs = ensureGenerationJob(jobs, {
      batchId: index <= 4 ? 'fashion-live' : 'product-live',
      taskId: `active-${index}`,
      total: 4,
      kind: index <= 4 ? 'fashion' : 'product',
    });
  }

  assert.equal(MAX_CONCURRENT_GENERATIONS, 10);
  assert.equal(countActiveGenerationTasks(jobs), 8);
  assert.equal(getAvailableGenerationSlots(jobs), 2);

  jobs = patchGenerationTask(jobs, 'fashion-live', 'active-1', { status: 'success' });
  assert.equal(countActiveGenerationTasks(jobs), 7);
  assert.equal(getAvailableGenerationSlots(jobs), 3);
});

test('the server enforces ten active generations per user and releases capacity safely', () => {
  const limiter = new UserGenerationConcurrencyLimiter(MAX_CONCURRENT_USER_GENERATIONS);
  const slots = Array.from({ length: 10 }, () => limiter.tryAcquire('tg_42'));

  assert.equal(MAX_CONCURRENT_USER_GENERATIONS, 10);
  assert.equal(slots.every(slot => slot.acquired), true);
  assert.equal(limiter.getActive('tg_42'), 10);
  const rejected = limiter.tryAcquire('tg_42');
  assert.equal(rejected.acquired, false);
  assert.equal(rejected.active, 10);
  assert.equal(rejected.available, 0);
  assert.equal(rejected.maxConcurrent, 10);
  assert.equal(limiter.tryAcquire('tg_other').acquired, true);

  slots[0].release();
  slots[0].release();
  assert.equal(limiter.getActive('tg_42'), 9);
  assert.equal(limiter.tryAcquire('tg_42').acquired, true);
});

test('selection, persistence and safe download invariants stay in source', () => {
  const app = read('src/App.jsx');
  const history = read('src/components/MyHistoryPage.jsx');
  const generator = read('api/generate-image.js');
  const userData = read('api/user-data.js');

  assert.match(app, /modelTab === 'my_models'[\s\S]*?selectedSavedModelIds\.map/u);
  assert.match(app, /toggleSelectedSavedModelId/u);
  assert.match(app, /toggleProductSavedModelId/u);
  assert.match(app, /setSelectedModels\(\[\]\)/u);
  assert.match(app, /Promise\.allSettled\(tasks\.map/u);
  assert.match(app, /batch:\$\{appMode\}/u);
  assert.match(app, /Сгенерировать \$\{confirmModal\.cost\}/u);
  assert.match(app, /GENERATION_JOBS_STORAGE_KEY/u);
  assert.match(app, /downloadImageAsset\(displayImg/u);
  assert.doesNotMatch(history, /window\.open/u);
  assert.match(history, /navigator\.share/u);
  assert.match(generator, /status: 'running'/u);
  assert.match(generator, /metadata ->> 'clientTaskId'/u);
  assert.match(generator, /sourceModelId/u);
  assert.match(generator, /code: 'GENERATION_LIMIT'/u);
  assert.match(generator, /userGenerationConcurrencyLimiter\.tryAcquire\(verifiedUid\)/u);
  assert.match(userData, /type === 'generation-tasks'/u);
  assert.match(userData, /DELETE FROM generations WHERE id = \$1 AND user_id = \$2/u);
});
