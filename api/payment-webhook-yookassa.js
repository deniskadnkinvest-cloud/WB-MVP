// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// POST /api/payment-webhook-yookassa
// РџСЂРёРЅРёРјР°РµС‚ РІРµР±С…СѓРєРё РѕС‚ Р®Kassa РѕР± СѓСЃРїРµС€РЅРѕР№ РѕРїР»Р°С‚Рµ С‚Р°СЂРёС„Р°
// РСЃРїРѕР»СЊР·СѓРµС‚ PostgreSQL РІРјРµСЃС‚Рѕ Auth PostgreSQL
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ

import { pool } from './_db.js';
import { alertOnPayment, alertOnError } from './_admin-alerts.js';

// РљРѕР»РёС‡РµСЃС‚РІРѕ РєСЂРµРґРёС‚РѕРІ РїРѕ С‚Р°СЂРёС„РЅС‹Рј РїР»Р°РЅР°Рј
const PLAN_CREDITS = {
  trial: 25,
  base: 100,
  pro: 1000,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // в•ђв•ђв•ђ SECURITY: Verify request comes from YooKassa IPs в•ђв•ђв•ђ
  // РџРѕР»РЅС‹Р№ СЃРїРёСЃРѕРє IP: https://yookassa.ru/developers/using-api/webhooks
  // IPv4: 185.71.76.0/27, 185.71.77.0/27, 77.75.153.0/25, 77.75.154.128/25
  const YOOKASSA_IP_PREFIXES = ['185.71.76.', '185.71.77.', '77.75.153.', '77.75.154.'];
  const clientIp = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '').split(',')[0].trim();
  if (!YOOKASSA_IP_PREFIXES.some(prefix => clientIp.startsWith(prefix))) {
    console.warn(`вљ пёЏ [YooKassa Webhook] Rejected non-YooKassa IP: ${clientIp}`);
    return res.status(403).json({ ok: false, error: 'Forbidden: invalid source IP' });
  }

  const { event, object } = req.body || {};

  // Р®Kassa С€Р»С‘С‚ РїРёРЅРі-Р·Р°РїСЂРѕСЃС‹ РґР»СЏ РїСЂРѕРІРµСЂРєРё РІРµР±С…СѓРєР°
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

  // Р•СЃР»Рё РІ metadata РµСЃС‚СЊ telegramId вЂ” РёСЃРїРѕР»СЊР·СѓРµРј СЃС‚Р°Р±РёР»СЊРЅС‹Р№ UID tg_{telegramId}
  // Р­С‚Рѕ РіР°СЂР°РЅС‚РёСЂСѓРµС‚ Р·Р°РїРёСЃСЊ РїРѕРґРїРёСЃРєРё РЅР° РїСЂР°РІРёР»СЊРЅС‹Р№ РїСѓС‚СЊ, РґР°Р¶Рµ РµСЃР»Рё uid РІ metadata СЃС‚Р°СЂС‹Р№
  if (telegramId) {
    const stableUid = `tg_${telegramId}`;
    if (uid !== stableUid) {
      console.log(`[Yookassa webhook] Resolving UID: ${uid} в†’ ${stableUid} (via telegramId)`);
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
  const now = new Date();
  let expiresAt = null;

  if (planId !== 'trial') {
    expiresAt = new Date(now);
    expiresAt.setMonth(expiresAt.getMonth() + 1);
  }

  // РР·РІР»РµРєР°РµРј telegramId РёР· UID (С„РѕСЂРјР°С‚: tg_{telegramId})
  const resolvedTelegramId = telegramId || (uid.startsWith('tg_') ? uid.slice(3) : null);
  if (!resolvedTelegramId) {
    console.error('[Yookassa webhook] Cannot resolve telegramId from UID:', uid);
    return res.status(200).json({ ok: true });
  }

  const paymentId = object.id;
  const isSubscription = planId !== 'trial';
  const paymentMethodId = (isSubscription && object.payment_method?.saved)
    ? object.payment_method.id
    : null;

  // РСЃРїРѕР»СЊР·СѓРµРј С‚СЂР°РЅР·Р°РєС†РёСЋ PostgreSQL РґР»СЏ Р°С‚РѕРјР°СЂРЅРѕСЃС‚Рё
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. РќР°С…РѕРґРёРј РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РїРѕ telegram_id (РёР»Рё СЃРѕР·РґР°С‘Рј РµСЃР»Рё РЅРµС‚)
    const { rows: userRows } = await client.query(
      `INSERT INTO users (telegram_id, email, role)
       VALUES ($1, $2, 'user')
       ON CONFLICT (telegram_id) DO UPDATE SET telegram_id = EXCLUDED.telegram_id
       RETURNING id`,
      [resolvedTelegramId, `tg_${resolvedTelegramId}@telegram.user`]
    );
    const userId = userRows[0].id;

    // 2. в•ђв•ђв•ђ IDEMPOTENCY: РџСЂРѕРІРµСЂСЏРµРј, РЅРµ РѕР±СЂР°Р±РѕС‚Р°РЅ Р»Рё СѓР¶Рµ СЌС‚РѕС‚ РїР»Р°С‚С‘Р¶ в•ђв•ђв•ђ
    const { rows: existingPayments } = await client.query(
      `SELECT id FROM payments WHERE yookassa_payment_id = $1`,
      [paymentId]
    );

    if (existingPayments.length > 0) {
      await client.query('ROLLBACK');
      console.log(`[YooKassa] Duplicate webhook ignored: ${paymentId}`);
      return res.status(200).json({ ok: true, message: 'already processed' });
    }

    // 3. РћР±РЅРѕРІР»СЏРµРј/СЃРѕР·РґР°С‘Рј РїРѕРґРїРёСЃРєСѓ
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

    // 4. Р—Р°РїРёСЃС‹РІР°РµРј РїР»Р°С‚С‘Р¶ РІ С‚Р°Р±Р»РёС†Сѓ payments
    await client.query(
      `INSERT INTO payments (user_id, plan_id, method, yookassa_payment_id, amount, currency, paid_at)
       VALUES ($1, $2, 'yookassa', $3, $4, $5, $6)`,
      [
        userId,
        planId,
        paymentId,
        parseFloat(object.amount.value),
        object.amount.currency || 'RUB',
        now.toISOString(),
      ]
    );

    await client.query('COMMIT');

    console.log(`[Yookassa webhook] вњ… Plan activated: ${planId} for user ${uid}, credits: ${credits}`);

    // РћС‚РїСЂР°РІР»СЏРµРј СѓРІРµРґРѕРјР»РµРЅРёРµ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂСѓ
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
