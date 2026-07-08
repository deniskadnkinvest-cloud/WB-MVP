import { query } from './_db.js';
import { alertOnError } from './_admin-alerts.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'vton-secret-2026';

function verifyToken(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { uid } = req.body || {};

  if (!uid) {
    return res.status(400).json({ ok: false, error: 'uid is required' });
  }

  try {
    const decoded = verifyToken(req);
    if (!decoded || decoded.uid !== uid) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    // Resolve user (strip tg_ prefix since DB stores telegram_id without prefix)
    let resolvedTelegramId = uid;
    if (uid && uid.startsWith('tg_')) {
      resolvedTelegramId = uid.slice(3);
    }
    const userRes = await query(`SELECT id FROM users WHERE telegram_id = $1 LIMIT 1`, [resolvedTelegramId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    const userId = userRes.rows[0].id;

    // Update subscription
    const updateRes = await query(`
      UPDATE subscriptions 
      SET auto_renew = false, yookassa_payment_method_id = NULL 
      WHERE user_id = $1 
      RETURNING id
    `, [userId]);

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Subscription not found' });
    }

    console.log(`[Subscription] Auto-renew disabled for user ${uid}`);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('cancel-subscription error:', err);
    alertOnError(err, `cancel-subscription [${uid}]`).catch(() => {});
    return res.status(500).json({ ok: false, error: err.message });
  }
}
