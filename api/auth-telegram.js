// POST /api/auth-telegram
// Верифицирует Telegram initData и возвращает Firebase Custom Token
// с детерминированным UID: tg_{telegramId}
//
// Это РЕШАЕТ корневую проблему: signInAnonymously() создавал НОВЫЙ UID
// при каждом входе, потому что Telegram WebView очищает storage.
// Custom Token с фиксированным UID гарантирует, что пользователь
// ВСЕГДА получает тот же Firebase аккаунт.

import crypto from 'crypto';
import { ensureFirebaseAdmin } from './_firebase-admin.js';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

ensureFirebaseAdmin();

/**
 * Верификация Telegram initData через HMAC-SHA256
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
function verifyAndParseInitData(initData, botToken) {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;

    params.delete('hash');
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (expectedHash !== hash) return null;

    // Проверяем свежесть (не старше 24 часов)
    const authDate = parseInt(params.get('auth_date') || '0', 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) return null;

    const userStr = params.get('user');
    if (!userStr) return null;
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  try {
    const { initData } = req.body || {};

    if (!initData) {
      return res.status(400).json({ ok: false, error: 'initData required' });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.error('[auth-telegram] TELEGRAM_BOT_TOKEN not configured');
      return res.status(500).json({ ok: false, error: 'Server misconfigured' });
    }

    // 1. Верифицируем подпись Telegram initData
    const tgUser = verifyAndParseInitData(initData, botToken);
    if (!tgUser || !tgUser.id) {
      return res.status(401).json({ ok: false, error: 'Invalid or expired initData' });
    }

    const telegramId = String(tgUser.id);
    const stableUid = `tg_${telegramId}`;

    console.log(`[auth-telegram] Verified TG user ${telegramId} (${tgUser.first_name}), issuing token for UID: ${stableUid}`);

    // 2. Генерируем Custom Token с детерминированным UID
    const customToken = await getAuth().createCustomToken(stableUid);

    // 3. Записываем/обновляем маппинг telegram_uid_map
    const db = getFirestore();
    await db.doc(`telegram_uid_map/${telegramId}`).set({
      firebaseUid: stableUid,
      telegramFirstName: tgUser.first_name || '',
      telegramUsername: tgUser.username || '',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    // 4. Миграция: проверяем наличие подписок на СТАРЫХ UID
    //    (от предыдущих signInAnonymously сессий или legacy записей)
    await migrateOldSubscriptions(db, telegramId, stableUid);

    return res.status(200).json({
      ok: true,
      customToken,
      uid: stableUid,
      telegramId,
    });
  } catch (err) {
    console.error('[auth-telegram] Error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

/**
 * Мигрирует подписки со старых UID на новый стабильный UID.
 * Проверяет три источника:
 * 1. telegram_uid_map — может содержать СТАРЫЙ Firebase UID (от signInAnonymously)
 * 2. users/{telegramId}/subscription/current — legacy записи от админки
 * 3. Ищет по полю telegramId в subscription документах (collectionGroup fallback)
 */
async function migrateOldSubscriptions(db, telegramId, stableUid) {
  const targetRef = db.doc(`users/${stableUid}/subscription/current`);
  const targetSnap = await targetRef.get();

  // Если у стабильного UID уже есть активная подписка — не трогаем
  if (targetSnap.exists && targetSnap.data()?.plan !== 'none') {
    return;
  }

  // Источник 1: Legacy путь users/{telegramId}/subscription/current
  try {
    const legacyRef = db.doc(`users/${telegramId}/subscription/current`);
    const legacySnap = await legacyRef.get();
    if (legacySnap.exists && legacySnap.data()?.plan !== 'none') {
      const data = legacySnap.data();
      console.log(`[auth-telegram] Migrating legacy sub from users/${telegramId} → users/${stableUid}`);
      await targetRef.set({
        ...data,
        telegramId,
        migratedFrom: `users/${telegramId}`,
        migratedAt: FieldValue.serverTimestamp(),
      });
      await legacyRef.delete().catch(() => {});
      return; // Успешная миграция, выходим
    }
  } catch (err) {
    console.warn('[auth-telegram] Legacy migration check failed:', err.message);
  }

  // Источник 2: Старые anonymous UID из telegram_uid_map
  try {
    const mapSnap = await db.doc(`telegram_uid_map/${telegramId}`).get();
    if (mapSnap.exists) {
      const oldUid = mapSnap.data()?.firebaseUid;
      // Если старый UID отличается от нового стабильного — мигрируем
      if (oldUid && oldUid !== stableUid) {
        const oldRef = db.doc(`users/${oldUid}/subscription/current`);
        const oldSnap = await oldRef.get();
        if (oldSnap.exists && oldSnap.data()?.plan !== 'none') {
          const data = oldSnap.data();
          console.log(`[auth-telegram] Migrating sub from old UID ${oldUid} → ${stableUid}`);
          await targetRef.set({
            ...data,
            telegramId,
            migratedFrom: `users/${oldUid}`,
            migratedAt: FieldValue.serverTimestamp(),
          });
          await oldRef.delete().catch(() => {});
          return;
        }
      }
    }
  } catch (err) {
    console.warn('[auth-telegram] Old UID migration check failed:', err.message);
  }

  // Источник 3: collectionGroup fallback (ищем по полю telegramId)
  try {
    const subsQuery = await db.collectionGroup('subscription')
      .where('telegramId', '==', telegramId)
      .limit(1)
      .get();
    if (!subsQuery.empty) {
      const foundDoc = subsQuery.docs[0];
      const oldUid = foundDoc.ref.parent.parent.id;
      if (oldUid !== stableUid && foundDoc.data()?.plan !== 'none') {
        const data = foundDoc.data();
        console.log(`[auth-telegram] Migrating sub from collectionGroup ${oldUid} → ${stableUid}`);
        await targetRef.set({
          ...data,
          telegramId,
          migratedFrom: `users/${oldUid}`,
          migratedAt: FieldValue.serverTimestamp(),
        });
        await foundDoc.ref.delete().catch(() => {});
      }
    }
  } catch (err) {
    console.warn('[auth-telegram] collectionGroup migration fallback failed:', err.message);
  }
}
