// ═══════════════════════════════════════════════════════════════
// GET /api/admin/stats
// Возвращает агрегированную статистику из Firebase для Mission Control
// Требует заголовок X-Admin-Init-Data с Telegram initData
// ═══════════════════════════════════════════════════════════════

import { ensureFirebaseAdmin } from '../_firebase-admin.js';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyTelegramInitData, isAdminId } from './verify.js';

ensureFirebaseAdmin();
const db = getFirestore();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  // Проверка прав через admin access key
  const key = req.headers['x-admin-key'];
  const ADMIN_ACCESS_KEY = process.env.ADMIN_ACCESS_KEY;
  if (!key || !ADMIN_ACCESS_KEY || key !== ADMIN_ACCESS_KEY) {
    return res.status(403).json({ ok: false, error: 'Access denied' });
  }

  try {
    // ── Читаем всех юзеров (коллекция users) ──
    const usersSnap = await db.collection('users').listDocuments();
    const totalUsers = usersSnap.length;

    // ── Читаем подписки параллельно (батч по 50) ──
    const planCounts = { none: 0, trial: 0, base: 0, pro: 0 };
    const activeUsers = []; // юзеры с активным планом
    const recentPayments = [];

    // Берём данные из подписок (batch)
    const batchSize = 50;
    const batches = [];
    for (let i = 0; i < usersSnap.length; i += batchSize) {
      batches.push(usersSnap.slice(i, i + batchSize));
    }

    await Promise.all(
      batches.map(async (batch) => {
        await Promise.all(
          batch.map(async (userRef) => {
            try {
              const subSnap = await userRef.collection('subscription').doc('current').get();
              if (!subSnap.exists) {
                planCounts.none++;
                return;
              }
              const sub = subSnap.data();
              const plan = sub?.plan || 'none';

              if (planCounts[plan] !== undefined) planCounts[plan]++;
              else planCounts.none++;

              if (plan !== 'none') {
                activeUsers.push({
                  uid: userRef.id,
                  plan,
                  credits: sub.credits || 0,
                  creditsTotal: sub.creditsTotal || 0,
                  planActivatedAt: sub.planActivatedAt?.toDate?.()?.toISOString() || null,
                  planExpiresAt: sub.planExpiresAt?.toDate?.()?.toISOString() || null,
                });

                // Собираем платежи
                if (Array.isArray(sub.payments)) {
                  sub.payments.forEach(p => {
                    recentPayments.push({
                      uid: userRef.id,
                      planId: p.planId,
                      amount: p.amount,
                      currency: p.currency,
                      date: p.date,
                      method: p.method || 'telegram_stars',
                      telegramChargeId: p.telegramChargeId || null,
                    });
                  });
                }
              }
            } catch {
              planCounts.none++;
            }
          })
        );
      })
    );

    // Сортируем платежи по дате (новые первые)
    recentPayments.sort((a, b) => new Date(b.date) - new Date(a.date));

    // ── Метрики выручки ──
    const PLAN_PRICES = { trial: 500, base: 4990, pro: 15990 };
    const revenueTotal = recentPayments.reduce((sum, p) => {
      return sum + (PLAN_PRICES[p.planId] || 0);
    }, 0);

    // Платежи за последние 7 дней
    const week = new Date();
    week.setDate(week.getDate() - 7);
    const revenueWeek = recentPayments
      .filter(p => new Date(p.date) > week)
      .reduce((sum, p) => sum + (PLAN_PRICES[p.planId] || 0), 0);

    // Сегодняшние платежи
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const revenueToday = recentPayments
      .filter(p => new Date(p.date) >= today)
      .reduce((sum, p) => sum + (PLAN_PRICES[p.planId] || 0), 0);

    return res.status(200).json({
      ok: true,
      data: {
        totalUsers,
        activeUsers: activeUsers.length,
        planCounts,
        revenueTotal,
        revenueWeek,
        revenueToday,
        recentPayments: recentPayments.slice(0, 20),
        activeUsersList: activeUsers
          .sort((a, b) => new Date(b.planActivatedAt) - new Date(a.planActivatedAt))
          .slice(0, 100),
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[admin/stats] Error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
