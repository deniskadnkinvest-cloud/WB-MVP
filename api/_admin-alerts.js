// в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
// _admin-alerts.js вЂ” РЈС‚РёР»РёС‚Р° РґР»СЏ Telegram-Р°Р»РµСЂС‚РѕРІ РІ Р°РґРјРёРЅСЃРєРёР№ С‡Р°С‚
// Р‘РµР·РѕРїР°СЃРЅР°СЏ РѕР±С‘СЂС‚РєР°: РЅРёРєРѕРіРґР° РЅРµ Р±СЂРѕСЃР°РµС‚ РёСЃРєР»СЋС‡РµРЅРёР№, РЅРµ Р»РѕРјР°РµС‚ РѕСЃРЅРѕРІРЅРѕР№ С„Р»РѕСѓ
// в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

/** Р­РјРѕРґР·Рё Рё РјРµС‚РєРё РїРѕ СѓСЂРѕРІРЅСЋ Р°Р»РµСЂС‚Р° */
const LEVEL_CONFIG = {
  critical: { emoji: 'рџљЁ', label: 'CRITICAL' },
  warning:  { emoji: 'вљ пёЏ', label: 'WARNING' },
  info:     { emoji: 'в„№пёЏ', label: 'INFO' },
  payment:  { emoji: 'рџ’°', label: 'PAYMENT' },
};

/**
 * Р¤РѕСЂРјР°С‚РёСЂСѓРµС‚ timestamp РІ С‡РёС‚Р°РµРјС‹Р№ РІРёРґ (UTC)
 * @returns {string} вЂ” СЃС‚СЂРѕРєР° РІРёРґР° "2026-06-04 19:06:26 UTC"
 */
function formatTimestamp() {
  return new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
}

/**
 * РћС‚РїСЂР°РІР»СЏРµС‚ Р°Р»РµСЂС‚-СЃРѕРѕР±С‰РµРЅРёРµ РІ Telegram Р°РґРјРёРЅСЃРєРёР№ С‡Р°С‚.
 * РўРёС…Рѕ РїСЂРѕРїСѓСЃРєР°РµС‚, РµСЃР»Рё env vars РЅРµ Р·Р°РґР°РЅС‹ РёР»Рё РїСЂРѕРёР·РѕС€Р»Р° РѕС€РёР±РєР°.
 *
 * @param {string} message вЂ” С‚РµРєСЃС‚ СЃРѕРѕР±С‰РµРЅРёСЏ (РїРѕРґРґРµСЂР¶РёРІР°РµС‚ HTML-СЂР°Р·РјРµС‚РєСѓ)
 * @param {'critical'|'warning'|'info'|'payment'} level вЂ” СѓСЂРѕРІРµРЅСЊ Р°Р»РµСЂС‚Р°
 */
export async function sendAdminAlert(message, level = 'warning') {
  try {
    // РџРѕ СѓРјРѕР»С‡Р°РЅРёСЋ РёСЃРїРѕР»СЊР·СѓРµРј РѕСЃРЅРѕРІРЅРѕР№ Р±РѕС‚ Рё РѕСЃРЅРѕРІРЅРѕР№ С‡Р°С‚
    let botToken = process.env.TELEGRAM_BOT_TOKEN;
    let chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

    // Р•СЃР»Рё СЌС‚Рѕ РѕРїР»Р°С‚Р° Рё Р·Р°РґР°РЅС‹ СЃРїРµС†РёР°Р»СЊРЅС‹Рµ РїРµСЂРµРјРµРЅРЅС‹Рµ РґР»СЏ РѕРїР»Р°С‚ вЂ” РёСЃРїРѕР»СЊР·СѓРµРј РёС…
    if (level === 'payment') {
      botToken = process.env.TELEGRAM_PAYMENTS_BOT_TOKEN || botToken;
      chatId = process.env.TELEGRAM_PAYMENTS_CHAT_ID || chatId;
    }

    // Р•СЃР»Рё РїРµСЂРµРјРµРЅРЅС‹Рµ РѕРєСЂСѓР¶РµРЅРёСЏ РЅРµ Р·Р°РґР°РЅС‹ вЂ” С‚РёС…Рѕ РІС‹С…РѕРґРёРј
    if (!botToken || !chatId) return;

    const config = LEVEL_CONFIG[level] || LEVEL_CONFIG.warning;
    const timestamp = formatTimestamp();

    const text = [
      `${config.emoji} <b>${config.label}</b>`,
      ``,
      message,
      ``,
      `<i>рџ•ђ ${timestamp}</i>`,
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
    // Р“Р»РѕС‚Р°РµРј РѕС€РёР±РєСѓ вЂ” Р°Р»РµСЂС‚С‹ РЅРµ РґРѕР»Р¶РЅС‹ Р»РѕРјР°С‚СЊ РѕСЃРЅРѕРІРЅРѕР№ С„Р»РѕСѓ
  }
}

/**
 * РљР»Р°СЃСЃРёС„РёС†РёСЂСѓРµС‚ РѕС€РёР±РєСѓ Рё РѕС‚РїСЂР°РІР»СЏРµС‚ Р°Р»РµСЂС‚ СЃ РєРѕРЅС‚РµРєСЃС‚РѕРј.
 * РђРІС‚РѕРјР°С‚РёС‡РµСЃРєРё РѕРїСЂРµРґРµР»СЏРµС‚ СѓСЂРѕРІРµРЅСЊ РїРѕ HTTP-СЃС‚Р°С‚СѓСЃСѓ.
 *
 * @param {Error|object} error вЂ” РѕР±СЉРµРєС‚ РѕС€РёР±РєРё
 * @param {string} context вЂ” РєРѕРЅС‚РµРєСЃС‚, РіРґРµ РїСЂРѕРёР·РѕС€Р»Р° РѕС€РёР±РєР° (РЅР°РїСЂ. "VTON generation")
 */
export async function alertOnError(error, context = 'unknown') {
  try {
    const status = error?.status || error?.statusCode || error?.response?.status || null;
    const errorMessage = error?.message || String(error);

    // РљР»Р°СЃСЃРёС„РёРєР°С†РёСЏ РѕС€РёР±РєРё РїРѕ СЃС‚Р°С‚СѓСЃСѓ
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
      `<b>РљРѕРЅС‚РµРєСЃС‚:</b> ${escapeHtml(context)}`,
      `<b>РћС€РёР±РєР°:</b> <code>${escapeHtml(truncate(errorMessage, 500))}</code>`,
      status ? `<b>РЎС‚Р°С‚СѓСЃ:</b> ${status}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    await sendAdminAlert(text, level);
  } catch {
    // Р“Р»РѕС‚Р°РµРј вЂ” Р±РµР·РѕРїР°СЃРЅРѕСЃС‚СЊ РїСЂРµР¶РґРµ РІСЃРµРіРѕ
  }
}

/**
 * РћС‚РїСЂР°РІР»СЏРµС‚ РєСЂР°СЃРёРІРѕРµ СѓРІРµРґРѕРјР»РµРЅРёРµ РѕР± СѓСЃРїРµС€РЅРѕР№ РѕРїР»Р°С‚Рµ.
 *
 * @param {string} planId вЂ” РёРґРµРЅС‚РёС„РёРєР°С‚РѕСЂ С‚Р°СЂРёС„РЅРѕРіРѕ РїР»Р°РЅР°
 * @param {string} uid вЂ” UID РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
 * @param {number|string} amount вЂ” СЃСѓРјРјР° РѕРїР»Р°С‚С‹
 */
export async function alertOnPayment(planId, uid, amount) {
  try {
    const text = [
      `<b>РќРѕРІР°СЏ РѕРїР»Р°С‚Р°!</b>`,
      ``,
      `рџ’Ћ <b>РўР°СЂРёС„:</b> ${escapeHtml(String(planId))}`,
      `рџ‘¤ <b>UID:</b> <code>${escapeHtml(String(uid))}</code>`,
      `рџ’µ <b>РЎСѓРјРјР°:</b> ${escapeHtml(String(amount))} в‚Ѕ`,
    ].join('\n');

    await sendAdminAlert(text, 'payment');
  } catch {
    // Р“Р»РѕС‚Р°РµРј вЂ” Р±РµР·РѕРїР°СЃРЅРѕСЃС‚СЊ РїСЂРµР¶РґРµ РІСЃРµРіРѕ
  }
}

// в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
// Р’СЃРїРѕРјРѕРіР°С‚РµР»СЊРЅС‹Рµ С„СѓРЅРєС†РёРё
// в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

/** Р­РєСЂР°РЅРёСЂСѓРµС‚ СЃРїРµС†СЃРёРјРІРѕР»С‹ HTML РґР»СЏ Р±РµР·РѕРїР°СЃРЅРѕР№ РІСЃС‚Р°РІРєРё РІ Telegram */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** РћР±СЂРµР·Р°РµС‚ СЃС‚СЂРѕРєСѓ РґРѕ maxLen СЃРёРјРІРѕР»РѕРІ */
function truncate(str, maxLen = 500) {
  const s = String(str);
  return s.length > maxLen ? s.slice(0, maxLen) + 'вЂ¦' : s;
}
