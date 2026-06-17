// ═══════════════════════════════════════════════════════════════
// GET /api/admin/debug-firebase
// Диагностический эндпоинт для проверки подключения к Firebase
// ═══════════════════════════════════════════════════════════════

import admin from 'firebase-admin';
import { ensureFirebaseAdmin } from '../_firebase-admin.js';
import { checkAdminAuth } from './verify.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key, X-Admin-Init-Data');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  const adminAuth = checkAdminAuth(req);
  if (!adminAuth.ok) {
    return res.status(403).json({ ok: false, error: 'Нет доступа' });
  }

  ensureFirebaseAdmin();
  const db = admin.firestore();

  try {
    const envVars = {
      FIREBASE_SERVICE_ACCOUNT_exists: !!process.env.FIREBASE_SERVICE_ACCOUNT,
      FIREBASE_ADMIN_PROJECT_ID: process.env.FIREBASE_ADMIN_PROJECT_ID || 'not set',
      FIREBASE_ADMIN_CLIENT_EMAIL_exists: !!process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      FIREBASE_ADMIN_PRIVATE_KEY_exists: !!process.env.FIREBASE_ADMIN_PRIVATE_KEY,
      VITE_FIREBASE_PROJECT_ID: process.env.VITE_FIREBASE_PROJECT_ID || 'not set',
    };

    const apps = admin.apps.map(app => ({
      name: app.name,
      projectId: app.options.credential?.projectId || app.options.projectId || 'unknown'
    }));

    // List collections
    const collections = await db.listCollections();
    const collectionIds = collections.map(c => c.id);

    // Count users
    let usersCount = 0;
    try {
      const usersSnap = await db.collection('users').limit(5).get();
      usersCount = usersSnap.size;
    } catch (e) {
      usersCount = `Error: ${e.message}`;
    }

    return res.status(200).json({
      ok: true,
      checkedBy: adminAuth.user?.id || 'admin',
      envVars,
      apps,
      collectionIds,
      usersCount
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
}
