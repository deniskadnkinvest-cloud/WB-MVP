// GET /api/admin/debug-sub?email=xxx
// Диагностический эндпоинт: показывает ВСЕ subscription-документы
// для конкретного email или telegramId

import { ensureFirebaseAdmin } from '../_firebase-admin.js';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { checkAdminAuth } from './verify.js';

ensureFirebaseAdmin();
const db = getFirestore();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key, X-Admin-Init-Data');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const adminAuth = checkAdminAuth(req);
  if (!adminAuth.ok) {
    return res.status(403).json({ ok: false, error: 'Нет доступа' });
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const email = url.searchParams.get('email')?.trim().toLowerCase();
    const telegramId = url.searchParams.get('telegramId')?.trim();

    if (!email && !telegramId) {
      return res.status(400).json({ ok: false, error: 'Укажите ?email=... или ?telegramId=...' });
    }

    const results = {
      authUsers: [],
      subscriptionDocs: [],
      pendingGrants: [],
      profileDocs: [],
    };

    // 1. Find all Firebase Auth users with this email
    if (email) {
      try {
        const authUser = await getAuth().getUserByEmail(email);
        results.authUsers.push({
          uid: authUser.uid,
          email: authUser.email,
          displayName: authUser.displayName,
          disabled: authUser.disabled,
          providers: authUser.providerData?.map(p => p.providerId) || [],
          creationTime: authUser.metadata?.creationTime,
          lastSignInTime: authUser.metadata?.lastSignInTime,
        });
      } catch (e) {
        results.authUsers.push({ error: e.message });
      }

      // Check pending_grants
      try {
        const pendingRef = db.doc(`pending_grants/${email}`);
        const pendingSnap = await pendingRef.get();
        if (pendingSnap.exists) {
          results.pendingGrants.push({ id: email, ...pendingSnap.data() });
        }
      } catch (e) {
        results.pendingGrants.push({ error: e.message });
      }
    }

    // 2. Collect all user UIDs to check
    const uidsToCheck = new Set();

    // Add UIDs from auth
    results.authUsers.forEach(u => { if (u.uid) uidsToCheck.add(u.uid); });

    // Add telegramId as UID too (sometimes used directly)
    if (telegramId) uidsToCheck.add(telegramId);

    // Scan ALL subscription docs to find any matching email or telegramId
    const usersSnap = await db.collectionGroup('subscription').get();
    for (const doc of usersSnap.docs) {
      const data = doc.data();
      const parentUid = doc.ref.parent.parent?.id;
      
      const matchesEmail = email && (
        data.email === email ||
        data.payments?.some(p => p.email === email)
      );
      const matchesTgId = telegramId && (
        String(data.telegramId) === telegramId ||
        String(data.migratedFromTgId) === telegramId ||
        String(parentUid) === telegramId
      );
      
      if (matchesEmail || matchesTgId || uidsToCheck.has(parentUid)) {
        uidsToCheck.add(parentUid);
        results.subscriptionDocs.push({
          path: doc.ref.path,
          parentUid,
          data: {
            plan: data.plan,
            credits: data.credits,
            creditsTotal: data.creditsTotal,
            status: data.status,
            subscriptionStatus: data.subscriptionStatus,
            planActivatedAt: data.planActivatedAt,
            planExpiresAt: data.planExpiresAt,
            telegramId: data.telegramId,
            firebaseUid: data.firebaseUid,
            migratedFromTgId: data.migratedFromTgId,
            grantedByAdmin: data.grantedByAdmin,
            email: data.email,
            paymentsCount: (data.payments || []).length,
            payments: (data.payments || []).map(p => ({
              planId: p.planId,
              method: p.method,
              amount: p.amount,
              date: p.date,
              grantedBy: p.grantedBy,
              note: p.note,
            })),
            effectivePlan: data.effectivePlan,
            updatedAt: data.updatedAt,
          }
        });
      }
    }

    // 3. Check profile docs
    for (const uid of uidsToCheck) {
      try {
        const profileRef = db.doc(`users/${uid}/profile/main`);
        const profileSnap = await profileRef.get();
        if (profileSnap.exists) {
          results.profileDocs.push({ uid, ...profileSnap.data() });
        }
      } catch (e) {
        // skip
      }
    }

    return res.status(200).json({
      ok: true,
      query: { email, telegramId },
      uidsFound: Array.from(uidsToCheck),
      ...results,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[debug-sub] Error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
