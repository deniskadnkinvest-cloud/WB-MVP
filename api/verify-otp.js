import jwt from 'jsonwebtoken';
import { query } from './_db.js';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'vton-secret-2026';

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

    const otpRes = await query(`SELECT * FROM otps WHERE email = $1`, [email]);

    if (otpRes.rows.length === 0) {
      return res.status(400).json({ error: 'Код подтверждения не найден. Запросите код заново.' });
    }

    const otpData = otpRes.rows[0];
    const expiresAt = new Date(otpData.expires_at);
    const attempts = otpData.attempts || 0;

    if (attempts >= 5) {
      await query(`DELETE FROM otps WHERE email = $1`, [email]);
      return res.status(429).json({ error: 'Слишком много неверных попыток. Запросите новый код.' });
    }

    // 1. Check expiration
    if (expiresAt < new Date()) {
      await query(`DELETE FROM otps WHERE email = $1`, [email]);
      return res.status(400).json({ error: 'Срок действия кода истек. Запросите код заново.' });
    }

    // 2. Verify code
    if (otpData.code !== code) {
      await query(`UPDATE otps SET attempts = attempts + 1 WHERE email = $1`, [email]);
      return res.status(400).json({ error: 'Неверный код подтверждения.' });
    }

    // 3. User Resolution (Get or Create Postgres User)
    // Priority: find existing PostgreSQL user by email -> use their telegram_id
    let stableUid;
    try {
      const existingUser = await query(
        `SELECT telegram_id FROM users WHERE email = $1 LIMIT 1`,
        [email]
      );
      if (existingUser.rows.length > 0 && existingUser.rows[0].telegram_id) {
        // User already exists in DB
        stableUid = existingUser.rows[0].telegram_id;
        console.log(`🔗 Linked email ${email} to existing user: uid=${stableUid}`);
      } else {
        // Generate a new stable UUID for email-only users
        stableUid = crypto.randomUUID();
        
        const { rows } = await query(
          `INSERT INTO users (telegram_id, email, role)
           VALUES ($1, $2, 'user')
           ON CONFLICT (telegram_id) DO UPDATE
             SET email = COALESCE(EXCLUDED.email, users.email)
           RETURNING id, telegram_id`,
          [stableUid, email]
        );
        // Ensure subscription record exists
        if (rows[0]) {
          await query(
            `INSERT INTO subscriptions (user_id, plan_name, credits, credits_total, status)
             VALUES ($1, 'none', 0, 0, 'inactive')
             ON CONFLICT (user_id) DO NOTHING`,
            [rows[0].id]
          );
        }
        console.log(`📝 Created PostgreSQL user for ${email}: uid=${stableUid}`);
      }
    } catch (dbErr) {
      console.error(`[verify-otp] PostgreSQL user upsert failed: ${dbErr.message}`);
      return res.status(500).json({ error: 'Database error during user resolution' });
    }

    // 4. Generate JWT token
    const customToken = jwt.sign(
      {
        uid: stableUid,
        email,
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    // 5. Cleanup OTP code doc
    await query(`DELETE FROM otps WHERE email = $1`, [email]).catch((err) => {
      console.warn('Failed to delete verified OTP:', err.message);
    });

    console.log(`🎉 OTP Authentication success for ${email}! Token generated with uid=${stableUid}`);

    return res.status(200).json({
      success: true,
      customToken,
      uid: stableUid,
      email,
    });
  } catch (error) {
    console.error('verify-otp error:', error.message);
    return res.status(500).json({
      error: 'Internal server error during OTP verification',
      details: error.message
    });
  }
}
