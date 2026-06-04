// ═══════════════════════════════════════════════════════════════
// POST /api/admin/broadcast
// Запускает массовую рассылку через Telegram Bot API
//
// Body:
//   text       string   — текст сообщения (Markdown)
//   imageUrl   string?  — URL картинки (опционально)
//   buttonText string?  — текст кнопки (опционально)
//   buttonUrl  string?  — URL кнопки (опционально)
//   audience   string   — 'all' | 'paying' | 'free'
//   dryRun     boolean? — если true, только считает кол-во юзеров
//
// Логика:
//   1. Вытаскивает всех юзеров из Firestore
//   2. Фильтрует по аудитории
//   3. Создаёт запись рассылки в коллекции broadcasts
//   4. Запускает Inngest-функцию для фоновой отправки
// ═══════════════════════════════════════════════════════════════

import { ensureFirebaseAdmin } from '../_firebase-admin.js';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { checkAdminAuth } from './verify.js';
import { inngest } from '../inngest/client.js';

ensureFirebaseAdmin();
const db = getFirestore();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key, X-Admin-Init-Data');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // ── Проверка прав ──
  const adminAuth = checkAdminAuth(req);
  if (!adminAuth.ok) return res.status(403).json({ ok: false, error: 'Нет доступа' });

  const {
    text,
    imageUrl = null,
    buttonText = null,
    buttonUrl = null,
    audience = 'all',
    dryRun = false,
  } = req.body || {};

  if (!text?.trim()) return res.status(400).json({ ok: false, error: 'Текст рассылки не может быть пустым' });
  if (!['all', 'paying', 'free'].includes(audience)) {
    return res.status(400).json({ ok: false, error: 'Аудитория: all | paying | free' });
  }

  try {
    // ── Получаем всех юзеров ──
    const usersSnap = await db.collection('users').get();
    let allUsers = usersSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() }));

    // ── Фильтр аудитории по наличию платной подписки ──
    if (audience !== 'all') {
      // Проверяем коллекцию subscription/current для каждого юзера
      const subscriptionChecks = await Promise.all(
        allUsers.map(async u => {
          const subSnap = await db.doc(`users/${u.uid}/subscription/current`).get();
          const sub = subSnap.data() || {};
          const hasPaid = (sub.payments || []).some(p => p.isTest === false && p.isGranted !== true && p.amount > 0);
          return { uid: u.uid, hasPaid };
        })
      );
      const payingSet = new Set(subscriptionChecks.filter(s => s.hasPaid).map(s => s.uid));

      if (audience === 'paying') {
        allUsers = allUsers.filter(u => payingSet.has(u.uid));
      } else if (audience === 'free') {
        allUsers = allUsers.filter(u => !payingSet.has(u.uid));
      }
    }

    // Фильтруем: только Telegram ID (числовые UID)
    const telegramUsers = allUsers.filter(u => /^\d+$/.test(String(u.uid)));

    if (dryRun) {
      return res.status(200).json({
        ok: true,
        dryRun: true,
        totalUsers: allUsers.length,
        telegramUsers: telegramUsers.length,
        audience,
      });
    }

    if (telegramUsers.length === 0) {
      return res.status(400).json({ ok: false, error: 'Нет Telegram-пользователей в выбранной аудитории' });
    }

    // ── Создаём запись рассылки ──
    const broadcastId = `broadcast_${Date.now()}`;
    const now = new Date().toISOString();
    const broadcastDoc = {
      id: broadcastId,
      text,
      imageUrl,
      buttonText,
      buttonUrl,
      audience,
      status: 'queued',           // queued | running | completed | failed
      totalRecipients: telegramUsers.length,
      sentCount: 0,
      failedCount: 0,
      createdAt: now,
      createdBy: adminAuth.user?.firstName || 'Admin',
      completedAt: null,
    };

    await db.collection('broadcasts').doc(broadcastId).set(broadcastDoc);

    // ── Запускаем Inngest фоновую задачу ──
    await inngest.send({
      name: 'broadcast/send',
      data: {
        broadcastId,
        text,
        imageUrl,
        buttonText,
        buttonUrl,
        userIds: telegramUsers.map(u => u.uid),
      },
    });

    console.log(`📢 [broadcast] Создана рассылка ${broadcastId} для ${telegramUsers.length} юзеров`);

    return res.status(200).json({
      ok: true,
      broadcastId,
      totalRecipients: telegramUsers.length,
      status: 'queued',
    });
  } catch (err) {
    console.error('[broadcast] Ошибка:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
