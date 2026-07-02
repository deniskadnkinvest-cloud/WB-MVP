import jwt from 'jsonwebtoken';
import { query } from './_db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'vton-secret-2026';

export default async function handler(req, res) {
  const { code, error } = req.query;

  if (error) {
    return res.send(`
      <script>
        window.opener.postMessage({ type: 'OAUTH_ERROR', error: '${error}' }, '*');
        window.close();
      </script>
    `);
  }

  if (!code) {
    return res.status(400).send('No code provided');
  }

  const yandexClientId = process.env.YANDEX_CLIENT_ID;
  const yandexClientSecret = process.env.YANDEX_CLIENT_SECRET;

  if (!yandexClientId || !yandexClientSecret) {
    return res.status(500).send('Yandex keys are not configured');
  }

  try {
    // 1. Обмен кода на access_token
    const tokenResponse = await fetch('https://oauth.yandex.ru/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: yandexClientId,
        client_secret: yandexClientSecret,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      throw new Error(tokenData.error_description || tokenData.error);
    }

    const { access_token } = tokenData;

    // 2. Получение профиля пользователя
    const profileResponse = await fetch('https://login.yandex.ru/info?format=json', {
      headers: {
        Authorization: `OAuth ${access_token}`,
      },
    });
    
    const profileData = await profileResponse.json();

    if (profileData.error) {
      throw new Error(profileData.error);
    }

    const yaIdStr = String(profileData.id);
    const stableUid = `ya_${yaIdStr}`;
    const email = profileData.default_email || `${stableUid}@yandex.user`;
    const displayName = profileData.real_name || profileData.display_name || profileData.login;
    const photoUrl = profileData.is_avatar_empty 
      ? null 
      : `https://avatars.yandex.net/get-yapic/${profileData.default_avatar_id}/islands-200`;

    console.log(`[auth-yandex] Verified Yandex user ${yaIdStr} (${displayName}), issuing token for UID: ${stableUid}`);

    // 3. UPSERT пользователя в PostgreSQL
    const { rows } = await query(
      `INSERT INTO users (telegram_id, email, role)
       VALUES ($1, $2, 'user')
       ON CONFLICT (telegram_id) DO UPDATE
         SET email = CASE
           WHEN users.email IS NULL OR users.email = '' OR users.email LIKE '%@yandex.user'
             THEN EXCLUDED.email
           ELSE users.email
         END
       RETURNING id, telegram_id, email, role`,
      [stableUid, email], // В telegram_id сохраняем наш stableUid (ya_123)
      { attempts: 3, retryUnsafe: true }
    );

    const dbUser = rows[0];

    // 4. Обеспечиваем наличие записи подписки
    await query(
      `INSERT INTO subscriptions (user_id, plan_name, credits, credits_total, status)
       VALUES ($1, 'none', 0, 0, 'inactive')
       ON CONFLICT (user_id) DO NOTHING`,
      [dbUser.id],
      { attempts: 3, retryUnsafe: true }
    );

    // 5. Генерируем JWT токен
    const customToken = jwt.sign(
      {
        uid: stableUid,
        telegramId: stableUid, // Для обратной совместимости во фронтенде
        dbUserId: dbUser.id,
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    const userData = {
      uid: stableUid,
      email,
      displayName,
      photoUrl,
    };

    // 6. Отправляем токен обратно в основное окно через postMessage
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Авторизация...</title></head>
      <body>
        <script>
          window.opener.postMessage({ 
            type: 'OAUTH_SUCCESS', 
            token: '${customToken}', 
            userData: ${JSON.stringify(userData)} 
          }, '*');
          window.close();
        </script>
        <p>Авторизация успешна. Окно сейчас закроется...</p>
      </body>
      </html>
    `);

  } catch (err) {
    console.error('[auth-yandex] Error:', err.message);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
      <script>
        window.opener.postMessage({ type: 'OAUTH_ERROR', error: '${err.message}' }, '*');
        window.close();
      </script>
      <p>Ошибка авторизации: ${err.message}</p>
    `);
  }
}
