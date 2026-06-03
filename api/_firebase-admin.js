// ═══════════════════════════════════════════════════════════════
// Shared Firebase Admin SDK initialization
// Единая точка инициализации для всех API-эндпоинтов
// ═══════════════════════════════════════════════════════════════

import { initializeApp, getApps, cert } from 'firebase-admin/app';

/**
 * Инициализирует Firebase Admin SDK один раз.
 * 
 * Поддерживает 2 формата env vars:
 * 1. FIREBASE_SERVICE_ACCOUNT — полный JSON service account
 * 2. FIREBASE_ADMIN_PROJECT_ID + FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY
 * 
 * Если ни один не задан — бросает понятную ошибку.
 */
export function ensureFirebaseAdmin() {
  if (getApps().length > 0) return; // Already initialized

  // Вариант 1: Полный JSON service account
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountJson) {
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      initializeApp({ credential: cert(serviceAccount) });
      return;
    } catch (e) {
      console.error('[Firebase Admin] Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:', e.message);
      throw new Error('FIREBASE_SERVICE_ACCOUNT is set but contains invalid JSON');
    }
  }

  // Вариант 2: Отдельные поля
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
    });
    return;
  }

  // Ни один формат не задан — выбрасываем понятную ошибку
  const missing = [];
  if (!projectId) missing.push('FIREBASE_ADMIN_PROJECT_ID');
  if (!clientEmail) missing.push('FIREBASE_ADMIN_CLIENT_EMAIL');
  if (!privateKey) missing.push('FIREBASE_ADMIN_PRIVATE_KEY');

  throw new Error(
    `Firebase Admin SDK not configured. Missing env vars: ${missing.join(', ')}. ` +
    `Set either FIREBASE_SERVICE_ACCOUNT (full JSON) or all three FIREBASE_ADMIN_* vars in Vercel Environment Variables.`
  );
}
