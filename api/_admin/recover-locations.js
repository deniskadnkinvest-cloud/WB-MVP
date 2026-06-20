// ═══════════════════════════════════════════════════════════════
// POST /api/admin/recover-locations
// Восстанавливает удалённые локации из Firebase Storage.
// Сканирует users/{uid}/locations/ в Storage, скачивает все файлы
// через Admin SDK и пересоздаёт документы в Firestore.
// ═══════════════════════════════════════════════════════════════

import admin from 'firebase-admin';
import { ensureFirebaseAdmin } from '../_firebase-admin.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.replace('Bearer ', '').trim();
  if (!idToken) return res.status(401).json({ ok: false, error: 'No auth token' });

  try {
    ensureFirebaseAdmin();

    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded.uid;

    const { title = 'Восстановленная локация' } = req.body || {};

    let storageBucket = process.env.FIREBASE_STORAGE_BUCKET
      || process.env.VITE_FIREBASE_STORAGE_BUCKET
      || `${process.env.FIREBASE_ADMIN_PROJECT_ID || 'lord-f842d'}.appspot.com`;
    storageBucket = storageBucket.replace('gs://', '').trim();
    if (!storageBucket) storageBucket = 'lord-f842d.appspot.com';

    const bucket = admin.storage().bucket(storageBucket);
    const prefix = `users/${uid}/locations/`;

    console.log(`[recover-locations] Scanning bucket=${storageBucket}, prefix=${prefix}`);

    // Список всех файлов пользователя в папке locations
    const [files] = await bucket.getFiles({ prefix });

    console.log(`[recover-locations] Found ${files.length} files in Storage`);

    if (files.length === 0) {
      return res.status(200).json({
        ok: false,
        error: 'No files found in Storage under ' + prefix,
        bucket: storageBucket,
        hint: 'Files may have never been uploaded (empty bucket), or wrong bucket name',
      });
    }

    // Скачиваем все файлы как base64 (максимум 5)
    const filesToRecover = files.slice(0, 5);
    const base64Results = await Promise.all(
      filesToRecover.map(async (file) => {
        try {
          const [buffer] = await file.download();
          return `data:image/jpeg;base64,${buffer.toString('base64')}`;
        } catch (err) {
          console.warn(`[recover-locations] Failed to download ${file.name}:`, err.message);
          return null;
        }
      })
    );

    const validBase64 = base64Results.filter(Boolean);

    if (validBase64.length === 0) {
      return res.status(200).json({
        ok: false,
        error: 'Files exist in Storage but could not be downloaded',
        filesFound: files.length,
        bucket: storageBucket,
      });
    }

    // Пересоздаём документ в Firestore
    const db = admin.firestore();
    const locRef = await db.collection(`users/${uid}/saved_locations`).add({
      title,
      imageBase64: validBase64,
      imageUrls: filesToRecover.map(f => `recovered`),
      storagePaths: filesToRecover.map(f => f.name),
      thumbnail: null,
      restoredAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[recover-locations] ✅ Created new location doc ${locRef.id} with ${validBase64.length} images`);

    return res.status(200).json({
      ok: true,
      locationId: locRef.id,
      count: validBase64.length,
      totalFilesFound: files.length,
      base64: validBase64,
    });

  } catch (err) {
    console.error('[recover-locations] Error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
