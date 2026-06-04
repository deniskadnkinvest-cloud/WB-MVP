// ═══════════════════════════════════════════════════════════════
// GET /api/admin/stats
// Возвращает статистику из Firestore для Command Center
//
// ОПТИМИЗАЦИИ:
//   1. collectionGroup('subscription') — один запрос вместо N+1
//   2. In-memory кеш с TTL 30 сек — горячие запросы < 100ms
//   3. Параллельные запросы (global + daily + users одновременно)
// ═══════════════════════════════════════════════════════════════

import { ensureFirebaseAdmin } from '../_firebase-admin.js';
import { getFirestore } from 'firebase-admin/firestore';
import { checkAdminAuth } from './verify.js';

ensureFirebaseAdmin();
const db = getFirestore();

// ── In-memory кеш (живёт пока жив Vercel instance) ──
let _cache = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 30_000; // 30 секунд

/**
 * Определяет, тестовый ли платёж
 */
function isTestPayment(p) {
  if (p.isTest === true) return true;
  if (p.method === 'admin_grant') return false; // admin grant — не тестовый
  if (!p.providerChargeId || p.providerChargeId === '') return true;
  if (typeof p.providerChargeId === 'string' && p.providerChargeId.startsWith('_')) return true;
  return false;
}

/**
 * Определяет, является ли платёж admin grant (не считается в revenue)
 */
function isAdminGrant(p) {
  return p.method === 'admin_grant' || p.isGranted === true || p.providerChargeId === 'ADMIN_GRANT';
}

async function fetchStats() {
  const now = Date.now();
  if (_cache && (now - _cacheTime) < CACHE_TTL_MS) {
    return _cache;
  }

  const today = new Date().toISOString().slice(0, 10);

  // ── Параллельные запросы ──
  const [globalSnap, dailySnap, subSnaps, userRefs] = await Promise.all([
    db.doc('_stats/global').get(),
    db.doc(`_stats/daily/${today}/counts`).get(),
    db.collectionGroup('subscription').where('__name__', '>=', '').get(), // все subscription/current
    db.collection('users').listDocuments(),
  ]);

  const g = globalSnap.exists ? globalSnap.data() : {};
  const d = dailySnap.exists ? dailySnap.data() : {};
  const totalUsers = userRefs.length;

  // ── Обработка подписок (один проход) ──
  const planCounts = { none: 0, trial: 0, base: 0, pro: 0 };
  const activeUsersList = [];
  const realPayments = [];
  const testPayments = [];
  const adminGrants = [];
  const revenueByPlan = { trial: 0, base: 0, pro: 0 };
  let grantedCreditsTotal = 0;

  // Считаем юзеров без подписки
  const usersWithSub = new Set();

  subSnaps.forEach(docSnap => {
    // docSnap.ref.path = "users/{uid}/subscription/current"
    if (docSnap.ref.id !== 'current') return; // только current

    const uid = docSnap.ref.parent.parent?.id;
    if (!uid) return;
    usersWithSub.add(uid);

    const sub = docSnap.data();
    const plan = sub?.plan || 'none';

    if (planCounts[plan] !== undefined) planCounts[plan]++;
    else planCounts.none++;

    if (plan !== 'none') {
      const creditsUsed = (sub.creditsTotal || 0) - (sub.credits || 0);
      activeUsersList.push({
        uid,
        plan,
        credits: sub.credits || 0,
        creditsTotal: sub.creditsTotal || 0,
        creditsUsed,
        grantedByAdmin: sub.grantedByAdmin || false,
        planActivatedAt: sub.planActivatedAt?.toDate?.()?.toISOString() || null,
        planExpiresAt: sub.planExpiresAt?.toDate?.()?.toISOString() || null,
      });
    }

    // Платежи
    if (Array.isArray(sub.payments)) {
      for (const p of sub.payments) {
        const entry = {
          uid,
          planId: p.planId,
          stars: p.amount || 0,
          currency: p.currency || 'XTR',
          date: p.date,
          method: p.method || 'telegram_stars',
          providerChargeId: p.providerChargeId || null,
          isTest: isTestPayment(p),
          isGrant: isAdminGrant(p),
          note: p.note || '',
          grantedBy: p.grantedByName || null,
        };

        if (entry.isGrant) {
          adminGrants.push(entry);
          grantedCreditsTotal += entry.stars;
        } else if (entry.isTest) {
          testPayments.push(entry);
        } else {
          realPayments.push(entry);
          // Revenue по тарифам
          if (revenueByPlan[entry.planId] !== undefined) {
            revenueByPlan[entry.planId] += entry.stars;
          }
        }
      }
    }
  });

  // Юзеры без подписки = всего юзеров минус те, у кого есть subscription
  planCounts.none = totalUsers - usersWithSub.size;

  // Сортируем — новые первые
  const sortDesc = (a, b) => new Date(b.date || 0) - new Date(a.date || 0);
  realPayments.sort(sortDesc);
  testPayments.sort(sortDesc);
  adminGrants.sort(sortDesc);

  // ── Revenue ──
  const starsTotal = realPayments.reduce((s, p) => s + p.stars, 0);
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const starsWeek = realPayments.filter(p => new Date(p.date) > weekAgo).reduce((s, p) => s + p.stars, 0);
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const starsToday = realPayments.filter(p => new Date(p.date) >= todayStart).reduce((s, p) => s + p.stars, 0);

  // ── Генерации ──
  const generationsFromCredits = activeUsersList.reduce((s, u) => s + u.creditsUsed, 0);

  const result = {
    // Пользователи
    totalUsers,
    activeUsers: activeUsersList.length,
    planCounts,
    conversionRate: totalUsers > 0 ? Math.round((activeUsersList.length / totalUsers) * 100) : 0,

    // Генерации (атомарные счётчики)
    generationsTotal: g.generationsTotal || 0,
    generationsFashion: g.generationsFashion || 0,
    generationsProduct: g.generationsProduct || 0,
    generationsCalibration: g.generationsCalibration || 0,
    generationsToday: d.generationsTotal || 0,
    generationsFromCredits,
    generationsByMode: {
      fashion: g.generationsFashion || 0,
      product: g.generationsProduct || 0,
      calibration: g.generationsCalibration || 0,
    },

    // Бот
    botActivations: g.botActivations || 0,
    botActivationsToday: d.botActivations || 0,

    // Платежи — РЕАЛЬНЫЕ
    realPaymentsCount: realPayments.length,
    starsTotal,
    starsWeek,
    starsToday,
    revenueByPlan,

    // Платежи — ТЕСТОВЫЕ
    testPaymentsCount: testPayments.length,
    testStarsTotal: testPayments.reduce((s, p) => s + p.stars, 0),

    // Admin Grants
    adminGrantsCount: adminGrants.length,
    grantedCreditsTotal,

    // Списки
    recentPayments: realPayments.slice(0, 20),
    recentTestPayments: testPayments.slice(0, 20),
    recentAdminGrants: adminGrants.slice(0, 20),

    activeUsersList: activeUsersList
      .sort((a, b) => new Date(b.planActivatedAt || 0) - new Date(a.planActivatedAt || 0))
      .slice(0, 100),

    generatedAt: new Date().toISOString(),
  };

  // Кешируем
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
