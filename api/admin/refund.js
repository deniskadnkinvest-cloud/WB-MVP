// ═══════════════════════════════════════════════════════════════
// POST /api/admin/refund
// Возвращает 1 кредит пользователю
// Body: { uid: string }
// ═══════════════════════════════════════════════════════════════

import { ensureFirebaseAdmin } from '../_firebase-admin.js';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { verifyTelegramInitData, isAdminId } from './verify.js';

ensureFirebaseAdmin();
const db = getFirestore();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // Проверка прав через admin access key
  const key = req.headers['x-admin-key'];
  const ADMIN_ACCESS_KEY = process.env.ADMIN_ACCESS_KEY;
  if (!key || !ADMIN_ACCESS_KEY || key !== ADMIN_ACCESS_KEY) {
    return res.status(403).json({ ok: false, error: 'Access denied' });
  }

  const { uid, amount = 1 } = req.body || {};
  if (!uid) return res.status(400).json({ ok: false, error: 'uid required' });

  try {
    const ref = db.doc(`users/${uid}/subscription/current`);
    const snap = await ref.get();

    if (!snap.exists) {
      return res.status(404).json({ ok: false, error: 'User subscription not found' });
    }

    await ref.update({
      credits: FieldValue.increment(amount),
    });

    const updated = await ref.get();
    const newCredits = updated.data()?.credits || 0;

    console.log(`✅ [admin/refund] +${amount} credit → user ${uid} by admin ${tgUser.id} (${tgUser.first_name}). New balance: ${newCredits}`);

    return res.status(200).json({
      ok: true,
      uid,
      refundedAmount: amount,
      newCredits,
    });
  } catch (err) {
    console.error('[admin/refund] Error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
