// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// POST /api/create-payment
// РЎРѕР·РґР°С‘С‚ РїР»Р°С‚РµР¶ РІ Р®Kassa РґР»СЏ РїРѕРєСѓРїРєРё С‚Р°СЂРёС„Р°
// Body: { planId: 'trial' | 'base' | 'pro', uid: string, email?: string }
// Returns: { ok: true, invoiceLink: string } (confirmation_url)
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { alertOnError } from './_admin-alerts.js';

const JWT_SECRET = process.env.JWT_SECRET || 'vton-secret-2026';

// Цены тарифов в рублях (согласно финансовому плану)
const PLAN_CONFIG = {
  trial: {
    title: '🎯 Селлер-Студия: Тариф «Старт» — 10 кадров',
    description: 'Полный доступ к генерации на 10 кадров.',
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
    title: '🚀 Селлер-Студия: Тариф «Бизнес» — 350 кадров/мес',
    description: '350 генераций в месяц, полный доступ.',
    payload: 'plan_pro',
    priceRub: 14990,
  },
  // Top-ups
  topup_5: {
    title: '⚡ Пополнение: 5 генераций',
    description: 'Дополнительные 5 генераций.',
    payload: 'topup_5',
    priceRub: 249,
  },
  topup_10_trial: {
    title: '⚡ Пополнение: 10 генераций',
    description: 'Дополнительные 10 генераций.',
    payload: 'topup_10_trial',
    priceRub: 449,
  },
  topup_25: {
    title: '⚡ Пополнение: 25 генераций',
    description: 'Дополнительные 25 генераций.',
    payload: 'topup_25',
    priceRub: 990,
  },
  topup_10: {
    title: '⚡ Пополнение: 10 генераций',
    description: 'Дополнительные 10 генераций.',
    payload: 'topup_10',
    priceRub: 390,
  },
  topup_30: {
    title: '⚡ Пополнение: 30 генераций',
    description: 'Дополнительные 30 генераций.',
    payload: 'topup_30',
    priceRub: 1090,
  },
  topup_100: {
    title: '⚡ Пополнение: 100 генераций',
    description: 'Дополнительные 100 генераций.',
    payload: 'topup_100',
    priceRub: 3490,
  },
  topup_50: {
    title: '⚡ Пополнение: 50 генераций',
    description: 'Дополнительные 50 генераций.',
    payload: 'topup_50',
    priceRub: 1790,
  },
  topup_150: {
    title: '⚡ Пополнение: 150 генераций',
    description: 'Дополнительные 150 генераций.',
    payload: 'topup_150',
    priceRub: 4490,
  },
  topup_350: {
    title: '⚡ Пополнение: 350 генераций',
    description: 'Дополнительные 350 генераций.',
    payload: 'topup_350',
    priceRub: 8990,
  },
};

export default async function handler(req, res) {
  // Р§РёС‚Р°РµРј env-РїРµСЂРµРјРµРЅРЅС‹Рµ РІРЅСѓС‚СЂРё handler (РЅРµ РЅР° СѓСЂРѕРІРЅРµ РјРѕРґСѓР»СЏ),
  // С‡С‚РѕР±С‹ РіР°СЂР°РЅС‚РёСЂРѕРІР°С‚СЊ Р·Р°РіСЂСѓР·РєСѓ РїРѕСЃР»Рµ dotenv.config() РІ server.js
  const YOOKASSA_SHOP_ID = process.env.YOOKASSA_SHOP_ID;
  const YOOKASSA_SECRET_KEY = process.env.YOOKASSA_SECRET_KEY;
  const VITE_APP_URL = process.env.VITE_APP_URL || 'https://seller-studio-ai.ru';

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  if (!YOOKASSA_SECRET_KEY) {
    console.error('[create-payment] YOOKASSA_SECRET_KEY is not configured! Check .env or Vercel env vars.');
    return res.status(500).json({ ok: false, error: 'Yookassa secret key not configured' });
  }

  const { planId, uid, email } = req.body || {};

  if (!planId || !uid) {
    return res.status(400).json({ ok: false, error: 'planId and uid are required' });
  }

  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!idToken) {
    return res.status(401).json({ ok: false, error: 'Authorization token is required' });
  }

  let payerEmail = email || 'customer@seller-studio-ai.ru';
  try {
    // Р’РµСЂРёС„РёРєР°С†РёСЏ JWT (Р·Р°РјРµРЅР° internal JWT)
    const decoded = jwt.verify(idToken, JWT_SECRET);
    if (decoded.uid !== uid) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }
    // Р•СЃР»Рё РІ С‚РѕРєРµРЅРµ РµСЃС‚СЊ email вЂ” РёСЃРїРѕР»СЊР·СѓРµРј РµРіРѕ
    payerEmail = decoded.email || payerEmail;
  } catch (err) {
    console.error('create-payment auth error:', err.message);
    return res.status(401).json({ ok: false, error: 'Invalid authorization token' });
  }

  const plan = PLAN_CONFIG[planId];
  if (!plan) {
    return res.status(400).json({ ok: false, error: `Unknown plan: ${planId}` });
  }

  try {
    const idempotencyKey = crypto.randomUUID();
    const ykAuthHeader = 'Basic ' + Buffer.from(`${YOOKASSA_SHOP_ID}:${YOOKASSA_SECRET_KEY}`).toString('base64');

    // Р”РµР»Р°РµРј Р·Р°РїСЂРѕСЃ Рє API Р®Kassa РґР»СЏ СЃРѕР·РґР°РЅРёСЏ РїР»Р°С‚РµР¶Р°
    const ykRes = await fetch('https://api.yookassa.ru/v3/payments', {
      method: 'POST',
      headers: {
        'Authorization': ykAuthHeader,
        'Idempotence-Key': idempotencyKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: {
          value: plan.priceRub.toFixed(2),
          currency: 'RUB',
        },
        capture: true, // РђРІС‚РѕРјР°С‚РёС‡РµСЃРєРѕРµ СЃРїРёСЃР°РЅРёРµ РґРµРЅРµРі РїРѕСЃР»Рµ СѓСЃРїРµС€РЅРѕР№ Р°РІС‚РѕСЂРёР·Р°С†РёРё РєР°СЂС‚С‹
        save_payment_method: planId === 'base' || planId === 'pro', // Сохраняем карту только для автопродления подписок Про (base) и Бизнес (pro)
        confirmation: {
          type: 'redirect',
          return_url: `${VITE_APP_URL}/?payment=success&plan=${planId}`,
        },
        description: plan.title,
        metadata: {
          uid: uid,
          planId: planId,
          // Р•СЃР»Рё UID РЅР°С‡РёРЅР°РµС‚СЃСЏ СЃ tg_ вЂ” СЌС‚Рѕ Telegram-РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ, РїРµСЂРµРґР°С‘Рј telegramId
          // С‡С‚РѕР±С‹ РІРµР±С…СѓРє РјРѕРі Р·Р°РїРёСЃР°С‚СЊ РїРѕРґРїРёСЃРєСѓ РЅР° РїСЂР°РІРёР»СЊРЅС‹Р№ СЃС‚Р°Р±РёР»СЊРЅС‹Р№ UID
          ...(uid.startsWith('tg_') ? { telegramId: uid.slice(3) } : {}),
        },
        receipt: {
          customer: {
            email: payerEmail,
          },
          items: [
            {
              description: plan.title,
              quantity: '1.00',
              amount: {
                value: plan.priceRub.toFixed(2),
                currency: 'RUB',
              },
              vat_code: '1', // 1 = Р‘РµР· РќР”РЎ (РґР»СЏ РРџ РЅР° РЈРЎРќ / РїР°С‚РµРЅС‚Рµ)
              payment_mode: 'full_payment',
              payment_subject: 'service',
            }
          ]
        }
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

    // Р’РѕР·РІСЂР°С‰Р°РµРј confirmation_url РїРѕРґ РєР»СЋС‡РѕРј invoiceLink РґР»СЏ СЃРѕРІРјРµСЃС‚РёРјРѕСЃС‚Рё СЃ С„СЂРѕРЅС‚РѕРј
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
