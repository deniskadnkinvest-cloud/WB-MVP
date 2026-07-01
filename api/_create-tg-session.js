import { query } from './_db.js';

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
    const { sessionId } = req.body;

    if (!sessionId || !/^tg_[A-Za-z0-9_-]{16,128}$/.test(sessionId)) {
      return res.status(400).json({ error: 'Invalid sessionId' });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);

    await query(
      `INSERT INTO temp_auth_sessions (id, status, created_at, expires_at)
       VALUES ($1, 'pending', $2, $3)
       ON CONFLICT (id) DO UPDATE SET status = 'pending', expires_at = $3`,
      [sessionId, now, expiresAt]
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('create-tg-session error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
