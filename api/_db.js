// Shared PostgreSQL pool used by API modules.
// Keep this module small: it is loaded by auth, billing, admin, and generation routes.

import 'dotenv/config';
import pg from 'pg';
import { requireEnv } from './_env.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: requireEnv('DATABASE_URL'),
  ssl: false,
  max: 30,
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 15000,
  query_timeout: 10000,
  statement_timeout: 10000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[_db] Unexpected pool error:', err.message);
});



const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function isReadOnlySql(text = '') {
  // A WITH query may contain data-changing CTEs, so only retry statements
  // whose leading verb is unambiguously read-only.
  return /^\s*(SELECT|SHOW)\b/i.test(String(text));
}

function isRetryableConnectionError(err) {
  const message = String(err?.message || '').toLowerCase();
  const code = String(err?.code || '').toUpperCase();

  return (
    ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EPIPE', '57P01', '08006', '08003'].includes(code) ||
    message.includes('connection terminated due to connection timeout') ||
    message.includes('timeout exceeded when trying to connect') ||
    message.includes('terminating connection') ||
    message.includes('connection timeout') ||
    message.includes('connection reset')
  );
}

function canRetrySql(text, options = {}) {
  if (options.retryUnsafe === true) return true;
  return isReadOnlySql(text);
}

function toLogMessage(err) {
  return String(err?.message || err || 'unknown error').replace(/\s+/g, ' ').slice(0, 220);
}

async function query(text, params, options = {}) {
  const maxAttempts = Math.max(1, Number(options.attempts || 3));
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await pool.query(text, params);
      if (attempt > 1) {
        console.warn(`[_db] Query recovered after retry ${attempt}/${maxAttempts}`);
      }
      return result;
    } catch (err) {
      lastError = err;
      const retryable = isRetryableConnectionError(err) && canRetrySql(text, options) && attempt < maxAttempts;
      if (!retryable) break;

      console.warn(`[_db] Transient connection error, retrying ${attempt}/${maxAttempts}: ${toLogMessage(err)}`);
      await sleep(800 * attempt);
    }
  }

  if (isRetryableConnectionError(lastError)) {
    lastError.message = 'Сервис временно недоступен. Повторите попытку.';
  }

  throw lastError;
}

export { pool, query, isRetryableConnectionError };
export const getPoolStats = () => ({
  totalCount: pool.totalCount,
  idleCount: pool.idleCount,
  waitingCount: pool.waitingCount
});
