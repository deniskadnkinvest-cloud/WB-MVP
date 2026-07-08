// GET /api/auth-vk
// Перенаправляет пользователя на страницу авторизации VK ID
// Использует VK ID endpoints (id.vk.com) с PKCE (S256)

import crypto from 'crypto';

export default async function handler(req, res) {
  const vkAppId = process.env.VK_APP_ID;

  if (!vkAppId) {
    return res.status(500).send('VK_APP_ID is not configured');
  }

  // Динамически определяем хост для redirect_uri
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers.host || 'localhost:5173';

  let redirectUri;
  if (host.includes('localhost') || host.includes('127.0.0.1')) {
    redirectUri = 'https://seller-studio-ai.ru/api/auth-vk-callback';
  } else {
    redirectUri = `${protocol}://${host}/api/auth-vk-callback`;
  }

  // PKCE: генерируем code_verifier и code_challenge
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  // State для CSRF-защиты
  const state = crypto.randomBytes(16).toString('hex');

  // Сохраняем verifier и state в cookie для callback'а
  const cookiePayload = JSON.stringify({ v: codeVerifier, s: state });
  res.setHeader(
    'Set-Cookie',
    `vk_pkce=${encodeURIComponent(cookiePayload)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=600`
  );

  console.log('VK AUTH (VK ID): host =', host, 'redirectUri =', redirectUri);

  // VK ID authorize endpoint
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: vkAppId,
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    scope: 'vkid.personal_info email',
  });

  const authUrl = `https://id.vk.com/authorize?${params.toString()}`;
  res.redirect(302, authUrl);
}
