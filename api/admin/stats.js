// ═══════════════════════════════════════════════════════════════
// GET /api/admin/stats
// Возвращает реальную статистику из Firestore для Command Center
// Данные:
//   _stats/global          — атомарные счётчики (генерации, активации)
//   _stats/daily/YYYY-MM-DD — ежедневные счётчики
//   users/*/subscription   — подписки и платежи
// ═══════════════════════════════════════════════════════════════

import { ensureFirebaseAdmin } from '../_firebase-admin.js';
import { getFirestore } from 'firebase-admin/firestore';
import { checkAdminAuth } from './verify.js';

ensureFirebaseAdmin();
const db = getFirestore();

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
    // ── 1. Глобальные счётчики ──
    const globalSnap = await db.doc('_stats/global').get();
    const g = globalSnap.exists ? globalSnap.data() : {};

    // ── 2. Сегодня ──
    const today = new Date().toISOString().slice(0, 10);
    const dailySnap = await db.doc(`_stats/daily/${today}/counts`).get();
    const d = dailySnap.exists ? dailySnap.data() : {};

    // ── 3. Пользователи и подписки ──
    const userRefs = await db.collection('users').listDocuments();
    const totalUsers = userRefs.length;

    const planCounts = { none: 0, trial: 0, base: 0, pro: 0 };
    const activeUsersList = [];
    const allPayments = [];      // все платежи
    const realPayments = [];     // только реальные
    const testPayments = [];     // только тестовые

    const batchSize = 50;
    for (let i = 0; i < userRefs.length; i += batchSize) {
      const batch = userRefs.slice(i, i + batchSize);
      await Promise.all(batch.map(async (userRef) => {
        try {
          const subSnap = await userRef.collection('subscription').doc('current').get();
          if (!subSnap.exists) { planCounts.none++; return; }

          const sub = subSnap.data();
          const plan = sub?.plan || 'none';
          if (planCounts[plan] !== undefined) planCounts[plan]++;
          else planCounts.none++;

          if (plan !== 'none') {
            const creditsUsed = (sub.creditsTotal || 0) - (sub.credits || 0);
            activeUsersList.push({
              uid: userRef.id,
              plan,
              credits: sub.credits || 0,
              creditsTotal: sub.creditsTotal || 0,
              creditsUsed,
              planActivatedAt: sub.planActivatedAt?.toDate?.()?.toISOString() || null,
              planExpiresAt: sub.planExpiresAt?.toDate?.()?.toISOString() || null,
            });
          }

          // Собираем платежи
          if (Array.isArray(sub.payments)) {
            for (const p of sub.payments) {
              const entry = {
                uid: userRef.id,
                planId: p.planId,
                stars: p.amount || 0,
                currency: p.currency || 'XTR',
                date: p.date,
                method: p.method || 'telegram_stars',
                telegramChargeId: p.telegramChargeId || null,
                providerChargeId: p.providerChargeId || null,
                isTest: p.isTest === true,
              };
              allPayments.push(entry);
              if (entry.isTest) testPayments.push(entry);
              else realPayments.push(entry);
            }
          }
        } catch { planCounts.none++; }
      }));
    }

    // Сортируем — новые первые
    const sortDesc = (a, b) => new Date(b.date) - new Date(a.date);
    allPayments.sort(sortDesc);
    realPayments.sort(sortDesc);
    testPayments.sort(sortDesc);

    // ── 4. Revenue только по РЕАЛЬНЫМ платежам ──
    const starsTotal = realPayments.reduce((s, p) => s + p.stars, 0);

    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    const starsWeek = realPayments.filter(p => new Date(p.date) > weekAgo).reduce((s, p) => s + p.stars, 0);

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const starsToday = realPayments.filter(p => new Date(p.date) >= todayStart).reduce((s, p) => s + p.stars, 0);

    // ── 5. Генерации из creditsUsed (аппроксимация до момента подключения счётчиков) ──
    const generationsFromCredits = activeUsersList.reduce((s, u) => s + u.creditsUsed, 0);

    return res.status(200).json({
      ok: true,
      data: {
        // Пользователи
        totalUsers,
        activeUsers: activeUsersList.length,
        planCounts,

        // Генерации (атомарные счётчики — растут с момента деплоя обновления)
        generationsTotal: g.generationsTotal || 0,
        generationsFashion: g.generationsFashion || 0,
        generationsProduct: g.generationsProduct || 0,
        generationsCalibration: g.generationsCalibration || 0,
        generationsToday: d.generationsTotal || 0,
        generationsFromCredits,   // аппроксимация по кредитам

        // Бот
        botActivations: g.botActivations || 0,
        botActivationsToday: d.botActivations || 0,

        // Платежи — РЕАЛЬНЫЕ (без тестовых)
        realPaymentsCount: realPayments.length,
        starsTotal,
        starsWeek,
        starsToday,

        // Платежи — ТЕСТОВЫЕ (отдельно)
        testPaymentsCount: testPayments.length,
        testStarsTotal: testPayments.reduce((s, p) => s + p.stars, 0),

        // Списки (последние 20 каждого типа)
        recentPayments: realPayments.slice(0, 20),
        recentTestPayments: testPayments.slice(0, 20),

        activeUsersList: activeUsersList
          .sort((a, b) => new Date(b.planActivatedAt) - new Date(a.planActivatedAt))
          .slice(0, 100),

        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[admin/stats] Ошибка:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
