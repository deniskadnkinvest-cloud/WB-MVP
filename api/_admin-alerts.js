// ─────────────────────────────────────────────────────────
// _admin-alerts.js — Утилита для Telegram-алертов в админский чат
// Безопасная обёртка: никогда не бросает исключений, не ломает основной флоу
// ─────────────────────────────────────────────────────────

/** Эмодзи и метки по уровню алерта */
const LEVEL_CONFIG = {
  critical: { emoji: '🚨', label: 'CRITICAL' },
  warning:  { emoji: '⚠️', label: 'WARNING' },
  info:     { emoji: 'ℹ️', label: 'INFO' },
  payment:  { emoji: '💰', label: 'PAYMENT' },
};

/**
 * Форматирует timestamp в читаемый вид (UTC)
 * @returns {string} — строка вида "2026-06-04 19:06:26 UTC"
 */
function formatTimestamp() {
  return new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
}

/**
 * Отправляет алерт-сообщение в Telegram админский чат.
 * Тихо пропускает, если env vars не заданы или произошла ошибка.
 *
 * @param {string} message — текст сообщения (поддерживает HTML-разметку)
 * @param {'critical'|'warning'|'info'|'payment'} level — уровень алерта
 */
export async function sendAdminAlert(message, level = 'warning') {
  try {
    // По умолчанию используем основной бот и основной чат
    let botToken = process.env.TELEGRAM_BOT_TOKEN;
    let chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

    // Если это оплата и заданы специальные переменные для оплат — используем их
    if (level === 'payment') {
      botToken = process.env.TELEGRAM_PAYMENTS_BOT_TOKEN || botToken;
      chatId = process.env.TELEGRAM_PAYMENTS_CHAT_ID || chatId;
    }

    // Если переменные окружения не заданы — тихо выходим
    if (!botToken || !chatId) return;

    const config = LEVEL_CONFIG[level] || LEVEL_CONFIG.warning;
    const timestamp = formatTimestamp();

    const text = [
      `${config.emoji} <b>${config.label}</b>`,
      ``,
      message,
      ``,
      `<i>🕐 ${timestamp}</i>`,
    ].join('\n');

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
  } catch {
    // Глотаем ошибку — алерты не должны ломать основной флоу
  }
}

/**
 * Классифицирует ошибку и отправляет алерт с контекстом.
 * Автоматически определяет уровень по HTTP-статусу.
 *
 * @param {Error|object} error — объект ошибки
 * @param {string} context — контекст, где произошла ошибка (напр. "VTON generation")
 */
export async function alertOnError(error, context = 'unknown') {
  try {
    const status = error?.status || error?.statusCode || error?.response?.status || null;
    const errorMessage = error?.message || String(error);

    // Классификация ошибки по статусу
    let level = 'warning';
    let category = 'UNKNOWN ERROR';

    if (status === 429) {
      level = 'warning';
      category = 'RATE LIMIT (429)';
    } else if (status === 504) {
      level = 'warning';
      category = 'GATEWAY TIMEOUT (504)';
    } else if (status === 400) {
      level = 'info';
      category = 'BAD REQUEST (400)';
    } else if (status >= 500) {
      level = 'critical';
      category = `SERVER ERROR (${status})`;
    } else if (status) {
      level = 'warning';
      category = `HTTP ERROR (${status})`;
    } else {
      level = 'critical';
      category = 'UNKNOWN ERROR';
    }

    const text = [
      `<b>${category}</b>`,
      ``,
      `<b>Контекст:</b> ${escapeHtml(context)}`,
      `<b>Ошибка:</b> <code>${escapeHtml(truncate(errorMessage, 500))}</code>`,
      status ? `<b>Статус:</b> ${status}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    await sendAdminAlert(text, level);
  } catch {
    // Глотаем — безопасность прежде всего
  }
}

/**
 * Отправляет красивое уведомление об успешной оплате.
 *
 * @param {string} planId — идентификатор тарифного плана
 * @param {string} uid — UID пользователя
 * @param {number|string} amount — сумма оплаты
 */
export async function alertOnPayment(planId, uid, amount) {
  try {
    const text = [
      `<b>Новая оплата!</b>`,
      ``,
      `💎 <b>Тариф:</b> ${escapeHtml(String(planId))}`,
      `👤 <b>UID:</b> <code>${escapeHtml(String(uid))}</code>`,
      `💵 <b>Сумма:</b> ${escapeHtml(String(amount))} ₽`,
    ].join('\n');

    await sendAdminAlert(text, 'payment');
  } catch {
    // Глотаем — безопасность прежде всего
  }
}

// ─────────────────────────────────────────────────────────
// Вспомогательные функции
// ─────────────────────────────────────────────────────────

/** Экранирует спецсимволы HTML для безопасной вставки в Telegram */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Обрезает строку до maxLen символов */
function truncate(str, maxLen = 500) {
  const s = String(str);
  return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
}
