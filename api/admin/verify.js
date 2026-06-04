// ═══════════════════════════════════════════════════════════════
// POST /api/admin/verify
// Проверяет доступ к админ-панели через:
//   1. HMAC-SHA256 initData (мобильный Telegram)
//   2. Admin access key (Telegram Desktop, fallback)
// ═══════════════════════════════════════════════════════════════

import crypto from 'crypto';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_ACCESS_KEY = process.env.ADMIN_ACCESS_KEY;

// Список разрешённых Telegram ID (числовые, через запятую)
const getAdminIds = () => {
  const raw = process.env.ADMIN_TELEGRAM_IDS || '';
  return raw.split(',').map(s => s.trim()).filter(Boolean).map(Number);
};

/**
 * Проверяет Telegram initData по HMAC-SHA256
 */
export function verifyTelegramInitData(initData) {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;

    params.delete('hash');
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(BOT_TOKEN)
      .digest();

    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (expectedHash !== hash) return null;

    const userStr = params.get('user');
    if (!userStr) return null;
    const user = JSON.parse(userStr);

    const authDate = parseInt(params.get('auth_date') || '0', 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) return null;

    return user;
  } catch {
    return null;
  }
}

/**
 * Проверяет является ли Telegram ID администратором
 */
export function isAdminId(telegramId) {
  const adminIds = getAdminIds();
  return adminIds.includes(Number(telegramId));
}

/**
 * Универсальная проверка авторизации админа по заголовкам или параметрам
 */
export function checkAdminAuth(req) {
  const key = req.headers['x-admin-key'] || req.body?.accessKey;
  const initData = req.headers['x-admin-init-data'] || req.body?.initData;
  const ADMIN_ACCESS_KEY = process.env.ADMIN_ACCESS_KEY;

  // 1. Проверяем по ключу доступа (Telegram Desktop / fallback)
  if (key && ADMIN_ACCESS_KEY && key === ADMIN_ACCESS_KEY) {
    return { ok: true, user: { id: 0, firstName: 'Admin', lastName: '', username: 'admin' } };
  }

  // 2. Проверяем по Telegram initData (мобильный)
  if (initData && BOT_TOKEN) {
    const user = verifyTelegramInitData(initData);
    if (user && isAdminId(user.id)) {
      return {
        ok: true,
        user: {
          id: user.id,
          firstName: user.first_name || '',
          lastName: user.last_name || '',
          username: user.username || '',
        }
      };
    }
  }

  return { ok: false };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key, X-Admin-Init-Data');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const auth = checkAdminAuth(req);
  if (auth.ok) {
    return res.status(200).json({ ok: true, user: auth.user });
  }

  return res.status(403).json({ ok: false, error: 'Access denied' });
}
