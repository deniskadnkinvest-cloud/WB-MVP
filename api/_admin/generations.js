// ═══════════════════════════════════════════════════════════════
// GET /api/admin/generations
// Возвращает список последних генераций из PostgreSQL для Command Center.
//
// Query parameters:
//   limit    number?  — количество записей (default 100, max 1000)
//   userId   string?  — фильтрация по конкретному юзеру (tg_id / telegram_id / email)
//   type     string?  — фильтрация по типу генерации
// ═══════════════════════════════════════════════════════════════

import { checkAdminAuth } from './verify.js';
import { query as pgQuery } from '../_db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key, X-Admin-Init-Data');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const adminAuth = checkAdminAuth(req);
  if (!adminAuth.ok) return res.status(403).json({ ok: false, error: 'Нет доступа' });

  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10) || 100, 1000);
    const userId = String(req.query.userId || '').trim();
    const type = String(req.query.type || '').trim();

    const conds = [];
    const params = [];
    if (userId) {
      params.push(userId.replace(/^tg_/, ''));
      conds.push(`(u.telegram_id = $${params.length} OR u.email = $${params.length})`);
    }
    if (type) {
      params.push(type);
      conds.push(`g.type = $${params.length}`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    params.push(limit);

    const { rows } = await pgQuery(
      `SELECT g.id, g.type, g.status, g.duration_ms, g.credits_used, g.result_url,
              g.metadata, g.created_at,
              CASE
                WHEN u.telegram_id ~ '^\\d+$' THEN 'tg_' || u.telegram_id
                ELSE COALESCE(u.telegram_id, u.email)
              END AS uid
       FROM generations g
       LEFT JOIN users u ON u.id = g.user_id
       ${where}
       ORDER BY g.created_at DESC
       LIMIT $${params.length}`,
      params
    );

    const generations = rows.map(r => ({
      id: r.id,
      type: r.type,
      success: r.status !== 'error',
      durationMs: r.duration_ms,
      creditsUsed: r.credits_used,
      resultUrl: r.result_url,
      error: r.status === 'error' ? (r.metadata?.error || 'Ошибка генерации') : null,
      userId: r.uid,
      createdAt: r.created_at?.toISOString?.() || r.created_at,
    }));

    return res.status(200).json({ ok: true, generations });
  } catch (err) {
    console.error('[admin/generations] Error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
