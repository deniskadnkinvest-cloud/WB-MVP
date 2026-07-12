// ═══════════════════════════════════════════════════════════════
// POST /api/admin/broadcast
//   body { text, audience, dryRun:true }              → подсчёт аудитории
//   body { text, imageUrl, buttonText, buttonUrl, audience } → запуск рассылки
// Массовая Telegram-рассылка через бота. Отправка идёт в фоне батчами.
// ═══════════════════════════════════════════════════════════════

import { query } from '../_db.js';
import { checkAdminAuth } from './verify.js';

const TG_LIMIT = 4096;
const BATCH_SIZE = 30;        // ~30 сообщений/сек — лимит Telegram
const PER_MSG_DELAY_MS = 33;  // пауза между сообщениями внутри батча
const BATCH_COOLDOWN_MS = 1000;

let _tableReady = false;
export async function ensureBroadcastsTable() {
  if (_tableReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS broadcasts (
      id SERIAL PRIMARY KEY,
      text TEXT NOT NULL,
      image_url TEXT,
      button_text VARCHAR(255),
      button_url TEXT,
      audience VARCHAR(20) DEFAULT 'all',
      status VARCHAR(20) DEFAULT 'queued',
      total_recipients INTEGER DEFAULT 0,
      sent_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      created_by VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, undefined, { retryUnsafe: true });
  _tableReady = true;
}

// Условие аудитории поверх users (алиас u). Только числовые telegram_id — реальные chat_id.
function audienceWhere(audience) {
  const numeric = `u.telegram_id ~ '^[0-9]+$'`;
  if (audience === 'paying') {
    return `${numeric} AND EXISTS (SELECT 1 FROM payments p WHERE p.user_id = u.id AND p.method = 'yookassa')`;
  }
  if (audience === 'free') {
    return `${numeric} AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.user_id = u.id AND p.method = 'yookassa')`;
  }
  return numeric; // all
}

async function countAudience(audience) {
  const [{ rows: aud }, { rows: tot }] = await Promise.all([
    query(`SELECT COUNT(*)::int AS n FROM users u WHERE ${audienceWhere(audience)}`),
    query(`SELECT COUNT(*)::int AS n FROM users`),
  ]);
  return { telegramUsers: aud[0]?.n || 0, totalUsers: tot[0]?.n || 0 };
}

async function resolveRecipients(audience) {
  const { rows } = await query(
    `SELECT u.telegram_id FROM users u WHERE ${audienceWhere(audience)}`
  );
  return rows.map(r => r.telegram_id).filter(Boolean);
}

async function updateProgress(id, fields) {
  const sets = [];
  const vals = [];
  let i = 1;
  for (const [k, v] of Object.entries(fields)) { sets.push(`${k} = $${i++}`); vals.push(v); }
  sets.push('updated_at = NOW()');
  vals.push(id);
  await query(`UPDATE broadcasts SET ${sets.join(', ')} WHERE id = $${i}`, vals, { retryUnsafe: true });
}

// Фоновая рассылка. НЕ await-ится вызывающим — прогресс пишется в broadcasts.
async function runBroadcast(id, { text, imageUrl, buttonText, buttonUrl }, recipients) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    await updateProgress(id, { status: 'failed', failed_count: recipients.length });
    console.error('[broadcast] TELEGRAM_BOT_TOKEN is not configured');
    return;
  }

  const replyMarkup = buttonText && buttonUrl
    ? JSON.stringify({ inline_keyboard: [[{ text: buttonText, url: buttonUrl }]] })
    : undefined;

  await updateProgress(id, { status: 'running' });

  let sent = 0, failed = 0;
  const batches = [];
  for (let i = 0; i < recipients.length; i += BATCH_SIZE) batches.push(recipients.slice(i, i + BATCH_SIZE));

  for (let b = 0; b < batches.length; b++) {
    for (const chatId of batches[b]) {
      try {
        const endpoint = imageUrl ? 'sendPhoto' : 'sendMessage';
        const body = imageUrl
          ? { chat_id: chatId, photo: imageUrl, caption: text, parse_mode: 'HTML', ...(replyMarkup && { reply_markup: replyMarkup }) }
          : { chat_id: chatId, text, parse_mode: 'HTML', ...(replyMarkup && { reply_markup: replyMarkup }) };
        const resp = await fetch(`https://api.telegram.org/bot${botToken}/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (resp.ok) sent++; else failed++;
      } catch { failed++; }
      await new Promise(r => setTimeout(r, PER_MSG_DELAY_MS));
    }
    // прогресс после каждого батча — чтобы «История» показывала живой процент
    await updateProgress(id, { sent_count: sent, failed_count: failed }).catch(() => {});
    if (b < batches.length - 1) await new Promise(r => setTimeout(r, BATCH_COOLDOWN_MS));
  }

  await updateProgress(id, { status: 'completed', sent_count: sent, failed_count: failed }).catch(() => {});

  // Общая статистика
  await query(
    `INSERT INTO stats_kv (key, value) VALUES ('broadcastSent', $1), ('broadcastFailed', $2)
     ON CONFLICT (key) DO UPDATE SET value = stats_kv.value + EXCLUDED.value`,
    [sent, failed], { retryUnsafe: true }
  ).catch(() => {});

  console.log(`[broadcast] #${id} done: sent=${sent}, failed=${failed}`);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key, X-Admin-Init-Data');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  const auth = checkAdminAuth(req);
  if (!auth.ok) return res.status(403).json({ ok: false, error: 'Access denied' });

  const { text, imageUrl, buttonText, buttonUrl, audience = 'all', dryRun } = req.body || {};

  try {
    await ensureBroadcastsTable();

    // ── Dry-run: только подсчёт аудитории ──
    if (dryRun) {
      const counts = await countAudience(audience);
      return res.status(200).json({ ok: true, ...counts });
    }

    // ── Реальная отправка ──
    const cleanText = String(text || '').trim();
    if (!cleanText) return res.status(400).json({ ok: false, error: 'Текст не может быть пустым' });
    if (cleanText.length > TG_LIMIT) return res.status(400).json({ ok: false, error: `Текст длиннее ${TG_LIMIT} символов` });

    const recipients = await resolveRecipients(audience);
    if (recipients.length === 0) {
      return res.status(400).json({ ok: false, error: 'В выбранной аудитории нет получателей с Telegram' });
    }

    const { rows } = await query(
      `INSERT INTO broadcasts (text, image_url, button_text, button_url, audience, status, total_recipients, created_by)
       VALUES ($1, $2, $3, $4, $5, 'queued', $6, $7)
       RETURNING id`,
      [cleanText, imageUrl || null, buttonText || null, buttonUrl || null, audience, recipients.length, auth.user?.firstName || 'admin'],
      { retryUnsafe: true }
    );
    const broadcastId = rows[0].id;

    // Запускаем в фоне — не блокируем ответ. Ошибки не роняют процесс.
    runBroadcast(broadcastId, { text: cleanText, imageUrl, buttonText, buttonUrl }, recipients)
      .catch(err => console.error('[broadcast] runBroadcast crashed:', err));

    return res.status(200).json({ ok: true, broadcastId, totalRecipients: recipients.length });
  } catch (err) {
    console.error('[broadcast] Error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
