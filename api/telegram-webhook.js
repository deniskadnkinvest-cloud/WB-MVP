import fetch from 'node-fetch';

// Список разрешённых Telegram ID для /admin
const getAdminIds = () => {
  const raw = process.env.ADMIN_TELEGRAM_IDS || '';
  return raw.split(',').map(s => s.trim()).filter(Boolean).map(Number);
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  try {
    const update = req.body;
    if (!update || !update.message || !update.message.text) {
      return res.status(200).json({ ok: true });
    }

    const { message } = update;
    const chatId = message.chat.id;
    const userId = message.from?.id;
    const text = message.text.trim();
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const adminKey = process.env.ADMIN_ACCESS_KEY;

    if (!botToken) {
      console.error('[TG Webhook] Missing TELEGRAM_BOT_TOKEN');
      return res.status(200).json({ ok: true });
    }

    if (text === '/admin') {
      // Проверяем, что пользователь — админ
      const adminIds = getAdminIds();
      if (!adminIds.includes(Number(userId))) {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: '⛔ У вас нет доступа к панели администратора.'
          })
        });
        return res.status(200).json({ ok: true });
      }

      // Формируем URL с ключом доступа (Telegram Desktop не передаёт initData)
      const adminUrl = adminKey
        ? `https://seller-studio-ai.ru/admin?key=${encodeURIComponent(adminKey)}`
        : 'https://seller-studio-ai.ru/admin';

      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: '🔐 Панель управления Seller Studio',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🛠 Открыть Админку', web_app: { url: adminUrl } }]
            ]
          }
        })
      });
    } else if (text === '/start') {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: 'Добро пожаловать в Seller Studio! 🚀\nЗапустите приложение ниже:',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📸 Открыть Студию', web_app: { url: 'https://seller-studio-ai.ru' } }]
            ]
          }
        })
      });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[TG Webhook] Error:', error);
    return res.status(200).json({ ok: true });
  }
}
