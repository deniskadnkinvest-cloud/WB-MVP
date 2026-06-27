// ─────────────────────────────────────────────────────────
// _db.js — Общий пул соединений PostgreSQL
// Используется всеми API-модулями вместо Firebase Firestore
// ─────────────────────────────────────────────────────────

import pg from 'pg';
const { Pool } = pg;

/**
 * Пул соединений PostgreSQL.
 * - DATABASE_URL берётся из env (Vercel / .env), с фолбэком на прямой адрес.
 * - SSL отключён — сервер в приватной сети.
 * - Макс 5 соединений — сервер с ограниченным RAM.
 */
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://vton_user:VtonStrongPass2026!@10.8.0.1:5432/vton_mvp',
  ssl: false,
  max: 5,
  idleTimeoutMillis: 30_000,  // Закрываем idle-соединение через 30 сек
  connectionTimeoutMillis: 5_000, // Таймаут подключения 5 сек
});

// Логируем ошибки пула (чтобы не умирал молча)
pool.on('error', (err) => {
  console.error('[_db] Unexpected pool error:', err.message);
});

/**
 * Хелпер для выполнения SQL-запросов.
 * Автоматически берёт/возвращает соединение из пула.
 *
 * @param {string} text — SQL-запрос (с $1, $2 плейсхолдерами)
 * @param {Array} params — параметры запроса
 * @returns {Promise<pg.QueryResult>}
 *
 * @example
 *   const { rows } = await query('SELECT * FROM users WHERE telegram_id = $1', [telegramId]);
 */
async function query(text, params) {
  return pool.query(text, params);
}

export { pool, query };
