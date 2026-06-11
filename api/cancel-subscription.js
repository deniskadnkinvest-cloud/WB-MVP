// POST /api/cancel-subscription
// Отключает автопродление подписки пользователя в Firestore.

import { ensureFirebaseAdmin } from './_firebase-admin.js';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { alertOnError } from './_admin-alerts.js';

ensureFirebaseAdmin();
const db = getFirestore();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { uid } = req.body || {};

  if (!uid) {
    return res.status(400).json({ ok: false, error: 'uid is required' });
  }

  try {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!idToken) {
      return res.status(401).json({ ok: false, error: 'Authorization token is required' });
    }

    const decoded = await getAuth().verifyIdToken(idToken);
    if (decoded.uid !== uid) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    const ref = db.doc(`users/${uid}/subscription/current`);
    const doc = await ref.get();

    if (!doc.exists) {
      return res.status(404).json({ ok: false, error: 'Subscription not found' });
    }

    await ref.update({
      autoRenew: false,
      yookassaPaymentMethodId: FieldValue.delete(),
    });

    console.log(`[Subscription] Auto-renew disabled for user ${uid}`);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('cancel-subscription error:', err);
    alertOnError(err, `cancel-subscription [${uid}]`).catch(() => {});
    return res.status(500).json({ ok: false, error: err.message });
  }
}
