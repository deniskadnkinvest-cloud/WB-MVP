// ═══════════════════════════════════════════════════════════════
// POST /api/consume-credit
// Списание кредитов за генерацию
// ИСТОЧНИК ИСТИНЫ: PostgreSQL (российский хостинг, ФЗ-152)
// ═══════════════════════════════════════════════════════════════

import jwt from 'jsonwebtoken';
import { query } from './_db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'vton-secret-2026';

/**
 * Найти пользователя в PostgreSQL (аналогично subscription.js).
 */
async function findUser(uid, email) {
  let result = await query(
    `SELECT id, telegram_id FROM users WHERE telegram_id = $1 LIMIT 1`,
    [uid]
  );
  if (result.rows.length > 0) return result.rows[0];

  if (uid && uid.startsWith('tg_')) {
    const rawId = uid.slice(3);
    result = await query(
      `SELECT id, telegram_id FROM users WHERE telegram_id = $1 LIMIT 1`,
      [rawId]
    );
    if (result.rows.length > 0) return result.rows[0];
  }

  if (email) {
    result = await query(
      `SELECT id, telegram_id FROM users WHERE email = $1 LIMIT 1`,
      [email]
    );
    if (result.rows.length > 0) return result.rows[0];
  }

  return null;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ ok: false, error: 'Invalid token' });
  }

  const uid = decoded.uid;
  const email = decoded.email || null;
  const { amount = 1 } = req.body || {};

  try {
    const user = await findUser(uid, email);
    if (!user) {
      return res.status(403).json({ ok: false, error: 'NO_PLAN' });
    }

    const userId = user.id;

    // Атомарное списание кредитов с проверкой наличия
    const result = await query(
      `UPDATE subscriptions
       SET credits = credits - $1
       WHERE user_id = $2
         AND credits >= $1
         AND plan_name != 'none'
       RETURNING credits`,
      [amount, userId]
    );

    if (result.rows.length === 0) {
      // Проверяем причину ошибки
      const subCheck = await query(
        `SELECT plan_name, credits FROM subscriptions WHERE user_id = $1`,
        [userId]
      );

      if (subCheck.rows.length === 0 || subCheck.rows[0].plan_name === 'none') {
        return res.status(403).json({ ok: false, error: 'NO_PLAN' });
      }
      if (subCheck.rows[0].credits < amount) {
        return res.status(403).json({ ok: false, error: 'NO_CREDITS' });
      }
      return res.status(500).json({ ok: false, error: 'Unknown error' });
    }

    return res.json({
      ok: true,
      data: { creditsRemaining: result.rows[0].credits },
    });
  } catch (err) {
    console.error('[consume-credit] Error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
