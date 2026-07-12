import { query } from '../_db.js';
import { checkAdminAuth } from './verify.js';

let _cache = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 30_000;

// Месячная цена платных тарифов (для MRR). trial — разовый, не рекуррентный.
const PLAN_MONTHLY_PRICE = { base: 5000, pro: 14990 };
const TREND_DAYS = 14;

async function fetchStats() {
  const now = Date.now();
  if (_cache && (now - _cacheTime) < CACHE_TTL_MS) {
    return _cache;
  }

  // ═══ Users (всего + рост) ═══
  const { rows: userRows } = await query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE)::int AS today,
      COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days')::int AS week
    FROM users
  `);
  const totalUsers = userRows[0]?.total || 0;
  const newUsersToday = userRows[0]?.today || 0;
  const newUsersWeek = userRows[0]?.week || 0;

  // ═══ Активные подписки по планам ═══
  const { rows: subs } = await query(`
    SELECT count(*) as count, COALESCE(plan_name, 'none') as plan
    FROM subscriptions
    WHERE COALESCE(status, 'inactive') = 'active'
    GROUP BY COALESCE(plan_name, 'none')
  `);

  // ═══ Генерации ═══
  const { rows: genRows } = await query(`
    SELECT
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE)::int as today,
      COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days')::int as week,
      COUNT(*) FILTER (WHERE status = 'error')::int as failed,
      COALESCE(SUM(credits_used), 0)::int as credits_used
    FROM generations
  `);
  const { rows: genByModeRows } = await query(`
    SELECT COALESCE(type, 'unknown') as type, COUNT(*)::int as count
    FROM generations
    GROUP BY COALESCE(type, 'unknown')
  `);

  // ═══ Платежи / выручка (ЮKassa, ₽) + гранты админа ═══
  const { rows: payAgg } = await query(`
    SELECT
      COUNT(*) FILTER (WHERE method = 'yookassa')::int AS real_payments,
      COUNT(DISTINCT user_id) FILTER (WHERE method = 'yookassa')::int AS paying_users,
      COALESCE(SUM(amount) FILTER (WHERE method = 'yookassa'), 0)::float AS revenue_total,
      COALESCE(SUM(amount) FILTER (WHERE method = 'yookassa' AND created_at::date = CURRENT_DATE), 0)::float AS revenue_today,
      COALESCE(SUM(amount) FILTER (WHERE method = 'yookassa' AND created_at >= CURRENT_DATE - INTERVAL '7 days'), 0)::float AS revenue_week,
      COALESCE(SUM(amount) FILTER (WHERE method = 'yookassa' AND created_at >= date_trunc('month', CURRENT_DATE)), 0)::float AS revenue_month,
      COALESCE(SUM(amount) FILTER (WHERE method = 'yookassa' AND plan_id LIKE 'topup_%'), 0)::float AS revenue_topups,
      COALESCE(SUM(amount) FILTER (WHERE method = 'yookassa' AND (plan_id IS NULL OR plan_id NOT LIKE 'topup_%')), 0)::float AS revenue_subs,
      COUNT(*) FILTER (WHERE method LIKE 'admin%')::int AS admin_grants,
      COALESCE(SUM(credits_amount) FILTER (WHERE method LIKE 'admin%'), 0)::int AS granted_credits
    FROM payments
  `);
  const pay = payAgg[0] || {};

  const { rows: revByPlanRows } = await query(`
    SELECT COALESCE(plan_id, '?') AS plan, COALESCE(SUM(amount), 0)::float AS revenue
    FROM payments WHERE method = 'yookassa' GROUP BY plan_id
  `);
  const revenueByPlan = { trial: 0, base: 0, pro: 0, topup: 0 };
  for (const r of revByPlanRows) {
    if (r.plan in revenueByPlan) revenueByPlan[r.plan] = r.revenue;
    else if (String(r.plan).startsWith('topup_')) revenueByPlan.topup += r.revenue;
  }

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

  // ═══ Тренд за 14 дней (выручка + генерации + новые юзеры) ═══
  const [{ rows: trendPay }, { rows: trendGen }, { rows: trendUsers }] = await Promise.all([
    query(`
      SELECT created_at::date AS d, COALESCE(SUM(amount), 0)::float AS v
      FROM payments WHERE method = 'yookassa' AND created_at >= CURRENT_DATE - INTERVAL '${TREND_DAYS - 1} days'
      GROUP BY d`),
    query(`
      SELECT created_at::date AS d, COUNT(*)::int AS v
      FROM generations WHERE created_at >= CURRENT_DATE - INTERVAL '${TREND_DAYS - 1} days'
      GROUP BY d`),
    query(`
      SELECT created_at::date AS d, COUNT(*)::int AS v
      FROM users WHERE created_at >= CURRENT_DATE - INTERVAL '${TREND_DAYS - 1} days'
      GROUP BY d`),
  ]);
  const dayKey = (dt) => (dt instanceof Date ? dt.toISOString().slice(0, 10) : String(dt).slice(0, 10));
  const revByDay = Object.fromEntries(trendPay.map(r => [dayKey(r.d), Number(r.v) || 0]));
  const genByDay = Object.fromEntries(trendGen.map(r => [dayKey(r.d), Number(r.v) || 0]));
  const usrByDay = Object.fromEntries(trendUsers.map(r => [dayKey(r.d), Number(r.v) || 0]));
  const trend = [];
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    trend.push({
      date: key,
      revenue: revByDay[key] || 0,
      generations: genByDay[key] || 0,
      newUsers: usrByDay[key] || 0,
    });
  }

  // ═══ Сводка по планам ═══
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
  if (planCounts.none < 0) planCounts.none = 0;

  const gen = genRows[0] || {};
  const generationsByMode = { fashion: 0, product: 0, calibration: 0, autocatalog: 0 };
  for (const row of genByModeRows) {
    generationsByMode[row.type] = parseInt(row.count || 0, 10);
  }

  // ═══ Производные метрики ═══
  const mrr = Math.round(
    (planCounts.base || 0) * PLAN_MONTHLY_PRICE.base +
    (planCounts.pro || 0) * PLAN_MONTHLY_PRICE.pro
  );
  const payingUsers = pay.paying_users || 0;
  const revenueTotal = Math.round(pay.revenue_total || 0);
  const arppu = payingUsers > 0 ? Math.round(revenueTotal / payingUsers) : 0;
  const generationsTotal = parseInt(gen.total || 0, 10);
  const generationsFailed = parseInt(gen.failed || 0, 10);
  const successRate = generationsTotal > 0
    ? Math.round(((generationsTotal - generationsFailed) / generationsTotal) * 100)
    : 100;

  const result = {
    // Пользователи
    totalUsers,
    activeUsers,
    payingUsers,
    newUsersToday,
    newUsersWeek,
    planCounts,
    conversionRate: totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0,
    payingConversion: totalUsers > 0 ? Math.round((payingUsers / totalUsers) * 100) : 0,

    // Генерации
    generationsTotal,
    generationsFailed,
    successRate,
    generationsFashion: generationsByMode.fashion || 0,
    generationsProduct: generationsByMode.product || 0,
    generationsCalibration: generationsByMode.calibration || 0,
    generationsToday: parseInt(gen.today || 0, 10),
    generationsWeek: parseInt(gen.week || 0, 10),
    generationsFromCredits: parseInt(gen.credits_used || 0, 10),
    generationsLogCount: generationsTotal,
    generationsByMode,

    // Деньги
    realPaymentsCount: pay.real_payments || 0,
    revenueTotal,
    revenueWeek: Math.round(pay.revenue_week || 0),
    revenueToday: Math.round(pay.revenue_today || 0),
    revenueMonth: Math.round(pay.revenue_month || 0),
    revenueSubscriptions: Math.round(pay.revenue_subs || 0),
    revenueTopups: Math.round(pay.revenue_topups || 0),
    revenueByPlan,
    mrr,
    arppu,

    // Гранты админа
    adminGrantsCount: pay.admin_grants || 0,
    grantedCreditsTotal: pay.granted_credits || 0,

    // Ленты и тренд
    trend,
    recentPayments,
    recentAdminGrants,

    // Бот (заглушки — бот не логирует активации отдельно)
    botStatus: 'active',
    botUsername: 'seller_studio_bot',

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
