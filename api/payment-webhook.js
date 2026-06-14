// ═══════════════════════════════════════════════════════════════
// POST /api/payment-webhook
// Принимает вебхук от Telegram Bot API
// Telegram шлёт сюда successful_payment события + команды /start /admin
// ═══════════════════════════════════════════════════════════════

import { ensureFirebaseAdmin } from './_firebase-admin.js';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { alertOnPayment, alertOnError } from './_admin-alerts.js';

const APP_URL = process.env.VITE_APP_URL || 'https://seller-studio-ai.ru';

// Whitelist Telegram ID для доступа к админке
const getAdminIds = () => {
  const raw = process.env.ADMIN_TELEGRAM_IDS || '';
  return raw.split(',').map(s => s.trim()).filter(Boolean).map(Number);
};

// Init Firebase Admin (once, via shared module)
ensureFirebaseAdmin();
const db = getFirestore();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Атомарный инкремент глобального счётчика в Firestore (фоновый, не блокирует)
async function incrementCounter(field) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    await db.doc('_stats/global').set({ [field]: FieldValue.increment(1) }, { merge: true });
    await db.doc(`_stats/daily/${today}/counts`).set({ [field]: FieldValue.increment(1) }, { merge: true });
  } catch (e) {
    console.warn('[stats counter] payment-webhook:', e.message);
  }
}

// Plan credits by plan ID
const PLAN_CREDITS = {
  trial: 25,
  base: 100,
  pro: 1000,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // ═══ SECURITY: Verify Telegram Webhook Secret Token ═══
  // Telegram присылает заголовок X-Telegram-Bot-Api-Secret-Token
  // с секретом, который мы задали при регистрации webhook через setWebhook.
  // Без этой проверки любой может подделать вебхук и получить бесплатный тариф.
  const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (WEBHOOK_SECRET) {
    const incomingSecret = req.headers['x-telegram-bot-api-secret-token'];
    if (incomingSecret !== WEBHOOK_SECRET) {
      console.warn('[Webhook] ❌ Invalid or missing secret token — rejecting request');
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }
  }

  const update = req.body;

  // Handle pre-checkout query (must answer within 10s)
  if (update?.pre_checkout_query) {
    const pqId = update.pre_checkout_query.id;
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerPreCheckoutQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pre_checkout_query_id: pqId, ok: true }),
    });
    return res.status(200).json({ ok: true });
  }

  // Handle successful payment
  if (update?.message?.successful_payment) {
    const payment = update.message.successful_payment;
    const payload = payment.invoice_payload; // format: "plan_trial:uid123"

    const [planKey, uid] = payload.split(':');
    const planId = planKey.replace('plan_', ''); // "trial" | "base" | "pro"

    if (!uid || !PLAN_CREDITS[planId]) {
      console.error('Invalid payload:', payload);
      return res.status(200).json({ ok: true }); // always 200 to Telegram
    }

    const credits = PLAN_CREDITS[planId];
    const now = new Date();
    let expiresAt = null;
    if (planId !== 'trial') {
      expiresAt = new Date(now);
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    }

    try {
      // Определяем тестовый ли платёж:
      // Telegram тест-платежи: provider_payment_charge_id пустой или начинается с "_"
      // Также: если все платежи одного дня с одинаковой секундой — скорее всего тест
      const chargeId = payment.telegram_payment_charge_id || '';
      const providerChargeId = payment.provider_payment_charge_id || '';
      const isTest = !providerChargeId || providerChargeId === '' || providerChargeId.startsWith('_');

      const ref = db.doc(`users/${uid}/subscription/current`);
      await ref.set({
        plan: planId,
        credits,
        creditsTotal: credits,
        planActivatedAt: FieldValue.serverTimestamp(),
        planExpiresAt: expiresAt,
        payments: FieldValue.arrayUnion({
          planId,
          method: 'telegram_stars',
          telegramChargeId: chargeId,
          providerChargeId,
          amount: payment.total_amount,   // реальное кол-во Stars
          currency: payment.currency,      // "XTR"
          date: now.toISOString(),
          isTest,                          // true = тестовый платёж
        }),
      }, { merge: true });

      console.log(`✅ Plan activated: ${planId} for user ${uid}, credits: ${credits}${isTest ? ' [ТЕСТ]' : ''}`);

      // ═══ ADMIN ALERT — уведомление о новой оплате ═══
      alertOnPayment(planId, uid, payment.total_amount).catch(() => {});

      // ═══ STATS: счётчик оплат (только реальные) ═══
      if (!isTest) {
        incrementCounter('paymentsTotal').catch(() => {});
        incrementCounter(`payments_${planId}`).catch(() => {});
      } else {
        incrementCounter('paymentsTest').catch(() => {});
      }

    } catch (err) {
      console.error('Firestore write error:', err);
      alertOnError(err, `payment-webhook Firestore write [${planId}:${uid}]`).catch(() => {});
    }

    return res.status(200).json({ ok: true });
  }

  // ═══ Handle /admin command ═══
  if (update?.message?.text === '/admin') {
    const chatId = update.message.chat.id;
    const fromId = update.message.from?.id;
    const adminIds = getAdminIds();

    // Тихо игнорируем не-админов
    if (!adminIds.length || !adminIds.includes(Number(fromId))) {
      return res.status(200).json({ ok: true });
    }

    const adminKey = process.env.ADMIN_ACCESS_KEY || '';
    const firstName = update.message.from?.first_name || '';
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `👋 ${firstName ? firstName + ', ' : ''}добро пожаловать в Command Center!\n\n📊 Здесь ты видишь статистику, платежи и управляешь пользователями.`,
        reply_markup: {
          inline_keyboard: [[
            {
              text: '🎛 Открыть Command Center',
              web_app: { url: `${APP_URL.replace(/\/$/, '')}/?mode=admin&key=${adminKey}` }
            }
          ]]
        }
      }),
    });
    return res.status(200).json({ ok: true });
  }

  // ═══ Handle /start command ═══
  if (update?.message?.text === '/start') {
    const chatId = update.message.chat.id;
    const firstName = update.message.from?.first_name || '';

    // ═══ STATS: считаем активации бота ═══
    incrementCounter('botActivations').catch(() => {});

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `Привет${firstName ? ', ' + firstName : ''}! 👋\n\nДобро пожаловать в Селлер-Студию — ИИ-фотостудию для маркетплейсов.\n\n📸 Загрузите фото одежды → получите готовые кадры с моделью за 30 секунд.\n\nНажмите кнопку ниже, чтобы начать ↓`,
        reply_markup: {
          inline_keyboard: [[
            { text: '🚀 Открыть Студию', web_app: { url: APP_URL } }
          ]]
        }
      }),
    });
    return res.status(200).json({ ok: true });
  }

  // Unknown update type — just acknowledge
  return res.status(200).json({ ok: true });
}
