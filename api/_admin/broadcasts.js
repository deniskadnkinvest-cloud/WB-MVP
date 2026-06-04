// ═══════════════════════════════════════════════════════════════
// GET /api/admin/broadcasts
// Возвращает историю рассылок из Firestore broadcasts
// ═══════════════════════════════════════════════════════════════

import { ensureFirebaseAdmin } from '../_firebase-admin.js';
import { getFirestore } from 'firebase-admin/firestore';
import { checkAdminAuth } from './verify.js';

ensureFirebaseAdmin();
const db = getFirestore();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key, X-Admin-Init-Data');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const adminAuth = checkAdminAuth(req);
  if (!adminAuth.ok) return res.status(403).json({ ok: false, error: 'Нет доступа' });

  try {
    const snap = await db.collection('broadcasts')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const broadcasts = snap.docs.map(doc => doc.data());

    return res.status(200).json({ ok: true, broadcasts });
  } catch (err) {
    console.error('[broadcasts-list] Ошибка:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
