// ═══════════════════════════════════════════════════════════════
// POST /api/admin/migrate-location
// Серверная миграция локаций: скачивает файлы из Firebase Storage
// через Admin SDK (полный доступ, минуя Rules и CORS) и возвращает base64.
// Используется когда клиент получает 402/403 при прямом доступе к Storage.
// ═══════════════════════════════════════════════════════════════

import admin from 'firebase-admin';
import { ensureFirebaseAdmin } from '../_firebase-admin.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  // Auth: проверяем Firebase ID token пользователя (не admin key — это для обычных пользователей)
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.replace('Bearer ', '').trim();
  if (!idToken) return res.status(401).json({ ok: false, error: 'No auth token' });

  try {
    ensureFirebaseAdmin();

    // Верифицируем токен пользователя
    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded.uid;

    const { locationId, storagePaths } = req.body;
    if (!locationId || !storagePaths || !Array.isArray(storagePaths) || storagePaths.length === 0) {
      return res.status(400).json({ ok: false, error: 'locationId and storagePaths[] required' });
    }

    // Проверяем что все пути принадлежат этому пользователю (безопасность)
    const allOwnedByUser = storagePaths.every(p => p.startsWith(`users/${uid}/`));
    if (!allOwnedByUser) {
      return res.status(403).json({ ok: false, error: 'Access denied: paths do not belong to user' });
    }

    // Получаем bucket из env или строим из project ID
    let storageBucket = process.env.FIREBASE_STORAGE_BUCKET
      || process.env.VITE_FIREBASE_STORAGE_BUCKET
      || `${process.env.FIREBASE_ADMIN_PROJECT_ID || 'lord-f842d'}.appspot.com`;

    // Убираем gs:// prefix если есть
    storageBucket = storageBucket.replace('gs://', '').trim();
    if (!storageBucket) storageBucket = 'lord-f842d.appspot.com';

    const bucket = admin.storage().bucket(storageBucket);

    // Скачиваем каждый файл и конвертируем в base64
    const base64Results = await Promise.all(
      storagePaths.slice(0, 5).map(async (storagePath) => {
        try {
          const file = bucket.file(storagePath);
          const [exists] = await file.exists();
          if (!exists) {
            console.warn(`[migrate-location] File not found: ${storagePath}`);
            return null;
          }
          const [buffer] = await file.download();
          const mimeType = 'image/jpeg';
          const base64 = `data:${mimeType};base64,${buffer.toString('base64')}`;
          console.log(`[migrate-location] ✅ Downloaded: ${storagePath} (${Math.round(buffer.length / 1024)}KB)`);
          return base64;
        } catch (err) {
          console.warn(`[migrate-location] ⚠️ Failed to download ${storagePath}:`, err.message);
          return null;
        }
      })
    );

    const validBase64 = base64Results.filter(Boolean);

    if (validBase64.length > 0) {
      // Сохраняем base64 обратно в Firestore через Admin SDK
      const db = admin.firestore();
      await db.doc(`users/${uid}/saved_locations/${locationId}`).update({
        imageBase64: validBase64,
        migratedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`[migrate-location] ✅ Patched Firestore for loc ${locationId}: ${validBase64.length} images`);
      return res.status(200).json({ ok: true, count: validBase64.length, base64: validBase64 });
    } else {
      return res.status(200).json({
        ok: false,
        count: 0,
        error: 'Files exist in Firestore but could not be downloaded from Storage. Bucket may be wrong or files deleted.',
        bucket: storageBucket,
      });
    }

  } catch (err) {
    console.error('[migrate-location] Error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
