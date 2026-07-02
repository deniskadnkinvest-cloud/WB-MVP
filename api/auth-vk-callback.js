import jwt from 'jsonwebtoken';
import { query } from './_db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'vton-secret-2026';

export default async function handler(req, res) {
  const { code, error } = req.query;

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

  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers.host || 'localhost:5173';
  const redirectUri = `${protocol}://${host}/api/auth-vk-callback`;

  try {
    // 1. Обмен кода на access_token
    const tokenResponse = await fetch(`https://oauth.vk.com/access_token?client_id=${vkAppId}&client_secret=${vkAppSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`);
    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      throw new Error(tokenData.error_description || tokenData.error);
    }

    const { access_token, user_id, email: vkEmail } = tokenData;

    // 2. Получение профиля пользователя
    const profileResponse = await fetch(`https://api.vk.com/method/users.get?user_ids=${user_id}&fields=photo_200&access_token=${access_token}&v=5.131`);
    const profileData = await profileResponse.json();

    if (profileData.error) {
      throw new Error(profileData.error.error_msg);
    }

    const userProfile = profileData.response[0];
    const vkIdStr = String(user_id);
    const stableUid = `vk_${vkIdStr}`;
    const email = vkEmail || `${stableUid}@vk.user`;
    const displayName = [userProfile.first_name, userProfile.last_name].filter(Boolean).join(' ');
    const photoUrl = userProfile.photo_200;

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
      [stableUid, email], // В telegram_id сохраняем наш stableUid (vk_123) для совместимости с текущей схемой БД
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
    console.error('[auth-vk] Error:', err.message);
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
