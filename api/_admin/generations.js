// ═══════════════════════════════════════════════════════════════
// GET /api/admin/generations
// Возвращает список последних генераций из Firestore для Command Center
//
// Query parameters:
//   limit    number?  — количество записей (default 100)
//   userId   string?  — фильтрация по конкретному юзеру
//   type     string?  — фильтрация по типу: fashion | product | calibration | autocatalog
// ═══════════════════════════════════════════════════════════════

import { checkAdminAuth } from './verify.js';
import { query as pgQuery } from '../_db.js';

const db = { collection: () => ({ get: async () => ({ docs: [] }) }) };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key, X-Admin-Init-Data');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const adminAuth = checkAdminAuth(req);
  if (!adminAuth.ok) return res.status(403).json({ ok: false, error: 'Нет доступа' });

  try {
    const limit = parseInt(req.query.limit || '100', 10);
    const userId = req.query.userId || '';
    const type = req.query.type || '';

    let query = db.collection('generations');

    if (userId) {
      query = query.where('userId', '==', userId);
    }
    if (type) {
      query = query.where('type', '==', type);
    }

    const snap = await query
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    const generations = snap.docs.map(doc => doc.data());

    return res.status(200).json({ ok: true, generations });
  } catch (err) {
    console.error('[admin/generations] Ошибка:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
