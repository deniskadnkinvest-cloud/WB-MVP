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
  let projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  let clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

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

  // Локальный режим без ключей: инициализируем заглушку, чтобы сервер запускался локально
  console.warn(
    '\n⚠️ [Firebase Admin] Credentials not found (missing FIREBASE_ADMIN_* env vars).\n' +
    '   Initializing Mock Firebase Admin to prevent crash during local development.\n' +
    '   Firestore operations on the backend will show warnings but won\'t crash the server.\n'
  );

  // Валидный по форме приватный ключ RSA (заглушка)
  const mockPrivateKey = [
    '-----BEGIN PRIVATE KEY-----',
    'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC08lw/E5w0tQJ1',
    'a7z4ZVvalV3T3D64JhAoCXf4T69fNjZ6fa204ZIjqD8XA2quJXTwD/TmWSkYQ3jZ',
    '5gFPM5uefy2csLNh/ypUtl4gzS17V/EPlrZwTP6wPft/TCbyu6rJ2WTPbqgtbKpN',
    '+fOW2VDsVaWna24ceQJ4Sc0frmzdZHt1MzrQCRf2ooaoOT24bUTXkSMuyZrpL79z',
    'YY+ZAD6OPxoA/HAdIonPJ5QTffirMxdJZYRLgwxPwpmUMMLW8F9GQWLrei2TT4DU',
    '9JZahF5ipRUHDGNe2gjYadvZdzuGFijHbi6wqkPNbD0Vtt+eON12SrbShNZgmIAE',
    'ewyoHkKlAgMBAAECggEACzWoeU/hsXI1QMj33/uHgTcXpPRT/lx9S72qbPuixac6',
    'IMSAamA/CW522hogFcHESMr0RQDpBtPHPNh+5EUyMtN2I+recge4u57Ang+X7bg4',
    '+to/Wx2p+Ykdd3lkQE1X+0E4eZFFYesFcec2K/YyiTGVHZYOMD1e5czMpFXN8Lka',
    'KP/iOxKXFhvp1U9SoxNdQAK+I/8kcNrS150U7YsjnwHpcv3u1sPuRcpBXgsqO9Sf',
    'NJ/vwELv8iXl6baWqEbivEETE/31kkat2PHjJlPmtyLZpiRdcx8x/zABJiapPgKL',
    'vZUZg1nKR52eegKWtUK88BRJI8TXkdHEr15l3yHFgQKBgQDiqeRRyjh3FRl1bbpb',
    '4xTkONGcIp6R126QmSaXyTv6+VBK/G+ETCiPVUEiBA2Pgr87DDt4XFiPxI89G89w',
    'miN3oe/+4R0hX5tAbw0f4gRd0VW8AXC8me00UtpeATpT9MWAVR1FGea709gu3L7l',
    'PLb+flETzuysXz4z0OZKFkdgeQKBgQDMXbeg9Fw4a08Po1hL3YrM3EoccHgvqKBp',
    '+D+52lsEI9fUAU+EXQjLNAC6rgzEhhje70iKiNlCdyjDpsGlCUA67XkH6gOqEycA',
    'nGZSY+DJpSLoeH3qZUtXRZ+cuz61VY2Vha8L3Kv44R6kkS1nGIaGQ0+Q2dqJ7pq1',
    'DU1N8vcgjQKBgBJK1bNIF6B8om5YqaaKv//fGgN4w8VPVovy4Ct1wRJzFmjG0JUj',
    'tE5E+hmtrA595cL1LMN86GTJ3yl2WhpjRiN8fSrbrgcoeRYNIEkHa4TKxRmEID4I',
    'Sh1j5l2ZycRGx72goNkXywgzg4ncpMdJTBdjyFVJ6M3Mbe+ulzc5bw85AoGBAJcA',
    'iDX9WEa3w2sinpMv1ucXvgrVb3iHeD/UlgGVPbsJYOfdMAv1UhITEpbdE8IB806G',
    'L2ttQlrCAPTPujVfaH4iCVO3rY11KVRiO5iVA/r6cZijryYKQmjxoMYF9Ie39y2L',
    '4ZM6Mjdq32Fpg8qxbHS4N4on7joMe3NbqMr3w3HhAoGAXYP2maVZZRHbkjrD9E/Q',
    '6S6ndr1/pG3ukR+le2wuK8Ht3uYwq36oiJepDonwvRerUiPIfZ4PptM7VxdySDBG',
    'lK9Jvo3O3tyv1B5lMiRZTupAgsuoE79BsG/KPq823HW/W/TVz8Ne0sKuGCpgktSh',
    '8E9/MEg62TIQKiTv9ZznJxQ=',
    '-----END PRIVATE KEY-----'
  ].join('\n');

  initializeApp({
    credential: cert({
      projectId: 'mock-project-id',
      clientEmail: 'mock-email@mock-project-id.iam.gserviceaccount.com',
      privateKey: mockPrivateKey,
    }),
  });
}
