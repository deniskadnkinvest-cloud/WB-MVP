import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { isRetryableConnectionError, query } from './_db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'vton-secret-2026';

/**
 * Верификация данных от Telegram Login Widget
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
    const tgUserRaw = req.body || {};

    if (!tgUserRaw.id || !tgUserRaw.hash) {
      return res.status(400).json({ ok: false, error: 'Invalid widget data' });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.error('[auth-telegram-widget] TELEGRAM_BOT_TOKEN not configured');
      return res.status(500).json({ ok: false, error: 'Server misconfigured' });
    }

    // 1. Верифицируем подпись виджета
    const tgUser = verifyWidgetData(tgUserRaw, botToken);
    if (!tgUser) {
      return res.status(401).json({ ok: false, error: 'Invalid or expired Telegram data' });
    }

    const telegramId = String(tgUser.id);
    const stableUid = `tg_${telegramId}`;

    console.log(`[auth-telegram-widget] Verified TG user ${telegramId} (${tgUser.first_name}), issuing token for UID: ${stableUid}`);

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

    // 3. Обеспечиваем наличие записи подписки (если ещё нет)
    await query(
      `INSERT INTO subscriptions (user_id, plan_name, credits, credits_total, status)
       VALUES ($1, 'none', 0, 0, 'inactive')
       ON CONFLICT (user_id) DO NOTHING`,
      [user.id],
      { attempts: 3, retryUnsafe: true }
    );

    // 4. Генерируем JWT токен
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
      user: {
        id: tgUser.id,
        first_name: tgUser.first_name,
        last_name: tgUser.last_name,
        username: tgUser.username,
        photo_url: tgUser.photo_url
      }
    });
  } catch (err) {
    console.error('[auth-telegram-widget] Error:', err.message);
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
