/**
 * Batch Queue Engine — выполняет N задач с ограничением конкурентности.
 * 
 * @param {Array} tasks - массив задач (объектов с данными для каждого вызова)
 * @param {Function} executeFn - async функция, выполняющая одну задачу: (task) => Promise<result>
 * @param {Object} options
 * @param {number} options.concurrency - макс. одновременных запросов (default: 3)
 * @param {Function} options.onProgress - (completed, total, runningCount) => void
 * @param {Function} options.onResult - (result, task) => void — вызывается при каждом готовом результате
 * @returns {Promise<Array>} - все результаты
 */
export async function runBatchQueue(tasks, executeFn, { concurrency = 3, onProgress, onResult } = {}) {
  const results = [];
  let completed = 0;
  let running = 0;
  const queue = [...tasks];
  const total = tasks.length;

  const runNext = async () => {
    while (queue.length > 0) {
      const task = queue.shift();
      running++;
      onProgress?.(completed, total, running);

      try {
        const result = await executeFn(task);
        const entry = { ...result, task };
        results.push(entry);
        onResult?.(entry, task);
      } catch (err) {
        const entry = { success: false, error: err.message, task };
        results.push(entry);
        onResult?.(entry, task);
      }

      running--;
      completed++;
      onProgress?.(completed, total, running);
    }
  };

  // Запускаем N воркеров параллельно — каждый тянет задачи из общей очереди
  const workerCount = Math.min(concurrency, tasks.length);
  const workers = Array.from({ length: workerCount }, () => runNext());
  await Promise.all(workers);

  return results;
}

/**
 * Макс. допустимое количество задач в одном батче
 */
export const MAX_BATCH_SIZE = 24;

/**
 * Порог, при котором показываем подтверждение пользователю
 */
export const BATCH_CONFIRM_THRESHOLD = 6;

/**
 * Макс. параллельных запросов к API
 */
export const BATCH_CONCURRENCY = 3;
