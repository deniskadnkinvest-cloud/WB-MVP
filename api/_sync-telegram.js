// POST /api/sync-telegram
// Регистрирует маппинг Telegram ID → Firebase UID при входе через Telegram Mini App.
// Также мигрирует "мусорные" подписки, записанные по Telegram ID, на правильный Firebase UID путь.

import { ensureFirebaseAdmin } from './_firebase-admin.js';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

ensureFirebaseAdmin();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  try {
    const { idToken, telegramId } = req.body || {};

    if (!idToken || !telegramId) {
      return res.status(400).json({ ok: false, error: 'idToken and telegramId required' });
    }

    const tgIdStr = String(telegramId).trim();
    if (!/^\d+$/.test(tgIdStr)) {
      return res.status(400).json({ ok: false, error: 'Invalid telegramId' });
    }

    // Верифицируем Firebase ID Token чтобы получить настоящий Firebase UID
    const decoded = await getAuth().verifyIdToken(idToken);
    const firebaseUid = decoded.uid;

    const db = getFirestore();

    // 1. Записываем/обновляем маппинг telegram_uid_map
    await db.doc(`telegram_uid_map/${tgIdStr}`).set({
      firebaseUid,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    console.log(`[sync-telegram] Mapped TG ${tgIdStr} → Firebase UID ${firebaseUid}`);

    // 2. Проверяем, нет ли "мусорной" подписки записанной по Telegram ID
    //    (это происходило когда админ выдавал тариф до создания маппинга)
    const legacyRef = db.doc(`users/${tgIdStr}/subscription/current`);
    const legacySnap = await legacyRef.get();

    if (legacySnap.exists && tgIdStr !== firebaseUid) {
      const legacyData = legacySnap.data();
      console.log(`[sync-telegram] Found legacy subscription at users/${tgIdStr}. Migrating to users/${firebaseUid}...`);

      const correctRef = db.doc(`users/${firebaseUid}/subscription/current`);
      const correctSnap = await correctRef.get();

      if (!correctSnap.exists || correctSnap.data()?.plan === 'none') {
        // Переносим legacy подписку на правильный путь
        await correctRef.set({
          ...legacyData,
          telegramId: tgIdStr,
          migratedFromTgId: tgIdStr,
          linkedFirebaseUid: firebaseUid,
          updatedAt: FieldValue.serverTimestamp(),
        });
        console.log(`[sync-telegram] Migrated subscription to users/${firebaseUid}/subscription/current`);
      } else {
        // У пользователя уже есть подписка — мержим кредиты
        const currentData = correctSnap.data();
        const mergedCredits = (currentData.credits || 0) + (legacyData.credits || 0);
        const mergedTotal = (currentData.creditsTotal || 0) + (legacyData.creditsTotal || 0);
        const bestPlan = legacyData.plan !== 'none' ? legacyData.plan : currentData.plan;

        await correctRef.set({
          plan: bestPlan,
          credits: mergedCredits,
          creditsTotal: mergedTotal,
          telegramId: tgIdStr,
          migratedFromTgId: tgIdStr,
          linkedFirebaseUid: firebaseUid,
          grantedByAdmin: currentData.grantedByAdmin || legacyData.grantedByAdmin || false,
          subscriptionStatus: 'active',
          status: 'active',
          payments: [...(currentData.payments || []), ...(legacyData.payments || [])],
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        console.log(`[sync-telegram] Merged legacy subscription into users/${firebaseUid}/subscription/current`);
      }

      // Удаляем legacy документ
      try {
        await legacyRef.delete();
        console.log(`[sync-telegram] Deleted legacy subscription at users/${tgIdStr}/subscription/current`);
      } catch (delErr) {
        console.warn('[sync-telegram] Failed to delete legacy sub:', delErr.message);
      }

      return res.status(200).json({ ok: true, migrated: true, firebaseUid });
    }

    return res.status(200).json({ ok: true, migrated: false, firebaseUid });
  } catch (err) {
    console.error('[sync-telegram] Error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
