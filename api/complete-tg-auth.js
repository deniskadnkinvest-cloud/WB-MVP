import { ensureFirebaseAdmin } from './_firebase-admin.js';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin
ensureFirebaseAdmin();

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { idToken, sessionId } = req.body;

    if (!idToken || !sessionId) {
      return res.status(400).json({ error: 'Missing idToken or sessionId' });
    }

    if (!/^tg_[A-Za-z0-9_-]{16,128}$/.test(sessionId)) {
      return res.status(400).json({ error: 'Invalid sessionId' });
    }

    const db = getFirestore();
    const sessionRef = db.collection('temp_auth_sessions').doc(sessionId);
    const sessionSnap = await sessionRef.get();

    if (!sessionSnap.exists) {
      return res.status(404).json({ error: 'Telegram auth session not found' });
    }

    const session = sessionSnap.data();
    const expiresAt = session.expiresAt?.toDate?.() || (session.expiresAt ? new Date(session.expiresAt) : null);
    if (session.status !== 'pending' || (expiresAt && expiresAt < new Date())) {
      return res.status(409).json({ error: 'Telegram auth session expired or already completed' });
    }

    // 1. Verify the ID token
    const decodedToken = await getAuth().verifyIdToken(idToken);

    // 2. Create custom token for the user UID
    const customToken = await getAuth().createCustomToken(decodedToken.uid);

    // 3. Write success status and customToken to Firestore temp session doc
    await sessionRef.set({
      status: 'success',
      customToken,
      uid: decodedToken.uid,
      email: decodedToken.email || null,
      updatedAt: new Date(),
    }, { merge: true });

    return res.status(200).json({
      success: true,
      message: 'Telegram auth session successfully updated'
    });
  } catch (error) {
    console.error('complete-tg-auth error:', error.message);
    return res.status(500).json({
      error: 'Failed to complete Telegram auth',
      details: error.message,
    });
  }
}
