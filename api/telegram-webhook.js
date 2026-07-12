import fetch from 'node-fetch';

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
    const text = message.text.trim();
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      console.error('[TG Webhook] Missing TELEGRAM_BOT_TOKEN');
      return res.status(200).json({ ok: true });
    }

    if (text === '/admin') {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: '🔐 Панель управления Seller Studio',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🛠 Открыть Админку', web_app: { url: 'https://seller-studio-ai.ru/admin' } }]
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
          text: 'Добро пожаловать в Seller Studio! Запустите приложение ниже:',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🚀 Открыть приложение', web_app: { url: 'https://seller-studio-ai.ru' } }]
            ]
          }
        })
      });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[TG Webhook] Error:', error);
    return res.status(200).json({ ok: true }); // Always return 200 to Telegram
  }
}
