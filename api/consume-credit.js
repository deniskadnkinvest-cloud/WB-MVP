// ═══════════════════════════════════════════════════════════════
// POST /api/consume-credit
// Списание кредитов (замена Firebase FieldValue.increment)
// ═══════════════════════════════════════════════════════════════

import jwt from 'jsonwebtoken';
import { query } from './_db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'vton-secret-2026';

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
  const { amount = 1 } = req.body || {};

  try {
    // Атомарное списание кредитов с проверкой наличия
    // RETURNING гарантирует, что мы получим актуальное значение после UPDATE
    const result = await query(
      `UPDATE subscriptions
       SET credits = credits - $1
       WHERE user_id = (SELECT id FROM users WHERE telegram_id = $2)
         AND credits >= $1
         AND plan_name != 'none'
       RETURNING credits`,
      [amount, uid]
    );

    if (result.rows.length === 0) {
      // Проверяем причину ошибки
      const subCheck = await query(
        `SELECT s.plan_name, s.credits
         FROM subscriptions s
         JOIN users u ON s.user_id = u.id
         WHERE u.telegram_id = $1`,
        [uid]
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
      creditsRemaining: result.rows[0].credits,
    });
  } catch (err) {
    console.error('[consume-credit] Error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
