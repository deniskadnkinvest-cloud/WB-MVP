// ═══════════════════════════════════════════════════════════════
// GET/POST /api/subscription
// Управление подписками пользователей (замена Firestore)
// ═══════════════════════════════════════════════════════════════

import jwt from 'jsonwebtoken';
import { query } from './_db.js';

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

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const decoded = verifyToken(req);
  if (!decoded) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const uid = decoded.uid; // tg_{telegramId}

  try {
    // ═══ GET — Получить текущую подписку ═══
    if (req.method === 'GET') {
      // Найти пользователя
      const userResult = await query(
        `SELECT id, telegram_id FROM users WHERE telegram_id = $1`,
        [uid]
      );

      if (userResult.rows.length === 0) {
        // Пользователь не найден — вернуть дефолтную подписку
        return res.json({
          ok: true,
          data: {
            plan: 'none',
            credits: 0,
            creditsTotal: 0,
            planActivatedAt: null,
            planExpiresAt: null,
            subscriptionStatus: 'inactive',
            autoRenew: false,
            payments: [],
          },
        });
      }

      const userId = userResult.rows[0].id;

      // Получить подписку
      const subResult = await query(
        `SELECT * FROM subscriptions WHERE user_id = $1`,
        [userId]
      );

      if (subResult.rows.length === 0) {
        return res.json({
          ok: true,
          data: {
            plan: 'none',
            credits: 0,
            creditsTotal: 0,
            planActivatedAt: null,
            planExpiresAt: null,
            subscriptionStatus: 'inactive',
            autoRenew: false,
            payments: [],
          },
        });
      }

      const sub = subResult.rows[0];

      // Проверяем истечение срока для месячных планов
      if (sub.expires_at && !sub.granted_by_admin && !sub.auto_renew) {
        const expiresDate = new Date(sub.expires_at);
        if (expiresDate < new Date()) {
          await query(
            `UPDATE subscriptions SET plan_name = 'none', credits = 0, status = 'expired' WHERE user_id = $1`,
            [userId]
          );
          return res.json({
            ok: true,
            data: {
              plan: 'none',
              credits: 0,
              creditsTotal: sub.credits_total || 0,
              subscriptionStatus: 'expired',
              autoRenew: false,
              payments: await getPayments(userId),
            },
          });
        }
      }

      // Получить историю платежей
      const payments = await getPayments(userId);

      return res.json({
        ok: true,
        data: {
          plan: sub.plan_name || 'none',
          credits: sub.credits || 0,
          creditsTotal: sub.credits_total || 0,
          planActivatedAt: sub.created_at?.toISOString(),
          planExpiresAt: sub.expires_at?.toISOString() || null,
          subscriptionStatus: sub.status || 'inactive',
          autoRenew: sub.auto_renew || false,
          yookassaPaymentMethodId: sub.yookassa_payment_method_id || null,
          grantedByAdmin: sub.granted_by_admin || false,
          payments,
        },
      });
    }

    // ═══ POST — Активировать план (после оплаты) ═══
    if (req.method === 'POST') {
      const { planId } = req.body || {};

      const PLAN_CREDITS = { trial: 25, base: 100, pro: 1000 };
      const credits = PLAN_CREDITS[planId];

      if (!credits) {
        return res.status(400).json({ ok: false, error: `Unknown plan: ${planId}` });
      }

      const userResult = await query(
        `SELECT id FROM users WHERE telegram_id = $1`,
        [uid]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ ok: false, error: 'User not found' });
      }

      const userId = userResult.rows[0].id;
      const now = new Date();
      let expiresAt = null;

      if (planId !== 'trial') {
        expiresAt = new Date(now);
        expiresAt.setMonth(expiresAt.getMonth() + 1);
      }

      // Upsert подписки
      await query(
        `INSERT INTO subscriptions (user_id, plan_name, credits, credits_total, expires_at, status, auto_renew)
         VALUES ($1, $2, $3, $4, $5, 'active', $6)
         ON CONFLICT (user_id) DO UPDATE SET
           plan_name = $2, credits = $3, credits_total = $4,
           expires_at = $5, status = 'active', auto_renew = $6`,
        [userId, planId, credits, credits, expiresAt, planId !== 'trial']
      );

      return res.json({ ok: true, data: { plan: planId, credits } });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('[subscription] Error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

async function getPayments(userId) {
  const result = await query(
    `SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows.map((p) => ({
    planId: p.plan_id,
    method: p.method,
    yookassaPaymentId: p.yookassa_payment_id,
    amount: parseFloat(p.amount),
    currency: p.currency,
    date: p.created_at?.toISOString(),
    ...(p.metadata || {}),
  }));
}
