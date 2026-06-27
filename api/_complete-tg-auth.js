import { query } from './_db.js';
import jwt from 'jsonwebtoken';

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
    const { idToken, sessionId } = req.body;

    if (!idToken || !sessionId) {
      return res.status(400).json({ error: 'Missing idToken or sessionId' });
    }

    if (!/^tg_[A-Za-z0-9_-]{16,128}$/.test(sessionId)) {
      return res.status(400).json({ error: 'Invalid sessionId' });
    }

    const sessionRes = await query(`SELECT * FROM temp_auth_sessions WHERE id = $1`, [sessionId]);

    if (sessionRes.rows.length === 0) {
      return res.status(404).json({ error: 'Telegram auth session not found' });
    }

    const session = sessionRes.rows[0];
    const expiresAt = new Date(session.expires_at);

    if (session.status !== 'pending' || expiresAt < new Date()) {
      return res.status(409).json({ error: 'Telegram auth session expired or already completed' });
    }

    // 1. Verify the ID token (which is our JWT)
    let decodedToken;
    try {
      decodedToken = jwt.verify(idToken, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // 2. We use the same JWT token for the desktop session, no need to create a new one.
    const customToken = idToken;

    // 3. Write success status and customToken to Postgres temp session
    await query(
      `UPDATE temp_auth_sessions 
       SET status = 'success', custom_token = $1, uid = $2, email = $3, expires_at = NOW() + INTERVAL '1 hour'
       WHERE id = $4`,
      [customToken, decodedToken.uid, decodedToken.email || null, sessionId]
    );

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
