// ═══════════════════════════════════════════════════════════════
// POST /api/create-payment
// Создаёт платеж в ЮKassa для покупки тарифа
// Body: { planId: 'trial' | 'base' | 'pro', uid: string }
// Returns: { ok: true, invoiceLink: string } (confirmation_url)
// ═══════════════════════════════════════════════════════════════

import crypto from 'crypto';
import { alertOnError } from './_admin-alerts.js';

const YOOKASSA_SHOP_ID = process.env.YOOKASSA_SHOP_ID || '1373290';
const YOOKASSA_SECRET_KEY = process.env.YOOKASSA_SECRET_KEY;
const VITE_APP_URL = process.env.VITE_APP_URL || 'https://vton-mvp-omega.vercel.app';

// Цены тарифов в рублях (согласно финансовому плану)
const PLAN_CONFIG = {
  trial: {
    title: '🎯 Селлер-Студия: Тариф «Старт» — 25 кадров',
    description: 'Полный доступ к генерации на 25 кадров.',
    payload: 'plan_trial',
    priceRub: 500,
  },
  base: {
    title: '⚡ Селлер-Студия: Тариф «Про» — 100 кадров/мес',
    description: '100 кадров в месяц, свои локации, сохранение моделей.',
    payload: 'plan_base',
    priceRub: 5000,
  },
  pro: {
    title: '🚀 Селлер-Студия: Тариф «Бизнес» — Безлимит/мес',
    description: 'Безлимит генераций (до 1000 кадров/мес), полный доступ.',
    payload: 'plan_pro',
    priceRub: 14990,
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

  if (!YOOKASSA_SECRET_KEY) {
    return res.status(500).json({ ok: false, error: 'Yookassa secret key not configured' });
  }

  const { planId, uid } = req.body || {};

  if (!planId || !uid) {
    return res.status(400).json({ ok: false, error: 'planId and uid are required' });
  }

  const plan = PLAN_CONFIG[planId];
  if (!plan) {
    return res.status(400).json({ ok: false, error: `Unknown plan: ${planId}` });
  }

  try {
    const idempotencyKey = crypto.randomUUID();
    const authHeader = 'Basic ' + Buffer.from(`${YOOKASSA_SHOP_ID}:${YOOKASSA_SECRET_KEY}`).toString('base64');

    // Делаем запрос к API ЮKassa для создания платежа
    const ykRes = await fetch('https://api.yookassa.ru/v3/payments', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Idempotency-Key': idempotencyKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: {
          value: plan.priceRub.toFixed(2),
          currency: 'RUB',
        },
        capture: true, // Автоматическое списание денег после успешной авторизации карты
        save_payment_method: planId !== 'trial', // Сохраняем карту только для месячных тарифов Про и Бизнес
        confirmation: {
          type: 'redirect',
          return_url: `${VITE_APP_URL}/?payment=success&plan=${planId}`,
        },
        description: plan.title,
        metadata: {
          uid: uid,
          planId: planId,
        },
      }),
    });

    const ykData = await ykRes.json();

    if (ykRes.status !== 200) {
      console.error('Yookassa API error:', ykData);
      alertOnError(
        { message: ykData.description || 'Yookassa API error', status: ykRes.status },
        `create-payment Yookassa API [${planId}:${uid}]`
      ).catch(() => {});
      return res.status(500).json({
        ok: false,
        error: ykData.description || 'Yookassa API error',
      });
    }

    // Возвращаем confirmation_url под ключом invoiceLink для совместимости с фронтом
    return res.status(200).json({
      ok: true,
      invoiceLink: ykData.confirmation.confirmation_url,
      planId,
      priceRub: plan.priceRub,
    });
  } catch (err) {
    console.error('create-payment error:', err);
    alertOnError(err, `create-payment [${req.body?.planId}:${req.body?.uid}]`).catch(() => {});
    return res.status(500).json({ ok: false, error: err.message });
  }
}
