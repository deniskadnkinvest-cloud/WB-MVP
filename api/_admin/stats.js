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
  const { rows: subs } = await query('SELECT count(*) as count, plan FROM subscriptions GROUP BY plan');
  
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

  const result = {
    totalUsers,
    activeUsers,
    planCounts,
    conversionRate: totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0,
    generationsTotal: 0,
    generationsFashion: 0,
    generationsProduct: 0,
    generationsCalibration: 0,
    generationsToday: 0,
    generationsFromCredits: 0,
    generationsLogCount: 0,
    generationsByMode: { fashion: 0, product: 0, calibration: 0, autocatalog: 0 },
    botStatus: 'active',
    botUsername: 'seller_studio_bot',
    botActivations: 0,
    botActivationsToday: 0,
    realPaymentsCount: 0,
    starsTotal: 0,
    starsWeek: 0,
    starsToday: 0,
    revenueByPlan: { trial: 0, base: 0, pro: 0 },
    testPaymentsCount: 0,
    testStarsTotal: 0,
    adminGrantsCount: 0,
    grantedCreditsTotal: 0,
    recentPayments: [],
    recentTestPayments: [],
    recentAdminGrants: [],
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
