// ═══════════════════════════════════════════════════════════════
// POST /api/payment-webhook-yookassa
// Принимает вебхуки от ЮKassa об успешной оплате тарифа
// PostgreSQL является единственным источником истины для платежей и тарифов.
// ═══════════════════════════════════════════════════════════════

import { pool } from './_db.js';
import { alertOnPayment, alertOnError } from './_admin-alerts.js';

// Количество кредитов по тарифным планам и пополнениям
const PLAN_CREDITS = {
  trial: 10,
  base: 100,
  pro: 350,
  
  topup_5: 5,
  topup_10_trial: 10,
  topup_25: 25,
  topup_10: 10,
  topup_30: 30,
  topup_100: 100,
  topup_50: 50,
  topup_150: 150,
  topup_350: 350,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // ═══ SECURITY: Verify request comes from YooKassa IPs ═══
  // Полный список IP: https://yookassa.ru/developers/using-api/webhooks
  // IPv4: 185.71.76.0/27, 185.71.77.0/27, 77.75.153.0/25, 77.75.154.128/25
  const YOOKASSA_IP_PREFIXES = ['185.71.76.', '185.71.77.', '77.75.153.', '77.75.154.'];
  
  // Extract real IP safely: Traefik appends the real client IP to the END of x-forwarded-for.
  // Attackers can spoof the beginning of the header, so we MUST take the rightmost IP.
  const forwardedIps = (req.headers['x-forwarded-for'] || '').split(',').map(ip => ip.trim()).filter(Boolean);
  const clientIp = forwardedIps.length > 0 ? forwardedIps[forwardedIps.length - 1] : (req.headers['x-real-ip'] || req.socket?.remoteAddress || '');
  
  if (!YOOKASSA_IP_PREFIXES.some(prefix => clientIp.startsWith(prefix))) {
    console.warn(`⚠️ [YooKassa Webhook] Rejected non-YooKassa IP: ${clientIp} (X-Forwarded-For: ${req.headers['x-forwarded-for']})`);
    return res.status(403).json({ ok: false, error: 'Forbidden: invalid source IP' });
  }

  const { event, object } = req.body || {};

  // ЮKassa шлёт пинг-запросы для проверки вебхука
  if (event === 'ping') {
    return res.status(200).json({ ok: true });
  }

  if (event !== 'payment.succeeded' || !object) {
    console.log(`[Yookassa webhook] Ignored event: ${event}`);
    return res.status(200).json({ ok: true });
  }

  const status = object.status;
  const metadata = object.metadata || {};
  let { uid, planId } = metadata;
  const telegramId = metadata.telegramId;

  // Если в metadata есть telegramId — используем стабильный UID tg_{telegramId}
  // Это гарантирует запись подписки на правильный путь, даже если uid в metadata старый
  if (telegramId) {
    const stableUid = `tg_${telegramId}`;
    if (uid !== stableUid) {
      console.log(`[Yookassa webhook] Resolving UID: ${uid} → ${stableUid} (via telegramId)`);
      uid = stableUid;
    }
  }

  if (status !== 'succeeded') {
    console.log(`[Yookassa webhook] Ignored status: ${status} for payment ${object.id}`);
    return res.status(200).json({ ok: true });
  }

  if (!uid || !planId || !PLAN_CREDITS[planId]) {
    console.error('[Yookassa webhook] Invalid metadata in payment:', object.id, metadata);
    return res.status(200).json({ ok: true });
  }

  const credits = PLAN_CREDITS[planId];
  const isTopUp = planId.startsWith('topup_');
  const now = new Date();
  let expiresAt = null;

  if (planId !== 'trial' && !isTopUp) {
    expiresAt = new Date(now);
    expiresAt.setMonth(expiresAt.getMonth() + 1);
  }

  // Извлекаем telegramId из UID (формат: tg_{telegramId})
  const resolvedTelegramId = telegramId || (uid.startsWith('tg_') ? uid.slice(3) : null);
  if (!resolvedTelegramId) {
    console.error('[Yookassa webhook] Cannot resolve telegramId from UID:', uid);
    return res.status(200).json({ ok: true });
  }

  const paymentId = object.id;
  const isSubscription = planId !== 'trial' && !isTopUp;
  const paymentMethodId = (isSubscription && object.payment_method?.saved)
    ? object.payment_method.id
    : null;

  // Используем транзакцию PostgreSQL для атомарности
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Находим пользователя по telegram_id (или создаём если нет)
    const { rows: userRows } = await client.query(
      `INSERT INTO users (telegram_id, email, role)
       VALUES ($1, $2, 'user')
       ON CONFLICT (telegram_id) DO UPDATE SET telegram_id = EXCLUDED.telegram_id
       RETURNING id`,
      [resolvedTelegramId, `tg_${resolvedTelegramId}@telegram.user`]
    );
    const userId = userRows[0].id;

    // 2. ═══ IDEMPOTENCY: Проверяем, не обработан ли уже этот платёж ═══
    const { rows: existingPayments } = await client.query(
      `SELECT id FROM payments WHERE yookassa_payment_id = $1`,
      [paymentId]
    );

    if (existingPayments.length > 0) {
      await client.query('ROLLBACK');
      console.log(`[YooKassa] Duplicate webhook ignored: ${paymentId}`);
      return res.status(200).json({ ok: true, message: 'already processed' });
    }

    // 3. Обновляем/создаём подписку
    if (isTopUp) {
      const { rows: subRows } = await client.query(
        `SELECT id FROM subscriptions WHERE user_id = $1`,
        [userId]
      );
      if (subRows.length === 0) {
        await client.query(
          `INSERT INTO subscriptions (user_id, plan_name, credits, credits_total, status, expires_at, auto_renew)
           VALUES ($1, 'none', $2, $2, 'active', NULL, false)`,
          [userId, credits]
        );
      } else {
        await client.query(
          `UPDATE subscriptions 
           SET credits = COALESCE(credits, 0) + $1,
               credits_total = COALESCE(credits_total, 0) + $1,
               updated_at = NOW()
           WHERE user_id = $2`,
          [credits, userId]
        );
      }
    } else {
      await client.query(
        `INSERT INTO subscriptions (user_id, plan_name, credits, credits_total, status, expires_at, auto_renew, yookassa_payment_method_id)
         VALUES ($1, $2, $3, $4, 'active', $5, $6, $7)
         ON CONFLICT (user_id) DO UPDATE SET
           plan_name = EXCLUDED.plan_name,
           credits = EXCLUDED.credits,
           credits_total = EXCLUDED.credits_total,
           status = 'active',
           expires_at = EXCLUDED.expires_at,
           auto_renew = EXCLUDED.auto_renew,
           yookassa_payment_method_id = COALESCE(EXCLUDED.yookassa_payment_method_id, subscriptions.yookassa_payment_method_id),
           updated_at = NOW()`,
        [
          userId,
          planId,
          credits,
          credits,
          expiresAt,
          isSubscription, // auto_renew
          paymentMethodId,
        ]
      );
    }

    // 4. Записываем платёж в таблицу payments
    await client.query(
      `INSERT INTO payments (user_id, plan_id, method, yookassa_payment_id, amount, credits_amount, currency, paid_at)
       VALUES ($1, $2, 'yookassa', $3, $4, $5, 'RUB', $6)`,
      [
        userId,
        planId,
        paymentId,
        parseFloat(object.amount.value),
        credits,
        now.toISOString(),
      ]
    );

    await client.query('COMMIT');

    console.log(`[Yookassa webhook] ✅ Plan activated: ${planId} for user ${uid}, credits: ${credits}`);

    // Отправляем уведомление администратору
    alertOnPayment(planId, uid, parseFloat(object.amount.value)).catch(() => {});

    return res.status(200).json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[Yookassa webhook] PostgreSQL transaction error:', err);
    alertOnError(err, `yookassa-webhook PostgreSQL write [${planId}:${uid}]`).catch(() => {});
    return res.status(500).json({ ok: false, error: err.message });
  } finally {
    client.release();
  }
}
