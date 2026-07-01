// POST /api/auth-telegram
// Верифицирует Telegram initData (Mini App) или Widget data (Web Login) и возвращает JWT токен
// с детерминированным UID: tg_{telegramId}
//
// Это РЕШАЕТ корневую проблему: signInAnonymously() создавал НОВЫЙ UID
// при каждом входе, потому что Telegram WebView очищает storage.
// JWT с фиксированным UID гарантирует, что пользователь
// ВСЕГДА получает тот же аккаунт.
//
// Поддерживает два режима:
// 1. Mini App: body = { initData: "..." } — URLSearchParams с HMAC от "WebAppData"
// 2. Web Widget: body = { id, hash, auth_date, ... } — JSON с HMAC от SHA256(bot_token)

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { isRetryableConnectionError, query } from './_db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'vton-secret-2026';

/**
 * Верификация Telegram initData через HMAC-SHA256 (Mini App)
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

/**
 * Верификация данных от Telegram Login Widget (Web)
 * https://core.telegram.org/widgets/login#checking-authorization
 */
function verifyWidgetData(data, botToken) {
  try {
    const hash = data.hash;
    if (!hash) return null;

    // Собираем строку для проверки: сортируем ключи по алфавиту, исключая hash
    const dataCheckArr = [];
    for (const key of Object.keys(data).sort()) {
      if (key !== 'hash' && data[key] !== undefined && data[key] !== null) {
        dataCheckArr.push(`${key}=${data[key]}`);
      }
    }
    const dataCheckString = dataCheckArr.join('\n');

    // Для виджета секретный ключ — это SHA256 от токена бота
    const secretKey = crypto.createHash('sha256').update(botToken).digest();

    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (expectedHash !== hash) {
      console.log('[auth-telegram-widget] Invalid hash');
      return null;
    }

    // Проверяем свежесть (не старше 1 дня)
    const authDate = parseInt(data.auth_date || '0', 10);
    const now = Math.floor(Date.now() / 1000);
    const ageSeconds = now - authDate;
    if (ageSeconds > 86400) {
      console.log('[auth-telegram-widget] auth_date expired');
      return null;
    }

    return data;
  } catch (e) {
    console.log('[auth-telegram-widget] verify error:', e.message);
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
    const body = req.body || {};

    // ═══ Detect mode: Mini App (initData) or Web Widget (hash) ═══
    const isWidget = !body.initData && body.hash && body.id;
    let tgUser;

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.error('[auth-telegram] TELEGRAM_BOT_TOKEN not configured');
      return res.status(500).json({ ok: false, error: 'Server misconfigured' });
    }

    if (isWidget) {
      // ═══ WEB WIDGET MODE ═══
      console.log('[auth-telegram] Mode: Web Widget');
      if (!body.id || !body.hash) {
        return res.status(400).json({ ok: false, error: 'Invalid widget data' });
      }
      tgUser = verifyWidgetData(body, botToken);
      if (!tgUser) {
        return res.status(401).json({ ok: false, error: 'Invalid or expired Telegram data' });
      }
    } else {
      // ═══ MINI APP MODE ═══
      console.log('[auth-telegram] Mode: Mini App');
      const { initData } = body;
      if (!initData) {
        console.log('[auth-telegram] no initData, raw body:', JSON.stringify(body).slice(0, 200));
        return res.status(400).json({ ok: false, error: 'initData required' });
      }
      tgUser = verifyAndParseInitData(initData, botToken);
      if (!tgUser || !tgUser.id) {
        return res.status(401).json({ ok: false, error: 'Invalid or expired initData' });
      }
    }

    const telegramId = String(tgUser.id);
    const stableUid = `tg_${telegramId}`;

    console.log(`[auth-telegram] Verified TG user ${telegramId} (${tgUser.first_name}), mode=${isWidget ? 'widget' : 'miniapp'}, issuing token for UID: ${stableUid}`);

    // 2. UPSERT пользователя в PostgreSQL
    const email = tgUser.username
      ? `${tgUser.username}@telegram.user`
      : `tg_${telegramId}@telegram.user`;

    const { rows } = await query(
      `INSERT INTO users (telegram_id, email, role)
       VALUES ($1, $2, 'user')
       ON CONFLICT (telegram_id) DO UPDATE
         SET email = CASE
           WHEN users.email IS NULL OR users.email = '' OR users.email LIKE '%@telegram.user'
             THEN EXCLUDED.email
           ELSE users.email
         END
       RETURNING id, telegram_id, email, role`,
      [telegramId, email],
      { attempts: 3, retryUnsafe: true }
    );

    const user = rows[0];
    console.log(`[auth-telegram] User upserted: id=${user.id}, telegram_id=${user.telegram_id}`);

    // 3. Обеспечиваем наличие записи подписки (если ещё нет)
    await query(
      `INSERT INTO subscriptions (user_id, plan_name, credits, credits_total, status)
       VALUES ($1, 'none', 0, 0, 'inactive')
       ON CONFLICT (user_id) DO NOTHING`,
      [user.id],
      { attempts: 3, retryUnsafe: true }
    );

    // 4. Генерируем JWT токен (замена Auth Custom Token)
    const customToken = jwt.sign(
      {
        uid: stableUid,
        telegramId,
        dbUserId: user.id,
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Widget mode returns user data (needed by AuthContext.signInWithTelegramWidget)
    if (isWidget) {
      return res.status(200).json({
        ok: true,
        customToken,
        uid: stableUid,
        telegramId,
        user: {
          id: tgUser.id,
          first_name: tgUser.first_name,
          last_name: tgUser.last_name,
          username: tgUser.username,
          photo_url: tgUser.photo_url
        }
      });
    }

    return res.status(200).json({
      ok: true,
      customToken,
      uid: stableUid,
      telegramId,
    });
  } catch (err) {
    console.error('[auth-telegram] Error:', err.message);
    if (isRetryableConnectionError(err)) {
      res.setHeader('Retry-After', '3');
      return res.status(503).json({
        ok: false,
        code: 'auth_db_temporarily_unavailable',
        error: 'Сервис временно недоступен. Попробуйте ещё раз.',
      });
    }

    return res.status(500).json({
      ok: false,
      code: 'auth_internal_error',
      error: 'Ошибка авторизации. Попробуйте ещё раз.',
    });
  }
}
