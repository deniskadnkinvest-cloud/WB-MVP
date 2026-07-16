// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// GET/POST /api/subscription
// РЈРїСЂР°РІР»РµРЅРёРµ РїРѕРґРїРёСЃРєР°РјРё РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№
// РРЎРўРћР§РќРРљ РРЎРўРРќР«: PostgreSQL (СЂРѕСЃСЃРёР№СЃРєРёР№ С…РѕСЃС‚РёРЅРі, Р¤Р—-152)
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ

import jwt from 'jsonwebtoken';
import { query } from './_db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'vton-secret-2026';
const PLAN_CREDITS = { trial: 10, base: 100, pro: 350 };

function verifyToken(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/**
 * РќР°Р№С‚Рё РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РІ PostgreSQL.
 * РџСЂРѕР±СѓРµРј РЅРµСЃРєРѕР»СЊРєРѕ СЃС‚СЂР°С‚РµРіРёР№:
 *   1. telegram_id = uid (РїСЂСЏРјРѕРµ СЃРѕРІРїР°РґРµРЅРёРµ, РЅР°РїСЂ. "tg_123456" РёР»Рё "123456")
 *   2. telegram_id = uid Р±РµР· "tg_" РїСЂРµС„РёРєСЃР° (РµСЃР»Рё uid = "tg_123456" в†’ РёС‰РµРј "123456")
 *   3. email = decoded.email (РґР»СЏ email OTP Р°РІС‚РѕСЂРёР·Р°С†РёРё)
 * Р’РѕР·РІСЂР°С‰Р°РµС‚ { id, telegram_id } РёР»Рё null
 */
async function findUser(uid, email) {
  // РЎС‚СЂР°С‚РµРіРёСЏ 1: РїСЂСЏРјРѕР№ РїРѕРёСЃРє РїРѕ telegram_id
  let result = await query(
    `SELECT id, telegram_id FROM users WHERE telegram_id = $1 LIMIT 1`,
    [uid]
  );
  if (result.rows.length > 0) return result.rows[0];

  // РЎС‚СЂР°С‚РµРіРёСЏ 2: uid СЃ "tg_" РїСЂРµС„РёРєСЃРѕРј в†’ РёС‰РµРј Р±РµР· РїСЂРµС„РёРєСЃР°
  if (uid && uid.startsWith('tg_')) {
    const rawId = uid.slice(3);
    result = await query(
      `SELECT id, telegram_id FROM users WHERE telegram_id = $1 LIMIT 1`,
      [rawId]
    );
    if (result.rows.length > 0) return result.rows[0];
  }

  // РЎС‚СЂР°С‚РµРіРёСЏ 3: РїРѕРёСЃРє РїРѕ email
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const decoded = verifyToken(req);
  if (!decoded) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const uid = decoded.uid;
  const email = decoded.email || null;

  try {
    // в•ђв•ђв•ђ GET вЂ” РџРѕР»СѓС‡РёС‚СЊ С‚РµРєСѓС‰СѓСЋ РїРѕРґРїРёСЃРєСѓ в•ђв•ђв•ђ
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

      // РџРѕР»СѓС‡РёС‚СЊ РїРѕРґРїРёСЃРєСѓ
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

      // РџСЂРѕРІРµСЂСЏРµРј РёСЃС‚РµС‡РµРЅРёРµ СЃСЂРѕРєР° РґР»СЏ РјРµСЃСЏС‡РЅС‹С… РїР»Р°РЅРѕРІ
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

      // РџРѕР»СѓС‡РёС‚СЊ РёСЃС‚РѕСЂРёСЋ РїР»Р°С‚РµР¶РµР№
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

    // в•ђв•ђв•ђ POST вЂ” РђРєС‚РёРІРёСЂРѕРІР°С‚СЊ РїР»Р°РЅ (РїРѕСЃР»Рµ РѕРїР»Р°С‚С‹) в•ђв•ђв•ђ
    if (req.method === 'POST') {
      const { planId } = req.body || {};

      const credits = PLAN_CREDITS[planId];

      if (!credits) {
        return res.status(400).json({ ok: false, error: `Unknown plan: ${planId}` });
      }

      const user = await findUser(uid, email);

      if (!user) {
        return res.status(404).json({ ok: false, error: 'User not found' });
      }

      const userId = user.id;
      let expiresAt = null;

      if (planId !== 'trial') {
        expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 1);
      }

      // Upsert РїРѕРґРїРёСЃРєРё
      await query(
        `INSERT INTO subscriptions (user_id, plan_name, credits, credits_total, expires_at, status, auto_renew)
         VALUES ($1, $2, $3, $4, $5, 'active', $6)
         ON CONFLICT (user_id) DO UPDATE SET
           plan_name = $2, credits = $3, credits_total = $4,
           expires_at = $5, status = 'active', auto_renew = $6`,
        [userId, planId, credits, credits, expiresAt, planId !== 'trial']
      );

      return res.json({ ok: true, data: { plan: planId, credits } });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('[subscription] Error:', err);
    return res.status(500).json({ ok: false, error: err.message });
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
