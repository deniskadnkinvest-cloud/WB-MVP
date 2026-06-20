// ═══════════════════════════════════════════════════════════════
// Eдиный маршрутизатор для всех эндпоинтов /api/admin/*
// Позволяет уместиться в лимит 12 серверлесс-функций Vercel Hobby Plan.
// ═══════════════════════════════════════════════════════════════

import verifyHandler from './_admin/verify.js';
import statsHandler from './_admin/stats.js';
import usersHandler from './_admin/users.js';
import generationsHandler from './_admin/generations.js';
import grantAccessHandler from './_admin/grant-access.js';
import broadcastHandler from './_admin/broadcast.js';
import broadcastsHandler from './_admin/broadcasts.js';
import refundHandler from './_admin/refund.js';
import userHistoryHandler from './_admin/user-history.js';
import forceGrantHandler from './_admin/force-grant.js';
import debugFirebaseHandler from './_admin/debug-firebase.js';
import grantsAnalyticsHandler from './_admin/grants-analytics.js';
import userControlHandler from './_admin/user-control.js';
import errorsHandler from './_admin/errors.js';
import promptsHandler from './_admin/prompts.js';
import debugSubHandler from './_admin/debug-sub.js';
import migrateLocationHandler from './_admin/migrate-location.js';

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
    case 'generations':
      return generationsHandler(req, res);
    case 'grant-access':
      return grantAccessHandler(req, res);
    case 'force-grant':
      return forceGrantHandler(req, res);
    case 'debug-firebase':
      return debugFirebaseHandler(req, res);
    case 'debug-sub':
      return debugSubHandler(req, res);
    case 'grants-analytics':
      return grantsAnalyticsHandler(req, res);
    case 'user-control':
      return userControlHandler(req, res);
    case 'errors':
      return errorsHandler(req, res);
    case 'prompts':
      return promptsHandler(req, res);
    case 'migrate-location':
      return migrateLocationHandler(req, res);
    case 'broadcast':
      return broadcastHandler(req, res);
    case 'broadcasts':
      return broadcastsHandler(req, res);
    case 'refund':
      return refundHandler(req, res);
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
