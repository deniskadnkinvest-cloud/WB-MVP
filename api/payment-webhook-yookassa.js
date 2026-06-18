// ═══════════════════════════════════════════════════════════════
// POST /api/payment-webhook-yookassa
// Принимает вебхуки от ЮKassa об успешной оплате тарифа
// ═══════════════════════════════════════════════════════════════

import { ensureFirebaseAdmin } from './_firebase-admin.js';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { alertOnPayment, alertOnError } from './_admin-alerts.js';

// Init Firebase Admin
ensureFirebaseAdmin();
const db = getFirestore();

// Количество кредитов по тарифным планам
const PLAN_CREDITS = {
  trial: 25,
  base: 100,
  pro: 1000,
};

// Атомарный инкремент глобальной статистики
async function incrementCounter(field) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    await db.doc('_stats/global').set({ [field]: FieldValue.increment(1) }, { merge: true });
    await db.doc(`_stats/daily/${today}/counts`).set({ [field]: FieldValue.increment(1) }, { merge: true });
  } catch (e) {
    console.warn('[stats counter] yookassa webhook:', e.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // ═══ SECURITY: Verify request comes from YooKassa IPs ═══
  // Полный список IP: https://yookassa.ru/developers/using-api/webhooks
  // IPv4: 185.71.76.0/27, 185.71.77.0/27, 77.75.153.0/25, 77.75.154.128/25
  const YOOKASSA_IP_PREFIXES = ['185.71.76.', '185.71.77.', '77.75.153.', '77.75.154.'];
  const clientIp = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '').split(',')[0].trim();
  if (!YOOKASSA_IP_PREFIXES.some(prefix => clientIp.startsWith(prefix))) {
    console.warn(`⚠️ [YooKassa Webhook] Rejected non-YooKassa IP: ${clientIp}`);
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
  const now = new Date();
  let expiresAt = null;

  if (planId !== 'trial') {
    expiresAt = new Date(now);
    expiresAt.setMonth(expiresAt.getMonth() + 1);
  }

  try {
    const ref = db.doc(`users/${uid}/subscription/current`);

    // ═══ IDEMPOTENCY: Skip duplicate webhooks ═══
    const paymentId = object.id;
    const existingSnap = await ref.get();
    const existingPayments = existingSnap.data()?.payments || [];
    if (existingPayments.some(p => p.yookassaPaymentId === paymentId)) {
      console.log(`[YooKassa] Duplicate webhook ignored: ${paymentId}`);
      return res.status(200).json({ ok: true, message: 'already processed' });
    }

    const isSubscription = planId !== 'trial';
    const paymentMethodId = (isSubscription && object.payment_method?.saved)
      ? object.payment_method.id
      : null;
    
    // Записываем/обновляем подписку в Firebase Firestore
    await ref.set({
      plan: planId,
      credits: credits,
      creditsTotal: credits,
      planActivatedAt: FieldValue.serverTimestamp(),
      planExpiresAt: expiresAt,
      subscriptionStatus: 'active',
      ...(isSubscription ? {
        autoRenew: true,
        yookassaPaymentMethodId: paymentMethodId || FieldValue.delete(),
      } : {
        autoRenew: false,
        yookassaPaymentMethodId: FieldValue.delete(),
      }),
      payments: FieldValue.arrayUnion({
        planId,
        method: 'yookassa',
        yookassaPaymentId: object.id,
        amount: parseFloat(object.amount.value), // сумма в рублях
        currency: object.amount.currency,        // "RUB"
        date: now.toISOString(),
      }),
    }, { merge: true });

    console.log(`[Yookassa webhook] ✅ Plan activated: ${planId} for user ${uid}, credits: ${credits}`);

    // Отправляем уведомление администратору
    alertOnPayment(planId, uid, parseFloat(object.amount.value)).catch(() => {});

    // Обновляем счетчики статистики
    incrementCounter('paymentsTotal').catch(() => {});
    incrementCounter(`payments_${planId}`).catch(() => {});

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[Yookassa webhook] Firestore write error:', err);
    alertOnError(err, `yookassa-webhook Firestore write [${planId}:${uid}]`).catch(() => {});
    return res.status(500).json({ ok: false, error: err.message });
  }
}
