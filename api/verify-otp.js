import { ensureFirebaseAdmin } from './_firebase-admin.js';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'vton-secret-2026';

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
    let { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: 'Email and code are required' });
    }

    email = email.trim().toLowerCase();
    code = code.trim();

    const db = getFirestore();
    const otpDocRef = db.collection('otp_codes').doc(email);
    const otpDoc = await otpDocRef.get();

    if (!otpDoc.exists) {
      return res.status(400).json({ error: 'Код подтверждения не найден. Запросите код заново.' });
    }

    const otpData = otpDoc.data();
    const expiresAt = otpData.expiresAt.toDate(); // Convert Firestore timestamp to Date object
    const attempts = otpData.attempts || 0;

    if (attempts >= 5) {
      await otpDocRef.delete().catch(() => {});
      return res.status(429).json({ error: 'Слишком много неверных попыток. Запросите новый код.' });
    }

    // 1. Check expiration
    if (expiresAt < new Date()) {
      // Cleanup expired code
      await otpDocRef.delete().catch(() => {});
      return res.status(400).json({ error: 'Срок действия кода истек. Запросите код заново.' });
    }

    // 2. Verify code
    if (otpData.code !== code) {
      await otpDocRef.set({
        attempts: FieldValue.increment(1),
        lastAttemptAt: new Date(),
      }, { merge: true });
      return res.status(400).json({ error: 'Неверный код подтверждения.' });
    }

    // 3. User Resolution (Get or Create Firebase User)
    const authAdmin = getAuth();
    let firebaseUser;
    
    try {
      firebaseUser = await authAdmin.getUserByEmail(email);
      console.log(`👤 User found in Firebase Auth: ${email} (${firebaseUser.uid})`);
    } catch (authError) {
      if (authError.code === 'auth/user-not-found') {
        // Create new user automatically since they verified their email
        try {
          firebaseUser = await authAdmin.createUser({
            email,
            emailVerified: true,
            displayName: email.split('@')[0], // Default display name from email username
          });
          console.log(`🆕 New user automatically created: ${email} (${firebaseUser.uid})`);
        } catch (createError) {
          console.error('Failed to create new user:', createError);
          return res.status(500).json({ error: 'Не удалось создать аккаунт.', details: createError.message });
        }
      } else {
        console.error('Firebase getUserByEmail error:', authError);
        return res.status(500).json({ error: 'Ошибка авторизации.', details: authError.message });
      }
    }

    // 4. Generate JWT token (matching auth-telegram.js pattern)
    const customToken = jwt.sign(
      {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    // 5. Cleanup OTP code doc (security best practice: code is strictly single-use)
    await otpDocRef.delete().catch((err) => {
      console.warn('Failed to delete verified OTP doc (non-fatal):', err.message);
    });

    console.log(`🎉 OTP Authentication success for ${email}! Token generated.`);

    return res.status(200).json({
      success: true,
      customToken,
      uid: firebaseUser.uid,
      email: firebaseUser.email
    });
  } catch (error) {
    console.error('verify-otp error:', error.message);
    return res.status(500).json({
      error: 'Internal server error during OTP verification',
      details: error.message
    });
  }
}
