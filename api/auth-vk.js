// POST /api/auth-vk or GET /api/auth-vk
// Перенаправляет пользователя на страницу авторизации VK

export default async function handler(req, res) {
  const vkAppId = process.env.VK_APP_ID;

  if (!vkAppId) {
    return res.status(500).send('VK_APP_ID is not configured');
  }

  // Динамически определяем хост для redirect_uri
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers.host || 'localhost:5173'; // fallback
  
  // Для VK, так как он не принимает localhost по HTTP в кабинете разработчика,
  // при локальном запуске подменяем redirect_uri на продакшен-домен.
  let redirectUri;
  console.log('VK AUTH: req.headers =', JSON.stringify(req.headers));
  if (host.includes('localhost') || host.includes('127.0.0.1')) {
    redirectUri = 'https://seller-studio-ai.ru/api/auth-vk-callback';
  } else {
    redirectUri = `${protocol}://${host}/api/auth-vk-callback`;
  }
  console.log('VK AUTH: host =', host, 'redirectUri =', redirectUri);

  const authUrl = `https://oauth.vk.com/authorize?client_id=${vkAppId}&display=popup&redirect_uri=${encodeURIComponent(redirectUri)}&scope=email&response_type=code&v=5.131`;

  // Перенаправляем (302)
  res.redirect(302, authUrl);
}
