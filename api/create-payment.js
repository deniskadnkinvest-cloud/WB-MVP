// ═══════════════════════════════════════════════════════════════
// POST /api/create-payment
// Создаёт инвойс Telegram Stars для покупки тарифа
// Body: { planId: 'trial' | 'base' | 'pro', uid: string }
// Returns: { ok: true, invoiceLink: string }
// ═══════════════════════════════════════════════════════════════

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Цены в Telegram Stars (1 Star ≈ 0.013 $)
// 390 RUB ≈ ~4.3$ → ~330 Stars (используем 330)
// 3500 RUB ≈ ~38.5$ → ~2960 Stars → 99 Stars (промо тест)
// 9900 RUB ≈ ~109$ → ~8380 Stars → 299 Stars (промо тест)
const PLAN_CONFIG = {
  trial: {
    title: '🎯 Тест-драйв — 25 кадров',
    description: 'Полный доступ к генерации на 25 кадров. Без сохранения модели и локации.',
    payload: 'plan_trial',
    currency: 'XTR', // Telegram Stars currency code
    prices: [{ label: 'Тест-драйв (25 кадров)', amount: 15 }], // 15 Stars
    priceRub: 500,
  },
  base: {
    title: '⚡ Про — 100 кадров/мес',
    description: '100 кадров в месяц. Свои локации, сохранение моделей, пакетная генерация.',
    payload: 'plan_base',
    currency: 'XTR',
    prices: [{ label: 'Про (100 кадров/мес)', amount: 120 }], // 120 Stars
    priceRub: 4990,
  },
  pro: {
    title: '🚀 Бизнес — Безлимит/мес',
    description: 'Безлимит генераций (fair use 1000 кадров/мес). Полный доступ, Identity Preservation.',
    payload: 'plan_pro',
    currency: 'XTR',
    prices: [{ label: 'Бизнес (Безлимит/мес)', amount: 350 }], // 350 Stars
    priceRub: 15990,
  },
};

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  if (!BOT_TOKEN) {
    return res.status(500).json({ ok: false, error: 'Bot token not configured' });
  }

  const { planId, uid, chatId } = req.body || {};

  if (!planId || !uid) {
    return res.status(400).json({ ok: false, error: 'planId and uid are required' });
  }

  const plan = PLAN_CONFIG[planId];
  if (!plan) {
    return res.status(400).json({ ok: false, error: `Unknown plan: ${planId}` });
  }

  try {
    // Create invoice link via Telegram Bot API
    const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: plan.title,
        description: plan.description,
        payload: `${plan.payload}:${uid}`, // uid encoded so webhook knows who paid
        currency: plan.currency,
        prices: plan.prices,
        // Optional: photo for invoice
        // photo_url: 'https://vton-mvp-omega.vercel.app/og-image.png',
      }),
    });

    const tgData = await tgRes.json();

    if (!tgData.ok) {
      console.error('Telegram API error:', tgData);
      return res.status(500).json({
        ok: false,
        error: tgData.description || 'Telegram API error',
      });
    }

    return res.status(200).json({
      ok: true,
      invoiceLink: tgData.result,
      planId,
      priceRub: plan.priceRub,
      priceStars: plan.prices[0].amount,
    });
  } catch (err) {
    console.error('create-payment error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
