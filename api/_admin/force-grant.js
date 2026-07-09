// POST/GET /api/admin/force-grant
// Backward-compatible alias for set-plan via /api/admin/user-control.
// Uses normal admin auth headers; no hardcoded secrets.

import userControlHandler from './user-control.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return userControlHandler(req, res);
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const params = { ...(req.query || {}), ...(req.body || {}) };
  const identifier = params.identifier || params.uid || params.telegramId;

  req.method = 'POST';
  req.body = {
    action: 'set-plan',
    identifier,
    plan: params.plan || 'base',
    credits: params.credits,
    note: params.note || 'force-grant compatibility route',
  };

  return userControlHandler(req, res);
}
