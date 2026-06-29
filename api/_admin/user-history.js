// GET /api/admin/user-history — история генераций текущего пользователя
import jwt from 'jsonwebtoken';
import { query } from '../_db.js';

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

async function resolveUserId(uid, email) {
  const rawUid = uid?.startsWith('tg_') ? uid.slice(3) : uid;
  const prefixedUid = rawUid && !rawUid.startsWith('tg_') ? `tg_${rawUid}` : rawUid;
  const result = await query(
    `SELECT id FROM users
     WHERE telegram_id = $1 OR telegram_id = $2 OR telegram_id = $3 OR email = $4
     LIMIT 1`,
    [uid, rawUid, prefixedUid, email || null]
  );
  return result.rows[0]?.id || null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const decoded = verifyToken(req);
  if (!decoded) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const uid = decoded.uid;

  try {
    const userId = await resolveUserId(uid, decoded.email);
    if (!userId) {
      return res.status(404).json({ error: 'User not found' });
    }

    const limitCount = Math.min(parseInt(req.query.limit) || 100, 200);
    const typeFilter = req.query.type;

    let result;
    if (typeFilter && typeFilter !== 'all') {
      result = await query(
        `SELECT * FROM generations 
         WHERE user_id = $1 AND status = 'success' AND type = $2
         ORDER BY created_at DESC LIMIT $3`,
        [userId, typeFilter, limitCount]
      );
    } else {
      result = await query(
        `SELECT * FROM generations 
         WHERE user_id = $1 AND status = 'success'
         ORDER BY created_at DESC LIMIT $2`,
        [userId, limitCount]
      );
    }

    const generations = result.rows.map(row => {
      const meta = row.metadata || {};
      return {
        id: row.id,
        userId: row.user_id,
        success: row.status === 'success',
        createdAt: row.created_at?.toISOString(),
        imageUrl: row.result_url,
        type: row.type,
        creditsUsed: row.credits_used || 0,
        durationMs: row.duration_ms || 0,
        ...meta,
      };
    });

    return res.status(200).json({ ok: true, generations, total: generations.length });
  } catch (err) {
    console.error('[user/history] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
}
