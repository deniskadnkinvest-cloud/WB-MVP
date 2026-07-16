// GET /api/auth-vk-callback
// Обработка callback'а от VK ID OAuth
// Обменивает code на access_token через VK ID endpoints

import jwt from 'jsonwebtoken';
import { query } from './_db.js';
import { getJwtSecret } from './_env.js';

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(pair => {
    const [name, ...rest] = pair.trim().split('=');
    cookies[name] = rest.join('=');
  });
  return cookies;
}

export default async function handler(req, res) {
  const { code, error, state, device_id } = req.query;

  // Если пользователь отменил авторизацию
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

  const vkAppId = process.env.VK_APP_ID;
  const vkAppSecret = process.env.VK_APP_SECRET;

  if (!vkAppId || !vkAppSecret) {
    return res.status(500).send('VK keys are not configured');
  }

  // Восстанавливаем PKCE verifier и state из cookie
  const cookies = parseCookies(req.headers.cookie);
  let codeVerifier = '';
  let savedState = '';

  try {
    const pkceData = JSON.parse(decodeURIComponent(cookies.vk_pkce || '{}'));
    codeVerifier = pkceData.v || '';
    savedState = pkceData.s || '';
  } catch (e) {
    console.warn('[auth-vk] Failed to parse PKCE cookie:', e.message);
  }

  // Проверяем state для CSRF-защиты
  if (savedState && state && savedState !== state) {
    console.error('[auth-vk] State mismatch:', { savedState, receivedState: state });
    return res.send(`
      <script>
        window.opener.postMessage({ type: 'OAUTH_ERROR', error: 'CSRF state mismatch' }, '*');
        window.close();
      </script>
    `);
  }

  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers.host || 'localhost:5173';
  const redirectUri = `${protocol}://${host}/api/auth-vk-callback`;

  // Очищаем PKCE cookie
  res.setHeader('Set-Cookie', 'vk_pkce=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0');

  try {
    // 1. Обмен кода на access_token через VK ID endpoint
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: vkAppId,
      client_secret: vkAppSecret,
      code_verifier: codeVerifier,
      ...(device_id ? { device_id } : {}),
      ...(state ? { state } : {}),
    });

    const tokenResponse = await fetch('https://id.vk.com/oauth2/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody.toString(),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error || !tokenData.access_token) {
      console.error('[auth-vk] Token exchange error:', tokenData);
      throw new Error(tokenData.error_description || tokenData.error || 'Token exchange failed');
    }

    const { access_token, user_id: tokenUserId } = tokenData;

    // 2. Получение профиля через VK ID user_info endpoint
    const userInfoBody = new URLSearchParams({
      client_id: vkAppId,
      access_token,
    });

    const userInfoResponse = await fetch('https://id.vk.com/oauth2/user_info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: userInfoBody.toString(),
    });

    const userInfo = await userInfoResponse.json();

    if (userInfo.error) {
      console.error('[auth-vk] User info error:', userInfo);
      throw new Error(userInfo.error_description || 'Failed to get user info');
    }

    const vkIdStr = String(userInfo.user_id || tokenUserId);
    const stableUid = `vk_${vkIdStr}`;
    const email = userInfo.email || `${stableUid}@vk.user`;
    const displayName = [userInfo.first_name, userInfo.last_name].filter(Boolean).join(' ');
    const photoUrl = userInfo.avatar || userInfo.photo_200 || '';

    console.log(`[auth-vk] Verified VK user ${vkIdStr} (${displayName}), issuing token for UID: ${stableUid}`);

    // 3. UPSERT пользователя в PostgreSQL
    const { rows } = await query(
      `INSERT INTO users (telegram_id, email, role)
       VALUES ($1, $2, 'user')
       ON CONFLICT (telegram_id) DO UPDATE
         SET email = CASE
           WHEN users.email IS NULL OR users.email = '' OR users.email LIKE '%@vk.user'
             THEN EXCLUDED.email
           ELSE users.email
         END
       RETURNING id, telegram_id, email, role`,
      [stableUid, email],
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
        telegramId: stableUid,
        dbUserId: dbUser.id,
      },
      getJwtSecret(),
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
    console.error('[auth-vk] Error:', err.message);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
      <script>
        window.opener.postMessage({ type: 'OAUTH_ERROR', error: '${err.message.replace(/'/g, "\\'")}' }, '*');
        window.close();
      </script>
      <p>Ошибка авторизации: ${err.message}</p>
    `);
  }
}
