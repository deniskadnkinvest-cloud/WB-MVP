// POST /api/admin/user-control
// Admin operations for looking up users, setting plans, and adding credits.
// ИСТОЧНИК ИСТИНЫ: PostgreSQL (ФЗ-152 compliant, российский хостинг)
// Firebase полностью удалён. Все операции идут через _db.js → PostgreSQL.

import { checkAdminAuth } from './verify.js';
import { query as pgQuery } from '../_db.js';

const PLAN_CREDITS = {
  trial: 25,
  base: 100,
  pro: 1000,
};

const PAID_PLANS = new Set(['base', 'pro']);

function buildExpiresAt(plan) {
  if (!PAID_PLANS.has(plan)) return null;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  return expiresAt;
}

// ═══ PostgreSQL Helpers ═══

/**
 * Найти пользователя в PostgreSQL.
 * Стратегии поиска:
 *   1. telegram_id точное совпадение
 *   2. Если формат tg_{id} → ищем по чистому id
 *   3. Если числовой → ищем по telegram_id = число
 *   4. По email
 */
async function findUser(identifier) {
  const clean = String(identifier || '').trim();
  if (!clean) return null;

  // 1. Прямой поиск
  let result = await pgQuery(
    `SELECT id, telegram_id, email FROM users WHERE telegram_id = $1 LIMIT 1`,
    [clean]
  );
  if (result.rows.length > 0) return result.rows[0];

  // 2. Если tg_{id} формат — ищем по чистому id
  if (clean.startsWith('tg_')) {
    const rawId = clean.slice(3);
    result = await pgQuery(
      `SELECT id, telegram_id, email FROM users WHERE telegram_id = $1 LIMIT 1`,
      [rawId]
    );
    if (result.rows.length > 0) return result.rows[0];
  }

  // 3. Числовой — telegram ID
  if (/^\d+$/.test(clean)) {
    // Также ищем с tg_ префиксом на всякий случай
    result = await pgQuery(
      `SELECT id, telegram_id, email FROM users WHERE telegram_id = $1 OR telegram_id = $2 LIMIT 1`,
      [clean, `tg_${clean}`]
    );
    if (result.rows.length > 0) return result.rows[0];
  }

  // 4. По email
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
 * Найти или создать пользователя.
 */
async function findOrCreateUser(identifier) {
  const clean = String(identifier || '').trim();
  if (!clean) throw new Error('identifier required');

  // Сначала ищем существующего
  const existing = await findUser(clean);
  if (existing) return existing;

  // Если не нашли — создаём
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
 * Получить подписку пользователя из PostgreSQL.
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
 * Получить историю платежей.
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
 * Получить сводку по генерациям пользователя.
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
    // Таблица generations может не существовать
    return { total: 0, success: 0, failed: 0, lastAt: null, avgDurationMs: 0 };
  }
}

/**
 * Полный lookup пользователя — профиль + подписка + платежи + генерации.
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
 * Записать платёж/событие в таблицу payments.
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
 * Upsert подписки в PostgreSQL.
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
  console.log(`[admin/user-control] ✅ PostgreSQL: user_id=${userId}, plan=${plan}, credits=${credits}`);
}

// ═══ MAIN HANDLER ═══

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
    // ═══ LOOKUP ═══
    if (action === 'lookup') {
      const data = await lookupUser(identifier);
      return res.status(200).json({ ok: true, ...data });
    }

    // Для остальных действий нам нужен пользователь
    const user = await findOrCreateUser(identifier);
    const userId = user.id;
    const now = new Date().toISOString();

    // ═══ ADD CREDITS ═══
    if (action === 'add-credits') {
      const amount = parseInt(credits, 10);
      if (!amount || amount < 1 || amount > 10000) {
        return res.status(400).json({ ok: false, error: 'credits must be 1..10000' });
      }

      // Получаем текущую подписку
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

      console.log(`✅ [admin/user-control] +${amount} кредитов → user_id=${userId} (${identifier}). Выдал: ${auth.user?.firstName || 'Admin'}`);

      const result = await lookupUser(identifier);
      return res.status(200).json({ ok: true, action, ...result });
    }

    // ═══ SET PLAN ═══
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

      console.log(`✅ [admin/user-control] Выдан план ${effectivePlan} (${amount} кредитов) → user_id=${userId} (${identifier}). Выдал: ${auth.user?.firstName || 'Admin'}`);

      const result = await lookupUser(identifier);
      return res.status(200).json({ ok: true, action, ...result });
    }

    // ═══ DISABLE PLAN ═══
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

      console.log(`🚫 [admin/user-control] Отключён план → user_id=${userId} (${identifier}). Отключил: ${auth.user?.firstName || 'Admin'}`);

      const result = await lookupUser(identifier);
      return res.status(200).json({ ok: true, action, ...result });
    }

    return res.status(400).json({ ok: false, error: `Unknown action: ${action}` });
  } catch (err) {
    console.error('[admin/user-control] Error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
