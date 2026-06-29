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

// Р¦РµРЅС‹ С‚Р°СЂРёС„РѕРІ РІ СЂСѓР±Р»СЏС… (СЃРѕРіР»Р°СЃРЅРѕ С„РёРЅР°РЅСЃРѕРІРѕРјСѓ РїР»Р°РЅСѓ)
const PLAN_CONFIG = {
  trial: {
    title: 'рџЋЇ РЎРµР»Р»РµСЂ-РЎС‚СѓРґРёСЏ: РўР°СЂРёС„ В«РЎС‚Р°СЂС‚В» вЂ” 25 РєР°РґСЂРѕРІ',
    description: 'РџРѕР»РЅС‹Р№ РґРѕСЃС‚СѓРї Рє РіРµРЅРµСЂР°С†РёРё РЅР° 25 РєР°РґСЂРѕРІ.',
    payload: 'plan_trial',
    priceRub: 500,
  },
  base: {
    title: 'вљЎ РЎРµР»Р»РµСЂ-РЎС‚СѓРґРёСЏ: РўР°СЂРёС„ В«РџСЂРѕВ» вЂ” 100 РєР°РґСЂРѕРІ/РјРµСЃ',
    description: '100 РєР°РґСЂРѕРІ РІ РјРµСЃСЏС†, СЃРІРѕРё Р»РѕРєР°С†РёРё, СЃРѕС…СЂР°РЅРµРЅРёРµ РјРѕРґРµР»РµР№.',
    payload: 'plan_base',
    priceRub: 5000,
  },
  pro: {
    title: 'рџљЂ РЎРµР»Р»РµСЂ-РЎС‚СѓРґРёСЏ: РўР°СЂРёС„ В«Р‘РёР·РЅРµСЃВ» вЂ” Р‘РµР·Р»РёРјРёС‚/РјРµСЃ',
    description: 'Р‘РµР·Р»РёРјРёС‚ РіРµРЅРµСЂР°С†РёР№ (РґРѕ 1000 РєР°РґСЂРѕРІ/РјРµСЃ), РїРѕР»РЅС‹Р№ РґРѕСЃС‚СѓРї.',
    payload: 'plan_pro',
    priceRub: 14990,
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
        save_payment_method: planId !== 'trial', // РЎРѕС…СЂР°РЅСЏРµРј РєР°СЂС‚Сѓ С‚РѕР»СЊРєРѕ РґР»СЏ РјРµСЃСЏС‡РЅС‹С… С‚Р°СЂРёС„РѕРІ РџСЂРѕ Рё Р‘РёР·РЅРµСЃ
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
