import { useState } from 'react';

const STATUS_COPY = {
  running: { icon: '⏳', label: 'Идёт генерация' },
  success: { icon: '✓', label: 'Готово' },
  partial: { icon: '!', label: 'Готово с ошибками' },
  error: { icon: '!', label: 'Ошибка' },
};

export default function GenerationTaskCenter({ jobs, onOpen, onDismiss }) {
  const visibleJobs = jobs.filter(job => !job.dismissed);
  const [expanded, setExpanded] = useState(false);
  if (visibleJobs.length === 0) return null;

  const latest = visibleJobs[0];
  const latestCopy = STATUS_COPY[latest.status] || STATUS_COPY.running;

  return (
    <div className={`generation-task-center ${expanded ? 'expanded' : ''}`}>
      <button
        className={`generation-task-pill status-${latest.status}`}
        onClick={() => visibleJobs.length === 1 ? onOpen(latest) : setExpanded(value => !value)}
        aria-expanded={expanded}
        aria-label="Открыть процессы генерации"
      >
        <span className="generation-task-pill-icon">{latestCopy.icon}</span>
        <span className="generation-task-pill-copy">
          <strong>{latestCopy.label}</strong>
          <small>{latest.completed}/{latest.total} · нажмите, чтобы вернуться</small>
        </span>
        {visibleJobs.length > 1 && <span className="generation-task-count">{visibleJobs.length}</span>}
      </button>

      {expanded && (
        <div className="generation-task-list" role="dialog" aria-label="Процессы генерации">
          <div className="generation-task-list-header">
            <strong>Ваши процессы</strong>
            <button onClick={() => setExpanded(false)} aria-label="Свернуть список">✕</button>
          </div>
          {visibleJobs.map(job => {
            const copy = STATUS_COPY[job.status] || STATUS_COPY.running;
            return (
              <div key={job.id} className={`generation-task-row status-${job.status}`}>
                <button className="generation-task-open" onClick={() => onOpen(job)}>
                  <span className="generation-task-row-icon">{copy.icon}</span>
                  <span>
                    <strong>{job.title}</strong>
                    <small>{copy.label} · {job.completed}/{job.total}</small>
                  </span>
                </button>
                {job.status !== 'running' && (
                  <button className="generation-task-dismiss" onClick={() => onDismiss(job.id)} aria-label="Убрать уведомление">✕</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
