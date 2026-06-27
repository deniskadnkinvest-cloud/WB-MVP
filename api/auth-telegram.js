// POST /api/auth-telegram
// Верифицирует Telegram initData и возвращает JWT токен
// с детерминированным UID: tg_{telegramId}
//
// Это РЕШАЕТ корневую проблему: signInAnonymously() создавал НОВЫЙ UID
// при каждом входе, потому что Telegram WebView очищает storage.
// JWT с фиксированным UID гарантирует, что пользователь
// ВСЕГДА получает тот же аккаунт.

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { query } from './_db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'vton-secret-2026';

/**
 * Верификация Telegram initData через HMAC-SHA256
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
function verifyAndParseInitData(initData, botToken) {
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
      .update(botToken)
      .digest();

    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (expectedHash !== hash) return null;

    // Проверяем свежесть (не старше 7 дней — Telegram Mini App кэширует initData)
    const authDate = parseInt(params.get('auth_date') || '0', 10);
    const now = Math.floor(Date.now() / 1000);
    const ageSeconds = now - authDate;
    console.log(`[auth-telegram] initData age: ${ageSeconds}s (${Math.round(ageSeconds/3600)}h)`);
    if (ageSeconds > 604800) { // 7 дней
      console.log('[auth-telegram] initData expired');
      return null;
    }

    const userStr = params.get('user');
    if (!userStr) return null;
    return JSON.parse(userStr);
  } catch (e) {
    console.log('[auth-telegram] parse error:', e.message);
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  try {
    const { initData } = req.body || {};

    if (!initData) {
      return res.status(400).json({ ok: false, error: 'initData required' });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.error('[auth-telegram] TELEGRAM_BOT_TOKEN not configured');
      return res.status(500).json({ ok: false, error: 'Server misconfigured' });
    }

    // 1. Верифицируем подпись Telegram initData
    const tgUser = verifyAndParseInitData(initData, botToken);
    if (!tgUser || !tgUser.id) {
      return res.status(401).json({ ok: false, error: 'Invalid or expired initData' });
    }

    const telegramId = String(tgUser.id);
    const stableUid = `tg_${telegramId}`;

    console.log(`[auth-telegram] Verified TG user ${telegramId} (${tgUser.first_name}), issuing token for UID: ${stableUid}`);

    // 2. UPSERT пользователя в PostgreSQL
    //    Если пользователь уже есть — обновляем email (если передан), иначе оставляем
    const email = tgUser.username
      ? `${tgUser.username}@telegram.user`
      : `tg_${telegramId}@telegram.user`;

    const { rows } = await query(
      `INSERT INTO users (telegram_id, email, role)
       VALUES ($1, $2, 'user')
       ON CONFLICT (telegram_id) DO UPDATE
         SET email = COALESCE(EXCLUDED.email, users.email)
       RETURNING id, telegram_id, email, role`,
      [telegramId, email]
    );

    const user = rows[0];
    console.log(`[auth-telegram] User upserted: id=${user.id}, telegram_id=${user.telegram_id}`);

    // 3. Обеспечиваем наличие записи подписки (если ещё нет)
    await query(
      `INSERT INTO subscriptions (user_id, plan_name, credits, credits_total, status)
       VALUES ($1, 'none', 0, 0, 'inactive')
       ON CONFLICT (user_id) DO NOTHING`,
      [user.id]
    );

    // 4. Генерируем JWT токен (замена Firebase Custom Token)
    const customToken = jwt.sign(
      {
        uid: stableUid,
        telegramId,
        dbUserId: user.id,
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.status(200).json({
      ok: true,
      customToken,
      uid: stableUid,
      telegramId,
    });
  } catch (err) {
    console.error('[auth-telegram] Error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
