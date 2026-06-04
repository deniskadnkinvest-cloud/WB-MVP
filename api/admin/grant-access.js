// ═══════════════════════════════════════════════════════════════
// POST /api/admin/grant-access
// Выдаёт бесплатный доступ пользователю по Telegram UID
//
// Body:
//   uid        string  — Telegram user ID (числовой)
//   plan       string  — 'trial' | 'base' | 'pro' | 'custom'
//   credits    number  — если plan === 'custom', кол-во кредитов
//   note       string  — комментарий (зачем выдали, опционально)
//
// Поведение:
//   - Если у пользователя нет подписки — создаёт новую
//   - Если есть — добавляет кредиты к текущему балансу (merge)
//   - Всегда помечает grant как isGranted: true (не тестовый, не оплаченный)
// ═══════════════════════════════════════════════════════════════

import { ensureFirebaseAdmin } from '../_firebase-admin.js';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { checkAdminAuth } from './verify.js';

ensureFirebaseAdmin();
const db = getFirestore();

// Кредиты по тарифу (зеркало из payment-webhook.js)
const PLAN_CREDITS = {
  trial: 25,
  base: 100,
  pro: 1000,
};

const PLAN_LABELS = {
  trial: 'Старт (25 кред.)',
  base: 'Про (100 кред.)',
  pro: 'Бизнес (1000 кред.)',
  custom: 'Ручной',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key, X-Admin-Init-Data');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // ── Проверка прав доступа ──
  const auth = checkAdminAuth(req);
  if (!auth.ok) {
    return res.status(403).json({ ok: false, error: 'Нет доступа' });
  }

  const { uid, plan = 'trial', credits: customCredits, note = '' } = req.body || {};

  if (!uid) {
    return res.status(400).json({ ok: false, error: 'uid обязателен' });
  }

  // Нормализуем uid — убираем пробелы, @ и всё лишнее
  const cleanUid = String(uid).trim().replace('@', '').replace(/\D/g, '');
  if (!cleanUid || isNaN(Number(cleanUid))) {
    return res.status(400).json({ ok: false, error: 'uid должен быть числовым Telegram ID' });
  }

  // Кол-во кредитов
  let creditsToGrant;
  if (plan === 'custom') {
    creditsToGrant = parseInt(customCredits, 10);
    if (!creditsToGrant || creditsToGrant < 1 || creditsToGrant > 10000) {
      return res.status(400).json({ ok: false, error: 'Кол-во кредитов: от 1 до 10000' });
    }
  } else {
    creditsToGrant = PLAN_CREDITS[plan];
    if (!creditsToGrant) {
      return res.status(400).json({ ok: false, error: 'Неверный тариф. Допустимые: trial, base, pro, custom' });
    }
  }

  try {
    const ref = db.doc(`users/${cleanUid}/subscription/current`);
    const snap = await ref.get();
    const now = new Date().toISOString();

    const grantEntry = {
      planId: plan,
      method: 'admin_grant',
      grantedBy: auth.user?.id || 'admin',
      grantedByName: auth.user?.firstName || 'Admin',
      amount: creditsToGrant,
      date: now,
      note: note || '',
      isGranted: true,       // бесплатная выдача
      isTest: false,         // считается как реальный доступ
      providerChargeId: 'ADMIN_GRANT', // не пустой → не считается тестовым
    };

    if (!snap.exists) {
      // Пользователь не существует в системе — создаём запись
      await ref.set({
        plan: plan === 'custom' ? 'trial' : plan,
        credits: creditsToGrant,
        creditsTotal: creditsToGrant,
        planActivatedAt: FieldValue.serverTimestamp(),
        planExpiresAt: null,       // бесплатный доступ — без срока
        payments: [grantEntry],
        grantedByAdmin: true,
      });

      console.log(`✅ [admin/grant] СОЗДАН новый пользователь ${cleanUid}, план: ${plan}, кредитов: ${creditsToGrant}. Выдал: ${auth.user?.firstName}`);

      return res.status(200).json({
        ok: true,
        action: 'created',
        uid: cleanUid,
        plan,
        creditsGranted: creditsToGrant,
        newCredits: creditsToGrant,
      });
    } else {
      // Пользователь уже есть — добавляем кредиты поверх текущего баланса
      const existing = snap.data();
      const currentCredits = existing.credits || 0;

      await ref.update({
        credits: FieldValue.increment(creditsToGrant),
        creditsTotal: FieldValue.increment(creditsToGrant),
        payments: FieldValue.arrayUnion(grantEntry),
        grantedByAdmin: true,
      });

      const newCredits = currentCredits + creditsToGrant;
      console.log(`✅ [admin/grant] +${creditsToGrant} кред. → пользователь ${cleanUid} (было: ${currentCredits}, стало: ${newCredits}). Выдал: ${auth.user?.firstName}`);

      return res.status(200).json({
        ok: true,
        action: 'topup',
        uid: cleanUid,
        plan,
        creditsGranted: creditsToGrant,
        previousCredits: currentCredits,
        newCredits,
      });
    }
  } catch (err) {
    console.error('[admin/grant] Ошибка:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
