// POST /api/admin/user-control
// Admin operations for looking up users, setting plans, and adding credits.
// РРЎРўРћР§РќРРљ РРЎРўРРќР«: PostgreSQL (Р¤Р—-152 compliant, СЂРѕСЃСЃРёР№СЃРєРёР№ С…РѕСЃС‚РёРЅРі)
// Auth РїРѕР»РЅРѕСЃС‚СЊСЋ СѓРґР°Р»С‘РЅ. Р’СЃРµ РѕРїРµСЂР°С†РёРё РёРґСѓС‚ С‡РµСЂРµР· _db.js в†’ PostgreSQL.

import { checkAdminAuth } from './verify.js';
import { query as pgQuery } from '../_db.js';

const PLAN_CREDITS = {
  trial: 10,
  base: 100,
  pro: 350,
};

const PAID_PLANS = new Set(['base', 'pro']);

function buildExpiresAt(plan) {
  if (!PAID_PLANS.has(plan)) return null;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  return expiresAt;
}

// в•ђв•ђв•ђ PostgreSQL Helpers в•ђв•ђв•ђ

/**
 * РќР°Р№С‚Рё РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РІ PostgreSQL.
 * РЎС‚СЂР°С‚РµРіРёРё РїРѕРёСЃРєР°:
 *   1. telegram_id С‚РѕС‡РЅРѕРµ СЃРѕРІРїР°РґРµРЅРёРµ
 *   2. Р•СЃР»Рё С„РѕСЂРјР°С‚ tg_{id} в†’ РёС‰РµРј РїРѕ С‡РёСЃС‚РѕРјСѓ id
 *   3. Р•СЃР»Рё С‡РёСЃР»РѕРІРѕР№ в†’ РёС‰РµРј РїРѕ telegram_id = С‡РёСЃР»Рѕ
 *   4. РџРѕ email
 */
async function findUser(identifier) {
  const clean = String(identifier || '').trim();
  if (!clean) return null;

  // 1. РџСЂСЏРјРѕР№ РїРѕРёСЃРє
  let result = await pgQuery(
    `SELECT id, telegram_id, email FROM users WHERE telegram_id = $1 LIMIT 1`,
    [clean]
  );
  if (result.rows.length > 0) return result.rows[0];

  // 2. Р•СЃР»Рё tg_{id} С„РѕСЂРјР°С‚ вЂ” РёС‰РµРј РїРѕ С‡РёСЃС‚РѕРјСѓ id
  if (clean.startsWith('tg_')) {
    const rawId = clean.slice(3);
    result = await pgQuery(
      `SELECT id, telegram_id, email FROM users WHERE telegram_id = $1 LIMIT 1`,
      [rawId]
    );
    if (result.rows.length > 0) return result.rows[0];
  }

  // 3. Р§РёСЃР»РѕРІРѕР№ вЂ” telegram ID
  if (/^\d+$/.test(clean)) {
    // РўР°РєР¶Рµ РёС‰РµРј СЃ tg_ РїСЂРµС„РёРєСЃРѕРј РЅР° РІСЃСЏРєРёР№ СЃР»СѓС‡Р°Р№
    result = await pgQuery(
      `SELECT id, telegram_id, email FROM users WHERE telegram_id = $1 OR telegram_id = $2 LIMIT 1`,
      [clean, `tg_${clean}`]
    );
    if (result.rows.length > 0) return result.rows[0];
  }

  // 4. РџРѕ email
  if (clean.includes('@')) {
    result = await pgQuery(
      `SELECT id, telegram_id, email FROM users WHERE email = $1 LIMIT 1`,
      [clean.toLowerCase()]
    );
    if (result.rows.length > 0) return result.rows[0];
  }

  return null;
}

/**
 * РќР°Р№С‚Рё РёР»Рё СЃРѕР·РґР°С‚СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ.
 */
async function findOrCreateUser(identifier) {
  const clean = String(identifier || '').trim();
  if (!clean) throw new Error('identifier required');

  // РЎРЅР°С‡Р°Р»Р° РёС‰РµРј СЃСѓС‰РµСЃС‚РІСѓСЋС‰РµРіРѕ
  const existing = await findUser(clean);
  if (existing) return existing;

  // Р•СЃР»Рё РЅРµ РЅР°С€Р»Рё вЂ” СЃРѕР·РґР°С‘Рј
  const telegramId = /^\d+$/.test(clean) ? clean : (clean.startsWith('tg_') ? clean.slice(3) : clean);
  const email = clean.includes('@') ? clean.toLowerCase() : `tg_${telegramId}@telegram.user`;

  const { rows } = await pgQuery(
    `INSERT INTO users (telegram_id, email, role)
     VALUES ($1, $2, 'user')
     ON CONFLICT (telegram_id) DO UPDATE
       SET email = COALESCE(NULLIF($2, ''), users.email)
     RETURNING id, telegram_id, email`,
    [telegramId, email]
  );
  return rows[0];
}

/**
 * РџРѕР»СѓС‡РёС‚СЊ РїРѕРґРїРёСЃРєСѓ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РёР· PostgreSQL.
 */
async function getSubscription(userId) {
  const result = await pgQuery(
    `SELECT * FROM subscriptions WHERE user_id = $1`,
    [userId]
  );
  if (result.rows.length === 0) {
    return {
      exists: false,
      plan: 'none',
      credits: 0,
      creditsTotal: 0,
      status: 'inactive',
      planActivatedAt: null,
      planExpiresAt: null,
      grantedByAdmin: false,
    };
  }

  const sub = result.rows[0];
  return {
    exists: true,
    plan: sub.plan_name || 'none',
    credits: sub.credits || 0,
    creditsTotal: sub.credits_total || 0,
    creditsUsed: Math.max(0, (sub.credits_total || 0) - (sub.credits || 0)),
    status: sub.status || 'inactive',
    planActivatedAt: sub.created_at?.toISOString() || null,
    planExpiresAt: sub.expires_at?.toISOString() || null,
    grantedByAdmin: Boolean(sub.granted_by_admin),
    autoRenew: sub.auto_renew || false,
  };
}

/**
 * РџРѕР»СѓС‡РёС‚СЊ РёСЃС‚РѕСЂРёСЋ РїР»Р°С‚РµР¶РµР№.
 */
async function getPayments(userId) {
  const result = await pgQuery(
    `SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [userId]
  );
  return result.rows.map(p => ({
    planId: p.plan_id,
    method: p.method,
    amount: p.credits_amount || parseFloat(p.amount || 0),
    date: p.created_at?.toISOString(),
    note: p.note || (p.metadata?.note) || '',
    grantedByName: p.metadata?.grantedByName || '',
    isGranted: p.method?.includes('admin') || false,
    ...(p.metadata || {}),
  }));
}

/**
 * РџРѕР»СѓС‡РёС‚СЊ СЃРІРѕРґРєСѓ РїРѕ РіРµРЅРµСЂР°С†РёСЏРј РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ.
 */
async function getGenerationSummary(userId) {
  try {
    const result = await pgQuery(
      `SELECT 
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status = 'success' OR status IS NULL) as success,
         COUNT(*) FILTER (WHERE status = 'error') as failed,
         MAX(created_at) as last_at
       FROM generations WHERE user_id = $1`,
      [userId]
    );
    const row = result.rows[0] || {};
    return {
      total: parseInt(row.total) || 0,
      success: parseInt(row.success) || 0,
      failed: parseInt(row.failed) || 0,
      lastAt: row.last_at?.toISOString() || null,
      avgDurationMs: 0,
    };
  } catch {
    // РўР°Р±Р»РёС†Р° generations РјРѕР¶РµС‚ РЅРµ СЃСѓС‰РµСЃС‚РІРѕРІР°С‚СЊ
    return { total: 0, success: 0, failed: 0, lastAt: null, avgDurationMs: 0 };
  }
}

/**
 * РџРѕР»РЅС‹Р№ lookup РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ вЂ” РїСЂРѕС„РёР»СЊ + РїРѕРґРїРёСЃРєР° + РїР»Р°С‚РµР¶Рё + РіРµРЅРµСЂР°С†РёРё.
 */
async function lookupUser(identifier) {
  const user = await findUser(identifier);
  if (!user) {
    return {
      user: {
        uid: identifier,
        profile: null,
        subscription: {
          exists: false,
          plan: 'none',
          credits: 0,
          creditsTotal: 0,
          creditsUsed: 0,
          status: 'inactive',
          grantedByAdmin: false,
        },
        payments: [],
        generationSummary: { total: 0, success: 0, failed: 0, lastAt: null },
      },
    };
  }

  const [sub, payments, genSummary] = await Promise.all([
    getSubscription(user.id),
    getPayments(user.id),
    getGenerationSummary(user.id),
  ]);

  return {
    user: {
      uid: user.telegram_id || `user_${user.id}`,
      profile: {
        email: user.email,
        displayName: null,
      },
      subscription: {
        ...sub,
        telegramId: user.telegram_id,
      },
      payments,
      generationSummary: genSummary,
    },
  };
}

/**
 * Р—Р°РїРёСЃР°С‚СЊ РїР»Р°С‚С‘Р¶/СЃРѕР±С‹С‚РёРµ РІ С‚Р°Р±Р»РёС†Сѓ payments.
 */
async function recordPayment(userId, { planId, method, credits, note, grantedBy, grantedByName, identifier }) {
  try {
    await pgQuery(
      `INSERT INTO payments (user_id, plan_id, method, credits_amount, note, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, planId, method, credits, note || '', JSON.stringify({ grantedBy, grantedByName, originalIdentifier: identifier })]
    );
  } catch (err) {
    console.warn('[admin/user-control] payment record failed:', err.message);
  }
}

/**
 * Upsert РїРѕРґРїРёСЃРєРё РІ PostgreSQL.
 */
async function upsertSubscription(userId, { plan, credits, creditsTotal, expiresAt, status, grantedByAdmin }) {
  await pgQuery(
    `INSERT INTO subscriptions (user_id, plan_name, credits, credits_total, expires_at, status, granted_by_admin)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id) DO UPDATE SET
       plan_name = $2, credits = $3, credits_total = $4,
       expires_at = $5, status = $6, granted_by_admin = $7`,
    [userId, plan, credits, creditsTotal || credits, expiresAt, status || 'active', grantedByAdmin || false]
  );
  console.log(`[admin/user-control] вњ… PostgreSQL: user_id=${userId}, plan=${plan}, credits=${credits}`);
}

// в•ђв•ђв•ђ MAIN HANDLER в•ђв•ђв•ђ

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key, X-Admin-Init-Data');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  const auth = checkAdminAuth(req);
  if (!auth.ok) return res.status(403).json({ ok: false, error: 'Access denied' });

  const { action = 'lookup', identifier, plan = 'trial', credits, note = '' } = req.body || {};

  try {
    // в•ђв•ђв•ђ LOOKUP в•ђв•ђв•ђ
    if (action === 'lookup') {
      const data = await lookupUser(identifier);
      return res.status(200).json({ ok: true, ...data });
    }

    // Р”Р»СЏ РѕСЃС‚Р°Р»СЊРЅС‹С… РґРµР№СЃС‚РІРёР№ РЅР°Рј РЅСѓР¶РµРЅ РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ
    const user = await findOrCreateUser(identifier);
    const userId = user.id;
    const now = new Date().toISOString();

    // в•ђв•ђв•ђ ADD CREDITS в•ђв•ђв•ђ
    if (action === 'add-credits') {
      const amount = parseInt(credits, 10);
      if (!amount || amount < 1 || amount > 10000) {
        return res.status(400).json({ ok: false, error: 'credits must be 1..10000' });
      }

      // РџРѕР»СѓС‡Р°РµРј С‚РµРєСѓС‰СѓСЋ РїРѕРґРїРёСЃРєСѓ
      const currentSub = await getSubscription(userId);
      const preservedPlan = currentSub.plan && currentSub.plan !== 'none' ? currentSub.plan : 'trial';
      const newCredits = (currentSub.credits || 0) + amount;
      const newTotal = (currentSub.creditsTotal || 0) + amount;

      await upsertSubscription(userId, {
        plan: preservedPlan,
        credits: newCredits,
        creditsTotal: newTotal,
        expiresAt: currentSub.planExpiresAt ? new Date(currentSub.planExpiresAt) : buildExpiresAt(preservedPlan),
        status: 'active',
        grantedByAdmin: true,
      });

      await recordPayment(userId, {
        planId: preservedPlan,
        method: 'admin_credit_adjustment',
        credits: amount,
        note,
        grantedBy: auth.user?.id || 'admin',
        grantedByName: auth.user?.firstName || 'Admin',
        identifier,
      });

      console.log(`вњ… [admin/user-control] +${amount} РєСЂРµРґРёС‚РѕРІ в†’ user_id=${userId} (${identifier}). Р’С‹РґР°Р»: ${auth.user?.firstName || 'Admin'}`);

      const result = await lookupUser(identifier);
      return res.status(200).json({ ok: true, action, ...result });
    }

    // в•ђв•ђв•ђ SET PLAN в•ђв•ђв•ђ
    if (action === 'set-plan') {
      const amount = plan === 'custom' ? parseInt(credits, 10) : PLAN_CREDITS[plan];
      if (!amount || amount < 1 || amount > 10000) {
        return res.status(400).json({ ok: false, error: 'Unknown plan or invalid credits' });
      }

      const effectivePlan = plan === 'custom' ? 'trial' : plan;
      const expiresAt = buildExpiresAt(effectivePlan);

      await upsertSubscription(userId, {
        plan: effectivePlan,
        credits: amount,
        creditsTotal: amount,
        expiresAt,
        status: 'active',
        grantedByAdmin: true,
      });

      await recordPayment(userId, {
        planId: effectivePlan,
        method: 'admin_set_plan',
        credits: amount,
        note,
        grantedBy: auth.user?.id || 'admin',
        grantedByName: auth.user?.firstName || 'Admin',
        identifier,
      });

      console.log(`вњ… [admin/user-control] Р’С‹РґР°РЅ РїР»Р°РЅ ${effectivePlan} (${amount} РєСЂРµРґРёС‚РѕРІ) в†’ user_id=${userId} (${identifier}). Р’С‹РґР°Р»: ${auth.user?.firstName || 'Admin'}`);

      const result = await lookupUser(identifier);
      return res.status(200).json({ ok: true, action, ...result });
    }

    // в•ђв•ђв•ђ DISABLE PLAN в•ђв•ђв•ђ
    if (action === 'disable-plan') {
      await upsertSubscription(userId, {
        plan: 'none',
        credits: 0,
        creditsTotal: 0,
        expiresAt: null,
        status: 'canceled',
        grantedByAdmin: false,
      });

      await recordPayment(userId, {
        planId: 'none',
        method: 'admin_disable_plan',
        credits: 0,
        note,
        grantedBy: auth.user?.id || 'admin',
        grantedByName: auth.user?.firstName || 'Admin',
        identifier,
      });

      console.log(`рџљ« [admin/user-control] РћС‚РєР»СЋС‡С‘РЅ РїР»Р°РЅ в†’ user_id=${userId} (${identifier}). РћС‚РєР»СЋС‡РёР»: ${auth.user?.firstName || 'Admin'}`);

      const result = await lookupUser(identifier);
      return res.status(200).json({ ok: true, action, ...result });
    }

    return res.status(400).json({ ok: false, error: `Unknown action: ${action}` });
  } catch (err) {
    console.error('[admin/user-control] Error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
