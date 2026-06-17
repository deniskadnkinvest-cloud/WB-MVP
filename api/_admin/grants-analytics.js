// GET /api/admin/grants-analytics
// Cross-cutting report for admin-granted access and generation usage.

import { ensureFirebaseAdmin } from '../_firebase-admin.js';
import { getFirestore } from 'firebase-admin/firestore';
import { checkAdminAuth } from './verify.js';

ensureFirebaseAdmin();
const db = getFirestore();

function toIso(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000).toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isAdminGrant(payment = {}) {
  return payment.method === 'admin_grant' || payment.isGranted === true || payment.providerChargeId === 'ADMIN_GRANT';
}

function uniqPaymentKey(uid, payment = {}) {
  return [
    payment.providerChargeId || 'ADMIN_GRANT',
    payment.method || 'admin_grant',
    toIso(payment.date) || '',
    payment.amount || 0,
    payment.planId || '',
    payment.originalIdentifier || '',
    uid,
  ].join('|');
}

function collectIdentity(uid, sub = {}) {
  const ids = new Set();
  [
    uid,
    sub.telegramId,
    sub.firebaseUid,
    sub.migratedFromTgId,
    sub.linkedFirebaseUid,
    sub.originalIdentifier,
  ].forEach(value => {
    if (value !== undefined && value !== null && String(value).trim()) {
      ids.add(String(value).trim());
    }
  });
  return ids;
}

function primaryKeyFor(uid, sub = {}) {
  return String(sub.firebaseUid || sub.linkedFirebaseUid || uid);
}

function planRank(plan) {
  return ({ none: 0, trial: 1, base: 2, pro: 3, custom: 4 }[plan] ?? 1);
}

function chooseBestSubscription(current, candidate) {
  if (!current) return candidate;

  const currentIsPrimary = current.uid === current.primaryKey;
  const candidateIsPrimary = candidate.uid === candidate.primaryKey;
  if (candidateIsPrimary && !currentIsPrimary) return candidate;
  if (planRank(candidate.plan) > planRank(current.plan)) return candidate;
  if (toNumber(candidate.creditsTotal) > toNumber(current.creditsTotal)) return candidate;

  const currentUpdated = new Date(current.updatedAt || current.planActivatedAt || 0).getTime();
  const candidateUpdated = new Date(candidate.updatedAt || candidate.planActivatedAt || 0).getTime();
  return candidateUpdated > currentUpdated ? candidate : current;
}

async function getGenerationDocs(limit) {
  try {
    const snap = await db.collection('generations').orderBy('createdAt', 'desc').limit(limit).get();
    return snap.docs;
  } catch (err) {
    console.warn('[admin/grants-analytics] ordered generations query failed, fallback:', err.message);
    const snap = await db.collection('generations').limit(limit).get();
    return snap.docs;
  }
}

function ensureUser(groups, key) {
  if (!groups.has(key)) {
    groups.set(key, {
      primaryKey: key,
      ids: new Set([key]),
      grantMap: new Map(),
      subDocs: [],
      bestSub: null,
      generationCount: 0,
      successCount: 0,
      failedCount: 0,
      generationTypes: {},
      lastGenerationAt: null,
      lastGenerationType: null,
    });
  }
  return groups.get(key);
}

function attachGeneration(user, gen = {}) {
  user.generationCount += 1;
  if (gen.success === false) user.failedCount += 1;
  else user.successCount += 1;

  const type = gen.type || 'unknown';
  user.generationTypes[type] = (user.generationTypes[type] || 0) + 1;

  const createdAt = toIso(gen.createdAt);
  if (createdAt && (!user.lastGenerationAt || new Date(createdAt) > new Date(user.lastGenerationAt))) {
    user.lastGenerationAt = createdAt;
    user.lastGenerationType = type;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key, X-Admin-Init-Data');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const auth = checkAdminAuth(req);
  if (!auth.ok) {
    return res.status(403).json({ ok: false, error: 'Access denied' });
  }

  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit || '2000', 10) || 2000, 100), 5000);
    const [subSnap, generationDocs, pendingSnap] = await Promise.all([
      db.collectionGroup('subscription').get(),
      getGenerationDocs(limit),
      db.collection('pending_grants').get().catch(() => ({ docs: [] })),
    ]);

    const groups = new Map();
    const idToPrimaryKey = new Map();

    subSnap.forEach(docSnap => {
      if (docSnap.ref.id !== 'current') return;
      const uid = docSnap.ref.parent.parent?.id;
      if (!uid) return;

      const sub = docSnap.data() || {};
      const grants = Array.isArray(sub.payments) ? sub.payments.filter(isAdminGrant) : [];
      if (!sub.grantedByAdmin && grants.length === 0) return;

      const key = primaryKeyFor(uid, sub);
      const user = ensureUser(groups, key);
      const ids = collectIdentity(uid, sub);
      ids.forEach(id => {
        user.ids.add(id);
        idToPrimaryKey.set(id, key);
      });

      const subEntry = {
        uid: String(uid),
        primaryKey: key,
        plan: sub.plan || 'none',
        effectivePlan: sub.effectivePlan || sub.plan || 'none',
        status: sub.subscriptionStatus || sub.status || 'unknown',
        credits: toNumber(sub.credits),
        creditsTotal: toNumber(sub.creditsTotal),
        creditsUsed: Math.max(0, toNumber(sub.creditsTotal) - toNumber(sub.credits)),
        planActivatedAt: toIso(sub.planActivatedAt),
        planExpiresAt: toIso(sub.planExpiresAt),
        updatedAt: toIso(sub.updatedAt),
        telegramId: sub.telegramId ? String(sub.telegramId) : null,
        firebaseUid: sub.firebaseUid ? String(sub.firebaseUid) : null,
        migratedFromTgId: sub.migratedFromTgId ? String(sub.migratedFromTgId) : null,
        linkedFirebaseUid: sub.linkedFirebaseUid ? String(sub.linkedFirebaseUid) : null,
        lastTelegramSyncAt: toIso(sub.lastTelegramSyncAt),
        lastLinkedAt: toIso(sub.lastLinkedAt),
        grantedByAdmin: Boolean(sub.grantedByAdmin),
      };

      user.subDocs.push(subEntry);
      user.bestSub = chooseBestSubscription(user.bestSub, subEntry);

      grants.forEach(payment => {
        const paymentKey = uniqPaymentKey(uid, payment);
        if (!user.grantMap.has(paymentKey)) {
          user.grantMap.set(paymentKey, {
            uid: String(uid),
            planId: payment.planId || payment.effectivePlan || subEntry.plan,
            effectivePlan: payment.effectivePlan || payment.planId || subEntry.effectivePlan,
            amount: toNumber(payment.amount),
            currency: payment.currency || 'credits',
            date: toIso(payment.date),
            note: payment.note || '',
            grantedBy: payment.grantedBy || payment.grantedByName || null,
            originalIdentifier: payment.originalIdentifier || null,
            resolvedFrom: payment.resolvedFrom || null,
          });
        }
      });
    });

    generationDocs.forEach(docSnap => {
      const gen = docSnap.data() || {};
      const userId = gen.userId ? String(gen.userId) : '';
      if (!userId) return;

      const key = idToPrimaryKey.get(userId);
      if (!key) return;
      attachGeneration(ensureUser(groups, key), gen);
    });

    const pending = [];
    pendingSnap.docs.forEach(docSnap => {
      const data = docSnap.data() || {};
      pending.push({
        id: docSnap.id,
        identifier: data.identifier || data.email || docSnap.id,
        plan: data.plan || data.planId || 'unknown',
        credits: toNumber(data.credits || data.creditsGranted),
        note: data.note || '',
        createdAt: toIso(data.createdAt),
        grantedBy: data.grantedByName || data.grantedBy || null,
        status: 'pending',
      });
    });

    const users = Array.from(groups.values()).map(user => {
      const sub = user.bestSub || {};
      const grants = Array.from(user.grantMap.values()).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      const creditsTotal = toNumber(sub.creditsTotal);
      const paymentGrantedCredits = grants.reduce((sum, grant) => sum + toNumber(grant.amount), 0);
      const grantedCredits = paymentGrantedCredits || creditsTotal;
      const creditsUsed = Math.max(toNumber(sub.creditsUsed), grantedCredits ? Math.max(0, grantedCredits - toNumber(sub.credits)) : 0);
      const usageRate = grantedCredits > 0 ? Math.min(100, Math.round((creditsUsed / grantedCredits) * 100)) : 0;

      return {
        uid: sub.uid || user.primaryKey,
        primaryKey: user.primaryKey,
        ids: Array.from(user.ids),
        telegramId: sub.telegramId || sub.migratedFromTgId || null,
        firebaseUid: sub.firebaseUid || sub.linkedFirebaseUid || (sub.uid && !/^\d+$/.test(sub.uid) ? sub.uid : null),
        plan: sub.plan || 'none',
        effectivePlan: sub.effectivePlan || sub.plan || 'none',
        status: sub.status || 'unknown',
        credits: toNumber(sub.credits),
        creditsTotal,
        creditsUsed,
        grantedCredits,
        usageRate,
        planActivatedAt: sub.planActivatedAt || null,
        planExpiresAt: sub.planExpiresAt || null,
        lastTelegramSyncAt: sub.lastTelegramSyncAt || null,
        lastLinkedAt: sub.lastLinkedAt || null,
        grants,
        grantCount: grants.length,
        firstGrantAt: grants.length ? grants[grants.length - 1].date : null,
        lastGrantAt: grants.length ? grants[0].date : null,
        generationCount: user.generationCount,
        successCount: user.successCount,
        failedCount: user.failedCount,
        generationTypes: user.generationTypes,
        lastGenerationAt: user.lastGenerationAt,
        lastGenerationType: user.lastGenerationType,
        subDocCount: user.subDocs.length,
        linkedSubscriptionDocs: user.subDocs,
      };
    }).sort((a, b) => {
      const genDelta = new Date(b.lastGenerationAt || 0) - new Date(a.lastGenerationAt || 0);
      if (genDelta !== 0) return genDelta;
      return new Date(b.lastGrantAt || 0) - new Date(a.lastGrantAt || 0);
    });

    const modeCounts = {};
    users.forEach(user => {
      Object.entries(user.generationTypes || {}).forEach(([type, count]) => {
        modeCounts[type] = (modeCounts[type] || 0) + count;
      });
    });

    const totals = users.reduce((acc, user) => {
      acc.totalGrantedCredits += user.grantedCredits;
      acc.totalCreditsLeft += user.credits;
      acc.totalCreditsUsed += user.creditsUsed;
      acc.totalGenerations += user.generationCount;
      acc.totalSuccess += user.successCount;
      acc.totalFailed += user.failedCount;
      if (user.generationCount > 0) acc.usedGrantedUsers += 1;
      if (user.telegramId || /^\d+$/.test(String(user.uid))) acc.telegramGrantedUsers += 1;
      return acc;
    }, {
      totalGrantedCredits: 0,
      totalCreditsLeft: 0,
      totalCreditsUsed: 0,
      totalGenerations: 0,
      totalSuccess: 0,
      totalFailed: 0,
      usedGrantedUsers: 0,
      telegramGrantedUsers: 0,
    });

    const summary = {
      totalGrantedUsers: users.length,
      pendingGrants: pending.length,
      telegramGrantedUsers: totals.telegramGrantedUsers,
      usedGrantedUsers: totals.usedGrantedUsers,
      activationRate: users.length ? Math.round((totals.usedGrantedUsers / users.length) * 100) : 0,
      successRate: totals.totalGenerations ? Math.round((totals.totalSuccess / totals.totalGenerations) * 100) : 0,
      ...totals,
      modeCounts,
      generationSampleLimit: limit,
    };

    return res.status(200).json({
      ok: true,
      summary,
      users,
      pending,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[admin/grants-analytics] Error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
