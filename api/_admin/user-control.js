// POST /api/admin/user-control
// Admin operations for looking up users, opening plans, and adding credits.
// DUAL-WRITE: Firestore (legacy) + PostgreSQL (ФЗ-152 compliant, source of truth)

import { ensureFirebaseAdmin } from '../_firebase-admin.js';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { checkAdminAuth } from './verify.js';
import { query as pgQuery } from '../_db.js';

ensureFirebaseAdmin();
const db = getFirestore();

// ═══ PostgreSQL SYNC HELPERS ═══

/**
 * Найти или создать пользователя в PostgreSQL.
 * @param {string} telegramId — чистый числовой Telegram ID
 * @param {string|null} email
 * @returns {{ id: number, telegram_id: string }}
 */
async function findOrCreatePgUser(telegramId, email) {
  const pgEmail = email || (telegramId ? `tg_${telegramId}@telegram.user` : 'unknown@user');
  const { rows } = await pgQuery(
    `INSERT INTO users (telegram_id, email, role)
     VALUES ($1, $2, 'user')
     ON CONFLICT (telegram_id) DO UPDATE
       SET email = COALESCE(NULLIF($2, ''), users.email)
     RETURNING id, telegram_id`,
    [telegramId, pgEmail]
  );
  return rows[0];
}

/**
 * Синхронизировать подписку в PostgreSQL после операции в Firestore.
 */
async function syncSubscriptionToPostgres({ telegramId, email, plan, credits, creditsTotal, expiresAt, status, grantedByAdmin }) {
  try {
    const user = await findOrCreatePgUser(telegramId, email);
    await pgQuery(
      `INSERT INTO subscriptions (user_id, plan_name, credits, credits_total, expires_at, status, granted_by_admin)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id) DO UPDATE SET
         plan_name = $2, credits = $3, credits_total = $4,
         expires_at = $5, status = $6, granted_by_admin = $7`,
      [user.id, plan, credits, creditsTotal || credits, expiresAt, status || 'active', grantedByAdmin || false]
    );
    console.log(`[admin/user-control] ✅ Synced to PostgreSQL: user_id=${user.id}, plan=${plan}, credits=${credits}`);
  } catch (err) {
    console.error(`[admin/user-control] ⚠️ PostgreSQL sync failed (non-fatal): ${err.message}`);
  }
}

const PLAN_CREDITS = {
  trial: 25,
  base: 100,
  pro: 1000,
};

const PAID_PLANS = new Set(['base', 'pro']);

function toIso(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000).toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function buildExpiresAt(plan) {
  if (!PAID_PLANS.has(plan)) return null;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  return expiresAt;
}

async function resolveIdentifier(identifier) {
  const clean = String(identifier || '').trim();
  if (!clean) throw new Error('identifier required');

  // ── Email → Firebase UID через Auth ──
  if (clean.includes('@') && clean.includes('.')) {
    const email = clean.toLowerCase();
    const record = await getAuth().getUserByEmail(email);
    return { uid: record.uid, resolvedFrom: 'email', email, displayInfo: `${email} -> ${record.uid}` };
  }

  // ── Числовой идентификатор → Telegram ID ──
  // ПРИОРИТЕТ 1: Детерминированный UID tg_{telegramId} (новая архитектура)
  // ПРИОРИТЕТ 2: Маппинг telegram_uid_map (переходный период)
  // ПРИОРИТЕТ 3: Legacy путь users/{telegramId} (старые записи)
  if (/^\d+$/.test(clean)) {
    const stableUid = `tg_${clean}`;

    // Шаг 1: Проверяем детерминированный путь tg_{telegramId}
    try {
      const stableSubSnap = await db.doc(`users/${stableUid}/subscription/current`).get();
      if (stableSubSnap.exists) {
        console.log(`[admin/user-control] TG ${clean} → stable UID ${stableUid} (direct)`);
        return { uid: stableUid, resolvedFrom: 'telegram_stable', telegramId: clean, displayInfo: `TG ${clean} → ${stableUid}` };
      }
    } catch (err) {
      console.warn('[admin/user-control] stable UID check failed:', err.message);
    }

    // Шаг 2: Маппинг telegram_uid_map (для старых пользователей с anonymous UID)
    try {
      const mapSnap = await db.doc(`telegram_uid_map/${clean}`).get();
      if (mapSnap.exists) {
        const firebaseUid = mapSnap.data()?.firebaseUid;
        if (firebaseUid && firebaseUid !== stableUid) {
          // Старый anonymous UID — мигрируем подписку на стабильный путь
          const oldSubSnap = await db.doc(`users/${firebaseUid}/subscription/current`).get();
          if (oldSubSnap.exists && oldSubSnap.data()?.plan !== 'none') {
            console.log(`[admin/user-control] Migrating sub from ${firebaseUid} → ${stableUid}`);
            await db.doc(`users/${stableUid}/subscription/current`).set({
              ...oldSubSnap.data(),
              telegramId: clean,
              migratedFrom: `users/${firebaseUid}`,
              migratedAt: FieldValue.serverTimestamp(),
            });
            await db.doc(`users/${firebaseUid}/subscription/current`).delete().catch(() => {});
          }
          // Обновляем маппинг на стабильный UID
          await db.doc(`telegram_uid_map/${clean}`).set({ firebaseUid: stableUid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        }
      }
    } catch (err) {
      console.warn('[admin/user-control] telegram_uid_map migration failed:', err.message);
    }

    // Шаг 3: Legacy путь users/{telegramId}/subscription/current
    try {
      const legacySubSnap = await db.doc(`users/${clean}/subscription/current`).get();
      if (legacySubSnap.exists && legacySubSnap.data()?.plan !== 'none') {
        console.log(`[admin/user-control] Migrating legacy sub from users/${clean} → users/${stableUid}`);
        await db.doc(`users/${stableUid}/subscription/current`).set({
          ...legacySubSnap.data(),
          telegramId: clean,
          migratedFrom: `users/${clean}`,
          migratedAt: FieldValue.serverTimestamp(),
        });
        await db.doc(`users/${clean}/subscription/current`).delete().catch(() => {});
      }
    } catch (err) {
      console.warn('[admin/user-control] legacy path migration failed:', err.message);
    }

    // ВСЕГДА возвращаем стабильный UID — даже если подписки пока нет
    // (админ создаст её по этому пути)
    console.log(`[admin/user-control] TG ${clean} → stable UID ${stableUid}`);
    return { uid: stableUid, resolvedFrom: 'telegram_stable', telegramId: clean, displayInfo: `TG ${clean} → ${stableUid}` };
  }

  return { uid: clean, resolvedFrom: 'firebase_uid', displayInfo: `UID ${clean}` };
}

function getIdentityIds(uid, sub = {}) {
  return Array.from(new Set([
    uid,
    sub.telegramId,
    sub.firebaseUid,
    sub.migratedFromTgId,
    sub.linkedFirebaseUid,
  ].filter(Boolean).map(String)));
}

async function loadGenerationHistory(ids, limit = 80) {
  const docsById = new Map();

  await Promise.all(ids.map(async (id) => {
    try {
      const snap = await db.collection('generations')
        .where('userId', '==', id)
        .limit(limit)
        .get();
      snap.docs.forEach(doc => docsById.set(doc.id, doc.data()));
    } catch (err) {
      console.warn('[admin/user-control] generation lookup failed:', id, err.message);
    }
  }));

  return Array.from(docsById.values())
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, limit);
}

function generationSummary(generations) {
  const byType = {};
  let success = 0;
  let failed = 0;
  let totalDuration = 0;
  let durationCount = 0;

  generations.forEach(gen => {
    byType[gen.type || 'unknown'] = (byType[gen.type || 'unknown'] || 0) + 1;
    if (gen.success === false) failed += 1;
    else success += 1;
    if (Number.isFinite(Number(gen.durationMs))) {
      totalDuration += Number(gen.durationMs);
      durationCount += 1;
    }
  });

  return {
    total: generations.length,
    success,
    failed,
    byType,
    lastAt: generations[0]?.createdAt || null,
    avgDurationMs: durationCount ? Math.round(totalDuration / durationCount) : 0,
  };
}

async function lookupUser(identifier) {
  const resolved = await resolveIdentifier(identifier);
  const ref = db.doc(`users/${resolved.uid}/subscription/current`);
  const [userSnap, subSnap] = await Promise.all([
    db.doc(`users/${resolved.uid}`).get().catch(() => null),
    ref.get(),
  ]);

  const sub = subSnap.exists ? subSnap.data() : {};
  const ids = getIdentityIds(resolved.uid, sub);

  const linkedSubs = [];
  await Promise.all(ids.map(async (id) => {
    const snap = await db.doc(`users/${id}/subscription/current`).get().catch(() => null);
    if (snap?.exists) {
      linkedSubs.push({
        uid: id,
        plan: snap.data()?.plan || 'none',
        credits: snap.data()?.credits || 0,
        creditsTotal: snap.data()?.creditsTotal || 0,
        telegramId: snap.data()?.telegramId || null,
        firebaseUid: snap.data()?.firebaseUid || null,
        linkedFirebaseUid: snap.data()?.linkedFirebaseUid || null,
        updatedAt: toIso(snap.data()?.updatedAt),
      });
    }
  }));

  const generations = await loadGenerationHistory(ids);
  const payments = Array.isArray(sub.payments) ? sub.payments.map(p => ({
    ...p,
    date: toIso(p.date),
  })).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)) : [];

  return {
    resolved,
    user: {
      uid: resolved.uid,
      profile: userSnap?.exists ? userSnap.data() : null,
      subscription: {
        exists: subSnap.exists,
        plan: sub.plan || 'none',
        credits: sub.credits || 0,
        creditsTotal: sub.creditsTotal || 0,
        creditsUsed: Math.max(0, (sub.creditsTotal || 0) - (sub.credits || 0)),
        status: sub.subscriptionStatus || sub.status || 'unknown',
        planActivatedAt: toIso(sub.planActivatedAt),
        planExpiresAt: toIso(sub.planExpiresAt),
        grantedByAdmin: Boolean(sub.grantedByAdmin),
        telegramId: sub.telegramId || sub.migratedFromTgId || null,
        firebaseUid: sub.firebaseUid || sub.linkedFirebaseUid || null,
        lastTelegramSyncAt: toIso(sub.lastTelegramSyncAt),
      },
      identityIds: ids,
      linkedSubscriptions: linkedSubs,
      payments,
      generations,
      generationSummary: generationSummary(generations),
    },
  };
}

async function writeAudit(action, admin, payload, result) {
  await db.collection('admin_actions').add({
    action,
    adminId: admin?.id || 'admin',
    adminName: admin?.firstName || 'Admin',
    payload,
    result,
    createdAt: FieldValue.serverTimestamp(),
  }).catch(err => console.warn('[admin/user-control] audit failed:', err.message));
}

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
    const resolved = await resolveIdentifier(identifier);
    const ref = db.doc(`users/${resolved.uid}/subscription/current`);
    const now = new Date().toISOString();

    if (action === 'lookup') {
      const data = await lookupUser(identifier);
      return res.status(200).json({ ok: true, ...data });
    }

    if (action === 'add-credits') {
      const amount = parseInt(credits, 10);
      if (!amount || amount < 1 || amount > 10000) {
        return res.status(400).json({ ok: false, error: 'credits must be 1..10000' });
      }
      const currentSnap = await ref.get();
      const currentPlan = currentSnap.exists ? currentSnap.data()?.plan : 'none';
      const preservedPlan = currentPlan && currentPlan !== 'none' ? currentPlan : 'trial';

      const entry = {
        method: 'admin_credit_adjustment',
        amount,
        date: now,
        note,
        grantedBy: auth.user?.id || 'admin',
        grantedByName: auth.user?.firstName || 'Admin',
        originalIdentifier: identifier,
        resolvedFrom: resolved.resolvedFrom,
        isGranted: true,
        isTest: false,
      };

      const telegramIdToSave = resolved.telegramId ? String(resolved.telegramId) : undefined;

      await ref.set({
        plan: preservedPlan,
        credits: FieldValue.increment(amount),
        creditsTotal: FieldValue.increment(amount),
        subscriptionStatus: 'active',
        status: 'active',
        payments: FieldValue.arrayUnion(entry),
        grantedByAdmin: true,
        updatedAt: FieldValue.serverTimestamp(),
        ...(telegramIdToSave ? { telegramId: telegramIdToSave } : {}),
      }, { merge: true });

      // Sync to PostgreSQL
      const currentSubSnap = await ref.get();
      const currentSub = currentSubSnap.exists ? currentSubSnap.data() : {};
      const cleanTgId = resolved.telegramId || (resolved.uid.startsWith('tg_') ? resolved.uid.slice(3) : resolved.uid);
      await syncSubscriptionToPostgres({
        telegramId: cleanTgId,
        email: resolved.email,
        plan: currentSub.plan || preservedPlan,
        credits: currentSub.credits || amount,
        creditsTotal: currentSub.creditsTotal || amount,
        expiresAt: currentSub.planExpiresAt ? new Date(currentSub.planExpiresAt.seconds * 1000) : null,
        status: 'active',
        grantedByAdmin: true,
      });

      const result = await lookupUser(identifier);
      await writeAudit(action, auth.user, { identifier, amount, note }, { uid: resolved.uid });
      return res.status(200).json({ ok: true, action, ...result });
    }

    if (action === 'set-plan') {
      const amount = plan === 'custom' ? parseInt(credits, 10) : PLAN_CREDITS[plan];
      if (!amount || amount < 1 || amount > 10000) {
        return res.status(400).json({ ok: false, error: 'Unknown plan or invalid credits' });
      }

      const effectivePlan = plan === 'custom' ? 'trial' : plan;
      const entry = {
        planId: plan,
        effectivePlan,
        method: 'admin_set_plan',
        amount,
        date: now,
        note,
        grantedBy: auth.user?.id || 'admin',
        grantedByName: auth.user?.firstName || 'Admin',
        originalIdentifier: identifier,
        resolvedFrom: resolved.resolvedFrom,
        isGranted: true,
        isTest: false,
        providerChargeId: 'ADMIN_SET_PLAN',
      };

      // Если выдаём по Telegram ID — сохраняем его как STRING чтобы collectionGroup мог найти
      const telegramIdToSave = resolved.telegramId ? String(resolved.telegramId) : undefined;

      await ref.set({
        plan: effectivePlan,
        credits: amount,
        creditsTotal: amount,
        planActivatedAt: FieldValue.serverTimestamp(),
        planExpiresAt: buildExpiresAt(effectivePlan),
        subscriptionStatus: 'active',
        status: 'active',
        payments: FieldValue.arrayUnion(entry),
        grantedByAdmin: true,
        updatedAt: FieldValue.serverTimestamp(),
        // Сохраняем telegramId как STRING — для collectionGroup поиска в админке
        ...(telegramIdToSave ? { telegramId: telegramIdToSave } : {}),
      }, { merge: true });

      // Sync to PostgreSQL
      const cleanTgIdPlan = resolved.telegramId || (resolved.uid.startsWith('tg_') ? resolved.uid.slice(3) : resolved.uid);
      await syncSubscriptionToPostgres({
        telegramId: cleanTgIdPlan,
        email: resolved.email,
        plan: effectivePlan,
        credits: amount,
        creditsTotal: amount,
        expiresAt: buildExpiresAt(effectivePlan),
        status: 'active',
        grantedByAdmin: true,
      });

      const result = await lookupUser(identifier);
      await writeAudit(action, auth.user, { identifier, plan, amount, note }, { uid: resolved.uid });
      return res.status(200).json({ ok: true, action, ...result });
    }

    if (action === 'disable-plan') {
      await ref.set({
        plan: 'none',
        credits: 0,
        subscriptionStatus: 'canceled',
        status: 'canceled',
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      // Sync to PostgreSQL
      const cleanTgIdDisable = resolved.telegramId || (resolved.uid.startsWith('tg_') ? resolved.uid.slice(3) : resolved.uid);
      await syncSubscriptionToPostgres({
        telegramId: cleanTgIdDisable,
        email: resolved.email,
        plan: 'none',
        credits: 0,
        creditsTotal: 0,
        expiresAt: null,
        status: 'canceled',
        grantedByAdmin: false,
      });

      const result = await lookupUser(identifier);
      await writeAudit(action, auth.user, { identifier, note }, { uid: resolved.uid });
      return res.status(200).json({ ok: true, action, ...result });
    }

    return res.status(400).json({ ok: false, error: `Unknown action: ${action}` });
  } catch (err) {
    console.error('[admin/user-control] Error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
