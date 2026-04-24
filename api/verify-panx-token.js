import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Initialize Firebase Admin (only once)
if (!getApps().length) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : null;

  if (serviceAccount) {
    initializeApp({ credential: cert(serviceAccount) });
  } else {
    // Fallback: initialize without service account (limited functionality)
    initializeApp({ projectId: 'lord-f842d' });
  }
}

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
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: 'Missing idToken' });
    }

    // Verify the ID token from PANX marketplace
    const decodedToken = await getAuth().verifyIdToken(idToken);

    // Create a custom token for the same user
    const customToken = await getAuth().createCustomToken(decodedToken.uid);

    return res.status(200).json({
      success: true,
      customToken,
      uid: decodedToken.uid,
    });
  } catch (error) {
    console.error('Token verification error:', error.message);
    return res.status(401).json({
      error: 'Invalid token',
      details: error.message,
    });
  }
}
