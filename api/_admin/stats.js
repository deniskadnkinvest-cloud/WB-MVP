import { query } from '../_db.js';
import { checkAdminAuth } from './verify.js';

let _cache = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 30_000;

async function fetchStats() {
  const now = Date.now();
  if (_cache && (now - _cacheTime) < CACHE_TTL_MS) {
    return _cache;
  }

  const { rows: users } = await query('SELECT count(*) as count FROM users');
  const { rows: subs } = await query(`
    SELECT count(*) as count, COALESCE(plan_name, 'none') as plan
    FROM subscriptions
    WHERE COALESCE(status, 'inactive') = 'active'
    GROUP BY COALESCE(plan_name, 'none')
  `);
  const { rows: genRows } = await query(`
    SELECT
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE)::int as today,
      COALESCE(SUM(credits_used), 0)::int as credits_used
    FROM generations
  `);
  const { rows: genByModeRows } = await query(`
    SELECT COALESCE(type, 'unknown') as type, COUNT(*)::int as count
    FROM generations
    GROUP BY COALESCE(type, 'unknown')
  `);

  // ═══ Payments / revenue (YooKassa in RUB) + admin grants ═══
  const { rows: payAgg } = await query(`
    SELECT
      COUNT(*) FILTER (WHERE method = 'yookassa')::int AS real_payments,
      COALESCE(SUM(amount) FILTER (WHERE method = 'yookassa'), 0)::float AS revenue_total,
      COALESCE(SUM(amount) FILTER (WHERE method = 'yookassa' AND created_at::date = CURRENT_DATE), 0)::float AS revenue_today,
      COALESCE(SUM(amount) FILTER (WHERE method = 'yookassa' AND created_at >= CURRENT_DATE - INTERVAL '7 days'), 0)::float AS revenue_week,
      COUNT(*) FILTER (WHERE method LIKE 'admin%')::int AS admin_grants,
      COALESCE(SUM(credits_amount) FILTER (WHERE method LIKE 'admin%'), 0)::int AS granted_credits
    FROM payments
  `);
  const pay = payAgg[0] || {};

  const { rows: revByPlanRows } = await query(`
    SELECT COALESCE(plan_id, '?') AS plan, COALESCE(SUM(amount), 0)::float AS revenue
    FROM payments WHERE method = 'yookassa' GROUP BY plan_id
  `);
  const revenueByPlan = { trial: 0, base: 0, pro: 0 };
  for (const r of revByPlanRows) { if (r.plan in revenueByPlan) revenueByPlan[r.plan] = r.revenue; }

  const uidExpr = `CASE WHEN u.telegram_id ~ '^\\d+$' THEN 'tg_' || u.telegram_id ELSE COALESCE(u.telegram_id, u.email) END`;
  const { rows: recentPayRows } = await query(`
    SELECT p.plan_id, p.amount, p.created_at, ${uidExpr} AS uid
    FROM payments p LEFT JOIN users u ON u.id = p.user_id
    WHERE p.method = 'yookassa' ORDER BY p.created_at DESC LIMIT 10
  `);
  const recentPayments = recentPayRows.map(r => ({
    planId: r.plan_id, amount: Number(r.amount) || 0, uid: r.uid,
    date: r.created_at?.toISOString?.() || r.created_at,
  }));

  const { rows: recentGrantRows } = await query(`
    SELECT p.plan_id, p.credits_amount, p.created_at, p.metadata, ${uidExpr} AS uid
    FROM payments p LEFT JOIN users u ON u.id = p.user_id
    WHERE p.method LIKE 'admin%' ORDER BY p.created_at DESC LIMIT 10
  `);
  const recentAdminGrants = recentGrantRows.map(r => ({
    planId: r.plan_id, credits: r.credits_amount, uid: r.uid,
    grantedByName: r.metadata?.grantedByName || '',
    date: r.created_at?.toISOString?.() || r.created_at,
  }));

  const totalUsers = parseInt(users[0]?.count || 0, 10);
  const planCounts = { none: totalUsers, trial: 0, base: 0, pro: 0 };
  let activeUsers = 0;

  for (const s of subs) {
    if (s.plan && s.plan !== 'none') {
      const cnt = parseInt(s.count || 0, 10);
      planCounts[s.plan] = (planCounts[s.plan] || 0) + cnt;
      activeUsers += cnt;
      planCounts.none -= cnt;
    }
  }

  const gen = genRows[0] || {};
  const generationsByMode = { fashion: 0, product: 0, calibration: 0, autocatalog: 0 };
  for (const row of genByModeRows) {
    generationsByMode[row.type] = parseInt(row.count || 0, 10);
  }

  const result = {
    totalUsers,
    activeUsers,
    planCounts,
    conversionRate: totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0,
    generationsTotal: parseInt(gen.total || 0, 10),
    generationsFashion: generationsByMode.fashion || 0,
    generationsProduct: generationsByMode.product || 0,
    generationsCalibration: generationsByMode.calibration || 0,
    generationsToday: parseInt(gen.today || 0, 10),
    generationsFromCredits: parseInt(gen.credits_used || 0, 10),
    generationsLogCount: parseInt(gen.total || 0, 10),
    generationsByMode,
    botStatus: 'active',
    botUsername: 'seller_studio_bot',
    botActivations: 0,
    botActivationsToday: 0,
    realPaymentsCount: pay.real_payments || 0,
    revenueTotal: Math.round(pay.revenue_total || 0),
    revenueWeek: Math.round(pay.revenue_week || 0),
    revenueToday: Math.round(pay.revenue_today || 0),
    revenueByPlan,
    // Telegram Stars not in use — revenue is RUB via YooKassa (see revenue* fields)
    starsTotal: 0,
    starsWeek: 0,
    starsToday: 0,
    testPaymentsCount: 0,
    testStarsTotal: 0,
    adminGrantsCount: pay.admin_grants || 0,
    grantedCreditsTotal: pay.granted_credits || 0,
    recentPayments,
    recentTestPayments: [],
    recentAdminGrants,
    activeUsersList: [],
    generatedAt: new Date().toISOString(),
  };

  _cache = result;
  _cacheTime = Date.now();
  return result;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key, X-Admin-Init-Data');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const auth = checkAdminAuth(req);
  if (!auth.ok) {
    return res.status(403).json({ ok: false, error: 'Нет доступа' });
  }

  try {
    const data = await fetchStats();
    return res.status(200).json({ ok: true, data });
  } catch (err) {
    console.error('[admin/stats] Ошибка:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
