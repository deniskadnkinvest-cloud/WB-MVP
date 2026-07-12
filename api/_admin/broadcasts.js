// ═══════════════════════════════════════════════════════════════
// GET /api/admin/broadcasts — история рассылок для вкладки «История»
// ═══════════════════════════════════════════════════════════════

import { query } from '../_db.js';
import { checkAdminAuth } from './verify.js';
import { ensureBroadcastsTable } from './broadcast.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key, X-Admin-Init-Data');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  const auth = checkAdminAuth(req);
  if (!auth.ok) return res.status(403).json({ ok: false, error: 'Access denied' });

  try {
    await ensureBroadcastsTable();
    const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, 200);
    const { rows } = await query(
      `SELECT id, text, image_url, audience, status,
              total_recipients, sent_count, failed_count, created_by, created_at
       FROM broadcasts ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    const broadcasts = rows.map(r => ({
      id: r.id,
      text: r.text,
      imageUrl: r.image_url,
      audience: r.audience,
      status: r.status,
      totalRecipients: r.total_recipients || 0,
      sentCount: r.sent_count || 0,
      failedCount: r.failed_count || 0,
      createdBy: r.created_by || '',
      createdAt: r.created_at?.toISOString?.() || r.created_at,
    }));
    return res.status(200).json({ ok: true, broadcasts });
  } catch (err) {
    console.error('[admin/broadcasts] Error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
