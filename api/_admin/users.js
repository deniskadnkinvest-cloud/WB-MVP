// GET /api/admin/users
// Full user intelligence endpoint: Firestore profiles + subscriptions + Auth + generation logs.

import { ensureFirebaseAdmin } from '../_firebase-admin.js';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
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
  return payment.method === 'admin_grant'
    || payment.method === 'admin_set_plan'
    || payment.method === 'admin_credit_adjustment'
    || payment.isGranted === true
    || payment.providerChargeId === 'ADMIN_GRANT'
    || payment.providerChargeId === 'ADMIN_SET_PLAN';
}

function revenueFromPayments(payments = []) {
  return payments
    .filter(p => p && p.isTest !== true && !isAdminGrant(p) && toNumber(p.amount) > 0)
    .reduce((sum, p) => sum + toNumber(p.amount), 0);
}

function getPrimaryKey(uid, sub = {}) {
  return String(sub.firebaseUid || sub.linkedFirebaseUid || uid);
}

function collectIds(uid, sub = {}, profile = {}, authUser = {}) {
  return Array.from(new Set([
    uid,
    sub.telegramId,
    sub.firebaseUid,
    sub.migratedFromTgId,
    sub.linkedFirebaseUid,
    profile.telegramId,
    authUser.uid,
  ].filter(Boolean).map(value => String(value).trim()).filter(Boolean)));
}

function channelFor(user) {
  if (user.telegramId || user.ids.some(id => /^\d+$/.test(id))) return 'telegram';
  if (user.email) return 'email';
  if (user.authProvider) return user.authProvider;
  return 'unknown';
}

function ensureUser(map, key) {
  if (!map.has(key)) {
    map.set(key, {
      uid: key,
      primaryKey: key,
      ids: new Set([key]),
      profile: null,
      auth: null,
      subDocs: [],
      subscription: null,
      generations: {
        total: 0,
        success: 0,
        failed: 0,
        byType: {},
        lastAt: null,
        lastType: null,
        lastError: null,
      },
    });
  }
  return map.get(key);
}

function chooseBestSub(current, candidate) {
  if (!current) return candidate;
  const currentScore = (current.uid === current.primaryKey ? 4 : 0) + toNumber(current.creditsTotal);
  const candidateScore = (candidate.uid === candidate.primaryKey ? 4 : 0) + toNumber(candidate.creditsTotal);
  if (candidateScore !== currentScore) return candidateScore > currentScore ? candidate : current;
  return new Date(candidate.updatedAt || candidate.planActivatedAt || 0) > new Date(current.updatedAt || current.planActivatedAt || 0)
    ? candidate
    : current;
}

async function getAuthUsers(limit) {
  const users = [];
  let pageToken;
  try {
    do {
      const page = await getAuth().listUsers(Math.min(1000, limit - users.length), pageToken);
      users.push(...page.users);
      pageToken = page.pageToken;
    } while (pageToken && users.length < limit);
  } catch (err) {
    console.warn('[admin/users] Auth listUsers failed:', err.message);
  }
  return users;
}

async function getGenerations(limit) {
  try {
    const snap = await db.collection('generations').orderBy('createdAt', 'desc').limit(limit).get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.warn('[admin/users] ordered generations query failed:', err.message);
    const snap = await db.collection('generations').limit(limit).get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key, X-Admin-Init-Data');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  const adminAuth = checkAdminAuth(req);
  if (!adminAuth.ok) return res.status(403).json({ ok: false, error: 'Access denied' });

  try {
    const limit = Math.min(parseInt(req.query.limit || '500', 10) || 500, 2000);
    const generationLimit = Math.min(parseInt(req.query.generationLimit || '5000', 10) || 5000, 10000);
    const search = String(req.query.search || '').trim().toLowerCase();
    const planFilter = String(req.query.plan || 'all');
    const channelFilter = String(req.query.channel || 'all');
    const includeAnonymous = req.query.includeAnonymous === 'true';

    const [profilesSnap, subSnap, generations, authUsers] = await Promise.all([
      db.collection('users').limit(2000).get().catch(() => ({ docs: [] })),
      db.collectionGroup('subscription').get().catch(err => {
        console.warn('[admin/users] subscriptions lookup failed:', err.message);
        return { docs: [] };
      }),
      getGenerations(generationLimit).catch(err => {
        console.warn('[admin/users] generations lookup failed:', err.message);
        return [];
      }),
      getAuthUsers(2000),
    ]);

    const users = new Map();
    const idToPrimary = new Map();

    profilesSnap.docs.forEach(doc => {
      const profile = doc.data() || {};
      const uid = doc.id;
      const user = ensureUser(users, uid);
      user.profile = { uid, ...profile };
      collectIds(uid, {}, profile).forEach(id => {
        user.ids.add(id);
        idToPrimary.set(id, uid);
      });
    });

    authUsers.forEach(record => {
      const uid = record.uid;
      const user = ensureUser(users, uid);
      const provider = record.providerData?.[0]?.providerId || (record.email ? 'password/email' : 'anonymous');
      user.auth = {
        uid,
        email: record.email || null,
        displayName: record.displayName || null,
        phoneNumber: record.phoneNumber || null,
        providerId: provider,
        creationTime: record.metadata?.creationTime || null,
        lastSignInTime: record.metadata?.lastSignInTime || null,
        disabled: record.disabled || false,
      };
      user.ids.add(uid);
      idToPrimary.set(uid, uid);
    });

    subSnap.docs.forEach(docSnap => {
      if (docSnap.ref.id !== 'current') return;
      const uid = docSnap.ref.parent.parent?.id;
      if (!uid) return;
      const sub = docSnap.data() || {};
      const key = getPrimaryKey(uid, sub);
      const user = ensureUser(users, key);
      const ids = collectIds(uid, sub);

      ids.forEach(id => {
        user.ids.add(id);
        idToPrimary.set(id, key);
      });

      const payments = Array.isArray(sub.payments) ? sub.payments : [];
      const subEntry = {
        uid,
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
        telegramId: sub.telegramId || sub.migratedFromTgId || null,
        firebaseUid: sub.firebaseUid || sub.linkedFirebaseUid || null,
        grantedByAdmin: Boolean(sub.grantedByAdmin),
        paymentsCount: payments.length,
        adminGrantsCount: payments.filter(isAdminGrant).length,
        ltv: revenueFromPayments(payments),
      };

      user.subDocs.push(subEntry);
      user.subscription = chooseBestSub(user.subscription, subEntry);
    });

    generations.forEach(gen => {
      const rawId = gen.userId ? String(gen.userId) : '';
      if (!rawId) return;
      const key = idToPrimary.get(rawId) || rawId;
      const user = ensureUser(users, key);
      user.ids.add(rawId);
      idToPrimary.set(rawId, key);

      const bucket = user.generations;
      bucket.total += 1;
      if (gen.success === false) {
        bucket.failed += 1;
        bucket.lastError = bucket.lastError || gen.error || null;
      } else {
        bucket.success += 1;
      }
      const type = gen.type || 'unknown';
      bucket.byType[type] = (bucket.byType[type] || 0) + 1;
      const createdAt = toIso(gen.createdAt);
      if (createdAt && (!bucket.lastAt || new Date(createdAt) > new Date(bucket.lastAt))) {
        bucket.lastAt = createdAt;
        bucket.lastType = type;
        bucket.lastError = gen.success === false ? (gen.error || null) : bucket.lastError;
      }
    });

    // ═══ DEDUPLICATION: merge entries sharing the same Telegram ID ═══
    const rawRecordCount = users.size;
    const tgIdToKeys = new Map();
    for (const [key, user] of users) {
      const sub = user.subscription || {};
      const prof = user.profile || {};
      const tgId = sub.telegramId || prof.telegramId
        || Array.from(user.ids).find(id => /^\d{5,}$/.test(id));
      if (tgId) {
        const tgKey = String(tgId);
        if (!tgIdToKeys.has(tgKey)) tgIdToKeys.set(tgKey, []);
        tgIdToKeys.get(tgKey).push(key);
      }
    }
    for (const [, keys] of tgIdToKeys) {
      if (keys.length <= 1) continue;
      let bestKey = keys[0];
      let bestScore = -1;
      for (const k of keys) {
        const u = users.get(k);
        if (!u) continue;
        let score = u.generations.total;
        if (u.subscription) score += 10 + toNumber(u.subscription.creditsTotal);
        if (u.profile) score += 5;
        if (u.auth) score += 3;
        if (score > bestScore) { bestScore = score; bestKey = k; }
      }
      const primary = users.get(bestKey);
      if (!primary) continue;
      for (const k of keys) {
        if (k === bestKey) continue;
        const dup = users.get(k);
        if (!dup) continue;
        dup.ids.forEach(id => primary.ids.add(id));
        primary.generations.total += dup.generations.total;
        primary.generations.success += dup.generations.success;
        primary.generations.failed += dup.generations.failed;
        for (const [t, cnt] of Object.entries(dup.generations.byType)) {
          primary.generations.byType[t] = (primary.generations.byType[t] || 0) + cnt;
        }
        if (dup.generations.lastAt && (!primary.generations.lastAt || new Date(dup.generations.lastAt) > new Date(primary.generations.lastAt))) {
          primary.generations.lastAt = dup.generations.lastAt;
          primary.generations.lastType = dup.generations.lastType;
        }
        if (dup.generations.lastError && !primary.generations.lastError) {
          primary.generations.lastError = dup.generations.lastError;
        }
        if (dup.subscription) {
          primary.subscription = chooseBestSub(primary.subscription, dup.subscription);
        }
        primary.subDocs.push(...dup.subDocs);
        if (!primary.profile && dup.profile) primary.profile = dup.profile;
        if (!primary.auth && dup.auth) primary.auth = dup.auth;
        users.delete(k);
      }
    }

    const rows = Array.from(users.values()).map(user => {
      const sub = user.subscription || {};
      const profile = user.profile || {};
      const auth = user.auth || {};
      const ids = Array.from(user.ids);
      const telegramId = sub.telegramId || profile.telegramId || ids.find(id => /^\d+$/.test(id)) || null;
      const email = profile.email || auth.email || null;
      const row = {
        uid: user.primaryKey,
        primaryKey: user.primaryKey,
        ids,
        displayName: profile.firstName || auth.displayName || profile.username || email || telegramId || user.primaryKey,
        username: profile.username || null,
        firstName: profile.firstName || null,
        email,
        telegramId,
        channel: null,
        authProvider: auth.providerId || null,
        createdAt: toIso(profile.createdAt) || auth.creationTime || sub.planActivatedAt || null,
        lastSignInAt: auth.lastSignInTime || null,
        plan: sub.plan || 'none',
        effectivePlan: sub.effectivePlan || sub.plan || 'none',
        status: sub.status || (auth.disabled ? 'disabled' : 'unknown'),
        credits: toNumber(sub.credits),
        creditsTotal: toNumber(sub.creditsTotal),
        creditsUsed: toNumber(sub.creditsUsed),
        planActivatedAt: sub.planActivatedAt || null,
        planExpiresAt: sub.planExpiresAt || null,
        grantedByAdmin: Boolean(sub.grantedByAdmin),
        ltv: toNumber(sub.ltv),
        paymentsCount: toNumber(sub.paymentsCount),
        adminGrantsCount: toNumber(sub.adminGrantsCount),
        generationCount: user.generations.total,
        successCount: user.generations.success,
        failedCount: user.generations.failed,
        generationTypes: user.generations.byType,
        lastGenerationAt: user.generations.lastAt,
        lastGenerationType: user.generations.lastType,
        lastError: user.generations.lastError,
        linkedSubscriptionDocs: user.subDocs,
      };
      row.channel = channelFor(row);
      row.isReal = row.generationCount > 0
        || (row.plan && row.plan !== 'none')
        || !!row.telegramId
        || !!row.email
        || (row.authProvider && row.authProvider !== 'anonymous');
      return row;
    });

    let filtered = rows.filter(row => {
      if (!includeAnonymous && !row.isReal) return false;
      if (planFilter !== 'all' && row.plan !== planFilter) return false;
      if (channelFilter !== 'all' && row.channel !== channelFilter) return false;
      if (!search) return true;
      return [
        row.uid,
        row.displayName,
        row.username,
        row.firstName,
        row.email,
        row.telegramId,
        row.channel,
        ...row.ids,
      ].filter(Boolean).some(value => String(value).toLowerCase().includes(search));
    });

    filtered.sort((a, b) => {
      const activityA = new Date(a.lastGenerationAt || a.lastSignInAt || a.createdAt || 0).getTime();
      const activityB = new Date(b.lastGenerationAt || b.lastSignInAt || b.createdAt || 0).getTime();
      return activityB - activityA;
    });

    const summary = rows.reduce((acc, row) => {
      acc.totalRecords += 1;
      if (row.isReal) {
        acc.totalUsers += 1;
        acc.totalGenerations += row.generationCount;
        acc.totalErrors += row.failedCount;
        acc.totalCreditsLeft += row.credits;
        acc.totalCreditsUsed += row.creditsUsed;
        acc.byChannel[row.channel] = (acc.byChannel[row.channel] || 0) + 1;
        acc.byPlan[row.plan] = (acc.byPlan[row.plan] || 0) + 1;
        if (row.plan && row.plan !== 'none') acc.activeSubscriptions += 1;
        if (row.generationCount > 0) acc.generatedUsers += 1;
      } else {
        acc.anonymousSessions += 1;
      }
      return acc;
    }, {
      totalRecords: 0,
      totalUsers: 0,
      anonymousSessions: 0,
      activeSubscriptions: 0,
      generatedUsers: 0,
      totalGenerations: 0,
      totalErrors: 0,
      totalCreditsLeft: 0,
      totalCreditsUsed: 0,
      byChannel: {},
      byPlan: {},
    });

    return res.status(200).json({
      ok: true,
      users: filtered.slice(0, limit),
      summary,
      totalMatched: filtered.length,
      generatedAt: new Date().toISOString(),
      sourceCounts: {
        firestoreProfiles: profilesSnap.docs.length,
        subscriptions: subSnap.docs.length,
        generationsScanned: generations.length,
        authUsers: authUsers.length,
        rawRecordCount,
        deduplicatedTo: rows.length,
      },
    });
  } catch (err) {
    console.error('[admin/users] Error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
