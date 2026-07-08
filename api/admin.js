// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// Р•РґРёРЅС‹Р№ РјР°СЂС€СЂСѓС‚РёР·Р°С‚РѕСЂ РґР»СЏ РІСЃРµС… СЌРЅРґРїРѕРёРЅС‚РѕРІ /api/admin/*
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ

import verifyHandler from './_admin/verify.js';
import statsHandler from './_admin/stats.js';
import usersHandler from './_admin/users.js';
import userControlHandler from './_admin/user-control.js';
import userHistoryHandler from './_admin/user-history.js';
import settingsHandler from './_admin/settings.js';
import promptsHandler from './_admin/prompts.js';
import generationsHandler from './_admin/generations.js';
import errorsHandler from './_admin/errors.js';

export default async function handler(req, res) {
  // Р Р°Р·Р±РёСЂР°РµРј URL-РїСѓС‚СЊ (РЅР°РїСЂРёРјРµСЂ, "/api/admin/verify?key=..." -> "/api/admin/verify")
  const urlPath = req.url.split('?')[0];
  
  // Р’С‹С‡Р»РµРЅСЏРµРј РґРµР№СЃС‚РІРёРµ (action): /api/admin/verify -> "verify"
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
    case 'settings':
      return settingsHandler(req, res);
    case 'prompts':
      return promptsHandler(req, res);
    case 'generations':
      return generationsHandler(req, res);
    case 'errors':
      return errorsHandler(req, res);
    default:
      // Fallback РЅР° РІРµСЂРёС„РёРєР°С†РёСЋ, РµСЃР»Рё СЌС‚Рѕ РєРѕСЂРЅРµРІРѕР№ POST-Р·Р°РїСЂРѕСЃ
      if (action === '' && req.method === 'POST') {
        return verifyHandler(req, res);
      }
      return res.status(404).json({ ok: false, error: `Action '${action}' not found` });
  }
}
