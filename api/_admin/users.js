import { query } from '../_db.js';
import { checkAdminAuth } from './verify.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key, X-Admin-Init-Data');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  const adminAuth = checkAdminAuth(req);
  if (!adminAuth.ok) return res.status(403).json({ ok: false, error: 'Access denied' });

  try {
    const limit = Math.min(parseInt(req.query.limit || '500', 10) || 500, 2000);

    const { rows } = await query(`
      SELECT
        u.id as "primaryKey",
        CASE
          WHEN u.telegram_id ~ '^\\d+$' THEN 'tg_' || u.telegram_id
          ELSE u.telegram_id
        END as uid,
        u.email,
        COALESCE(u.email, u.telegram_id) as "displayName",
        u.telegram_id as "telegramId",
        u.created_at as "createdAt",
        s.plan_name as plan,
        s.credits,
        s.credits_total as "creditsTotal",
        s.created_at as "planActivatedAt",
        s.expires_at as "planExpiresAt",
        s.status,
        s.granted_by_admin as "grantedByAdmin",
        COALESCE(g.total, 0) as "generationCount",
        COALESCE(g.success, 0) as "successCount",
        COALESCE(g.failed, 0) as "failedCount"
      FROM users u
      LEFT JOIN subscriptions s ON s.user_id = u.id
      LEFT JOIN (
        SELECT
          user_id,
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status = 'success' OR status IS NULL)::int as success,
          COUNT(*) FILTER (WHERE status = 'error')::int as failed
        FROM generations
        GROUP BY user_id
      ) g ON g.user_id = u.id
      ORDER BY u.created_at DESC
      LIMIT $1
    `, [limit]);

    const users = rows.map(r => ({
      ...r,
      channel: r.telegramId ? 'telegram' : r.email ? 'email' : 'unknown',
      isReal: true,
      generationCount: r.generationCount || 0,
      successCount: r.successCount || 0,
      failedCount: r.failedCount || 0,
      creditsUsed: Math.max(0, (r.creditsTotal || 0) - (r.credits || 0)),
      ids: [r.uid, r.telegramId, r.email].filter(Boolean),
      generationTypes: {},
      linkedSubscriptionDocs: []
    }));

    return res.status(200).json({
      ok: true,
      users,
      summary: {
        totalRecords: users.length,
        totalUsers: users.length,
        activeSubscriptions: users.filter(u => u.plan && u.plan !== 'none').length,
      },
      totalMatched: users.length,
    });
  } catch (err) {
    console.error('[admin/users] Error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
