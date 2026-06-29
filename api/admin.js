// ═══════════════════════════════════════════════════════════════
// Единый маршрутизатор для всех эндпоинтов /api/admin/*
// ═══════════════════════════════════════════════════════════════

import verifyHandler from './_admin/verify.js';
import statsHandler from './_admin/stats.js';
import usersHandler from './_admin/users.js';
import userControlHandler from './_admin/user-control.js';
import userHistoryHandler from './_admin/user-history.js';

export default async function handler(req, res) {
  // Разбираем URL-путь (например, "/api/admin/verify?key=..." -> "/api/admin/verify")
  const urlPath = req.url.split('?')[0];
  
  // Вычленяем действие (action): /api/admin/verify -> "verify"
  const action = urlPath.replace(/^\/api\/admin\/?/, '').split('/')[0];

  console.log(`[admin-router] Routing request for action: "${action}" (Method: ${req.method})`);

  switch (action) {
    case 'verify':
      return verifyHandler(req, res);
    case 'stats':
      return statsHandler(req, res);
    case 'users':
      return usersHandler(req, res);
    case 'user-control':
      return userControlHandler(req, res);
    case 'user-history':
      return userHistoryHandler(req, res);
    default:
      // Fallback на верификацию, если это корневой POST-запрос
      if (action === '' && req.method === 'POST') {
        return verifyHandler(req, res);
      }
      return res.status(404).json({ ok: false, error: `Action '${action}' not found` });
  }
}
