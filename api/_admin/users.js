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
        u.uid as "primaryKey", u.uid, u.email, u.display_name as "displayName", u.telegram_id as "telegramId",
        u.created_at as "createdAt",
        s.plan, s.credits, s.credits_total as "creditsTotal", s.plan_activated_at as "planActivatedAt", s.plan_expires_at as "planExpiresAt", s.status
      FROM users u
      LEFT JOIN subscriptions s ON u.uid = s.uid
      ORDER BY u.created_at DESC
      LIMIT $1
    `, [limit]);

    const users = rows.map(r => ({
      ...r,
      channel: r.telegramId ? 'telegram' : r.email ? 'email' : 'unknown',
      isReal: true,
      generationCount: 0,
      successCount: 0,
      failedCount: 0,
      creditsUsed: Math.max(0, (r.creditsTotal || 0) - (r.credits || 0)),
      ids: [r.uid, r.telegramId].filter(Boolean),
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
