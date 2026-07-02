// GET /api/auth-yandex
// Перенаправляет пользователя на страницу авторизации Яндекс

export default async function handler(req, res) {
  const yandexClientId = process.env.YANDEX_CLIENT_ID;

  if (!yandexClientId) {
    return res.status(500).send('YANDEX_CLIENT_ID is not configured');
  }

  // Динамически определяем хост для redirect_uri (на Яндексе redirect_uri также должен быть прописан)
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers.host || 'localhost:5173';
  const redirectUri = `${protocol}://${host}/api/auth-yandex-callback`;

  // Яндекс OAuth 2.0 URL
  const authUrl = `https://oauth.yandex.ru/authorize?response_type=code&client_id=${yandexClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&display=popup`;

  // Перенаправляем (302)
  res.redirect(302, authUrl);
}
