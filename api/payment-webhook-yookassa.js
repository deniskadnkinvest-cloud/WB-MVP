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
  const { uid, planId } = metadata;

  if (status !== 'succeeded') {
    console.log(`[Yookassa webhook] Ignored status: ${status} for payment ${object.id}`);
    return res.status(200).json({ ok: true });
  }

  if (!uid || !planId || !PLAN_CREDITS[planId]) {
    console.error('[Yookassa webhook] Invalid metadata in payment:', object.id, metadata);
    return res.status(200).json({ ok: true }); // Отвечаем 200, чтобы ЮKassa не слала повторно сломанный запрос
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
    
    // Записываем/обновляем подписку в Firebase Firestore
    await ref.set({
      plan: planId,
      credits: credits,
      creditsTotal: credits,
      planActivatedAt: FieldValue.serverTimestamp(),
      planExpiresAt: expiresAt,
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
