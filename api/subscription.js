// ═══════════════════════════════════════════════════════════════
// GET /api/subscription
// Только чтение подписки. Активация выполняется проверенным webhook оплаты.
// ИСТОЧНИК ИСТИНЫ: PostgreSQL (российский хостинг, ФЗ-152)
// ═══════════════════════════════════════════════════════════════

import jwt from 'jsonwebtoken';
import { query } from './_db.js';
import { getJwtSecret } from './_env.js';

function verifyToken(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  try {
    return jwt.verify(token, getJwtSecret());
  } catch {
    return null;
  }
}

/**
 * Найти пользователя в PostgreSQL.
 * Пробуем несколько стратегий:
 *   1. telegram_id = uid (прямое совпадение, напр. "tg_123456" или "123456")
 *   2. telegram_id = uid без "tg_" префикса (если uid = "tg_123456" → ищем "123456")
 *   3. email = decoded.email (для email OTP авторизации)
 * Возвращает { id, telegram_id } или null
 */
async function findUser(uid, email) {
  // Стратегия 1: прямой поиск по telegram_id
  let result = await query(
    `SELECT id, telegram_id FROM users WHERE telegram_id = $1 LIMIT 1`,
    [uid]
  );
  if (result.rows.length > 0) return result.rows[0];

  // Стратегия 2: uid с "tg_" префиксом → ищем без префикса
  if (uid && uid.startsWith('tg_')) {
    const rawId = uid.slice(3);
    result = await query(
      `SELECT id, telegram_id FROM users WHERE telegram_id = $1 LIMIT 1`,
      [rawId]
    );
    if (result.rows.length > 0) return result.rows[0];
  }

  // Стратегия 3: поиск по email
  if (email) {
    result = await query(
      `SELECT id, telegram_id FROM users WHERE email = $1 LIMIT 1`,
      [email]
    );
    if (result.rows.length > 0) return result.rows[0];
  }

  return null;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const decoded = verifyToken(req);
  if (!decoded) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const uid = decoded.uid;
  const email = decoded.email || null;

  try {
    // ═══ GET — Получить текущую подписку ═══
    if (req.method === 'GET') {
      const user = await findUser(uid, email);

      if (!user) {
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

      const userId = user.id;

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

      const planName = sub.plan_name || 'none';
      let credits = sub.credits || 0;
      let creditsTotal = sub.credits_total || 0;

      // Защита: автоматическое приведение к лимиту тарифа, если реальный лимит в БД больше стандартного
      // Topups and rollover credits are allowed to exceed standard limit

      return res.json({
        ok: true,
        data: {
          plan: planName,
          credits,
          creditsTotal,
          planActivatedAt: sub.created_at?.toISOString(),
          planExpiresAt: sub.expires_at?.toISOString() || null,
          subscriptionStatus: sub.status || 'inactive',
          autoRenew: sub.auto_renew || false,
          yookassaPaymentMethodId: sub.yookassa_payment_method_id || null,
          grantedByAdmin: sub.granted_by_admin || false,
          modelGensUsed: sub.model_gens_used || 0,
          payments,
        },
      });
    }
  } catch (err) {
    console.error('[subscription] Error:', err);
    return res.status(500).json({ ok: false, error: 'Не удалось загрузить подписку.' });
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
