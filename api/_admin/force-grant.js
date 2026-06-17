// POST/GET /api/admin/force-grant
// Backward-compatible alias for /api/admin/grant-access.
// Uses the normal admin auth headers; no hardcoded secrets in production code.

import grantAccessHandler from './grant-access.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return grantAccessHandler(req, res);
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const params = { ...(req.query || {}), ...(req.body || {}) };
  const identifier = params.identifier || params.uid || params.telegramId;

  req.method = 'POST';
  req.body = {
    identifier,
    plan: params.plan || 'base',
    credits: params.credits,
    note: params.note || 'force-grant compatibility route',
  };

  return grantAccessHandler(req, res);
}
