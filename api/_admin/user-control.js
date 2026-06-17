// POST /api/admin/user-control
// Admin operations for looking up users, opening plans, and adding credits.

import { ensureFirebaseAdmin } from '../_firebase-admin.js';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { checkAdminAuth } from './verify.js';

ensureFirebaseAdmin();
const db = getFirestore();

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
  // Нужно найти реальный Firebase UID пользователя по его Telegram ID.
  // Telegram ID может быть записан в:
  //   1. documents users/{firebaseUID}/subscription/current → поле telegramId
  //   2. documents users/{firebaseUID}/subscription/current → поле migratedFromTgId
  // Если нашли — возвращаем Firebase UID. Если нет — пишем напрямую по числу (старый путь).
  if (/^\d+$/.test(clean)) {
    try {
      // Ищем в subscriptions по полю telegramId
      const byTelegramId = await db.collectionGroup('subscription')
        .where('telegramId', '==', clean)
        .limit(1)
        .get();

      if (!byTelegramId.empty) {
        // путь: users/{uid}/subscription/current → берём uid
        const firebaseUid = byTelegramId.docs[0].ref.parent.parent.id;
        console.log(`[admin/user-control] TG ${clean} → Firebase UID ${firebaseUid} (via telegramId field)`);
        return { uid: firebaseUid, resolvedFrom: 'telegram_id', telegramId: clean, displayInfo: `TG ${clean} -> UID ${firebaseUid}` };
      }

      // Ищем по полю migratedFromTgId (уже мигрировавшие пользователи)
      const byMigrated = await db.collectionGroup('subscription')
        .where('migratedFromTgId', '==', clean)
        .limit(1)
        .get();

      if (!byMigrated.empty) {
        const firebaseUid = byMigrated.docs[0].ref.parent.parent.id;
        console.log(`[admin/user-control] TG ${clean} → Firebase UID ${firebaseUid} (via migratedFromTgId field)`);
        return { uid: firebaseUid, resolvedFrom: 'telegram_id', telegramId: clean, displayInfo: `TG ${clean} -> UID ${firebaseUid} (migrated)` };
      }

      // Пользователь ещё не привязал Firebase аккаунт — записываем напрямую по TG ID
      console.log(`[admin/user-control] TG ${clean} → no Firebase UID found, writing directly to TG doc`);
    } catch (err) {
      console.warn('[admin/user-control] collectionGroup query failed, falling back to direct TG ID:', err.message);
    }

    return { uid: clean, resolvedFrom: 'telegram_id', telegramId: clean, displayInfo: `TG ${clean}` };
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

      await ref.set({
        plan: preservedPlan,
        credits: FieldValue.increment(amount),
        creditsTotal: FieldValue.increment(amount),
        subscriptionStatus: 'active',
        status: 'active',
        payments: FieldValue.arrayUnion(entry),
        grantedByAdmin: true,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

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
      }, { merge: true });

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
