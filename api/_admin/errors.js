// GET /api/admin/errors
// Live error center based on generation logs.

import { ensureFirebaseAdmin } from '../_firebase-admin.js';
import { getFirestore } from 'firebase-admin/firestore';
import { checkAdminAuth } from './verify.js';

ensureFirebaseAdmin();
const db = getFirestore();

function classifyError(message = '') {
  const msg = String(message || '').toLowerCase();
  if (msg.includes('429') || msg.includes('quota') || msg.includes('rate') || msg.includes('resource_exhausted')) return 'quota';
  if (msg.includes('timeout') || msg.includes('aborted') || msg.includes('timed out')) return 'timeout';
  if (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized') || msg.includes('forbidden')) return 'auth';
  if (msg.includes('400') || msg.includes('invalid_argument') || msg.includes('required')) return 'validation';
  if (msg.includes('download') || msg.includes('fetch')) return 'download';
  if (msg.includes('kie') || msg.includes('task') || msg.includes('model')) return 'generation_provider';
  return 'unknown';
}

function signature(message = '') {
  return String(message || 'unknown')
    .replace(/[a-f0-9]{24,}/gi, '<id>')
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/\d{4,}/g, '<num>')
    .slice(0, 160);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key, X-Admin-Init-Data');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  const auth = checkAdminAuth(req);
  if (!auth.ok) return res.status(403).json({ ok: false, error: 'Access denied' });

  try {
    const limit = Math.min(parseInt(req.query.limit || '1000', 10) || 1000, 5000);
    const userId = String(req.query.userId || '').trim();
    const type = String(req.query.type || '').trim();

    let query = db.collection('generations').orderBy('createdAt', 'desc').limit(limit);
    if (userId) query = db.collection('generations').where('userId', '==', userId).limit(limit);

    const snap = await query.get();
    const all = snap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const errors = all
      .filter(item => item.success === false)
      .filter(item => !type || item.type === type)
      .map(item => ({
        ...item,
        category: classifyError(item.error || item.details || ''),
        signature: signature(item.error || item.details || ''),
      }));

    const byCategory = {};
    const byType = {};
    const bySignatureMap = new Map();

    errors.forEach(item => {
      byCategory[item.category] = (byCategory[item.category] || 0) + 1;
      byType[item.type || 'unknown'] = (byType[item.type || 'unknown'] || 0) + 1;

      const key = `${item.category}|${item.signature}`;
      const current = bySignatureMap.get(key) || {
        category: item.category,
        signature: item.signature,
        count: 0,
        lastAt: item.createdAt || null,
        sampleUserId: item.userId || null,
        sampleGenerationId: item.id || null,
      };
      current.count += 1;
      if (!current.lastAt || new Date(item.createdAt || 0) > new Date(current.lastAt || 0)) {
        current.lastAt = item.createdAt || null;
        current.sampleUserId = item.userId || null;
        current.sampleGenerationId = item.id || null;
      }
      bySignatureMap.set(key, current);
    });

    const summary = {
      scanned: all.length,
      totalErrors: errors.length,
      errorRate: all.length ? Math.round((errors.length / all.length) * 100) : 0,
      byCategory,
      byType,
      topSignatures: Array.from(bySignatureMap.values()).sort((a, b) => b.count - a.count).slice(0, 20),
      generatedAt: new Date().toISOString(),
    };

    return res.status(200).json({ ok: true, summary, errors: errors.slice(0, 300) });
  } catch (err) {
    console.error('[admin/errors] Error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
