// ═══════════════════════════════════════════════════════════════
// GET /api/admin/errors  — Live Error Center
// Реальные сбои из журнала генераций (status='error'): категория, режим,
// пользователь, сигнатура повторяющихся причин.
//
// Query: limit?, userId?, type?
// ═══════════════════════════════════════════════════════════════

import { checkAdminAuth } from './verify.js';
import { query as pgQuery } from '../_db.js';

function classify(msg) {
  const m = String(msg || '').toLowerCase();
  if (/429|quota|too many|rate.?limit|exceeded/.test(m)) return 'quota';
  if (/timeout|timed out|abort|etimedout|deadline/.test(m)) return 'timeout';
  if (/401|403|unauthor|forbidden|\btoken\b|\bauth\b/.test(m)) return 'auth';
  if (/400|invalid|required|bad request|validation|must be/.test(m)) return 'validation';
  if (/download|fetch failed|enotfound|econnrefused|result_url|no image/.test(m)) return 'download';
  if (/kie|gpt-image|gemini|provider|content policy|generation/.test(m)) return 'generation_provider';
  return 'unknown';
}

function signature(msg) {
  return String(msg || 'Неизвестная ошибка')
    .replace(/[0-9a-f]{8,}/gi, '#')  // ids/hashes
    .replace(/\d+/g, 'N')            // numbers
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key, X-Admin-Init-Data');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const adminAuth = checkAdminAuth(req);
  if (!adminAuth.ok) return res.status(403).json({ ok: false, error: 'Нет доступа' });

  try {
    const limit = Math.min(parseInt(req.query.limit || '500', 10) || 500, 2000);
    const userId = String(req.query.userId || '').trim();
    const type = String(req.query.type || '').trim();

    const scannedRes = await pgQuery('SELECT COUNT(*)::int AS n FROM generations');
    const scanned = scannedRes.rows[0]?.n || 0;

    const conds = [`g.status = 'error'`];
    const params = [];
    if (userId) {
      params.push(userId.replace(/^tg_/, ''));
      conds.push(`(u.telegram_id = $${params.length} OR u.email = $${params.length})`);
    }
    if (type) {
      params.push(type);
      conds.push(`g.type = $${params.length}`);
    }
    params.push(limit);

    const uidExpr = `CASE WHEN u.telegram_id ~ '^\\d+$' THEN 'tg_' || u.telegram_id ELSE COALESCE(u.telegram_id, u.email) END`;
    const { rows } = await pgQuery(
      `SELECT g.id, g.type, g.metadata, g.created_at, ${uidExpr} AS uid
       FROM generations g LEFT JOIN users u ON u.id = g.user_id
       WHERE ${conds.join(' AND ')}
       ORDER BY g.created_at DESC LIMIT $${params.length}`,
      params
    );

    const byCategory = {}, byType = {}, sigMap = {};
    const errors = rows.map(r => {
      const msg = r.metadata?.error || 'Ошибка генерации';
      const category = classify(msg);
      const sig = signature(msg);
      byCategory[category] = (byCategory[category] || 0) + 1;
      byType[r.type || 'unknown'] = (byType[r.type || 'unknown'] || 0) + 1;
      const key = `${category}|${sig}`;
      if (!sigMap[key]) sigMap[key] = { category, signature: sig, count: 0, lastAt: r.created_at, sampleUserId: r.uid };
      sigMap[key].count++;
      return {
        id: r.id,
        type: r.type,
        category,
        signature: sig,
        userId: r.uid,
        promptMeta: { name: r.metadata?.promptName || null },
        createdAt: r.created_at?.toISOString?.() || r.created_at,
      };
    });

    const topSignatures = Object.values(sigMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 15)
      .map(s => ({ ...s, lastAt: s.lastAt?.toISOString?.() || s.lastAt }));

    const totalErrors = errors.length;
    const errorRate = scanned > 0 ? Math.round((totalErrors / scanned) * 1000) / 10 : 0;

    return res.status(200).json({
      ok: true,
      errors: errors.slice(0, 200),
      summary: { scanned, totalErrors, errorRate, byCategory, byType, topSignatures },
    });
  } catch (err) {
    console.error('[admin/errors] Error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
