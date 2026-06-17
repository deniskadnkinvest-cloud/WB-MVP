// ═══════════════════════════════════════════════════════════════
// POST /api/admin/grant-access
// Выдаёт бесплатный доступ пользователю
//
// Поддерживает идентификацию по:
//   - Telegram ID (числовой)
//   - Email (Firebase Auth)
//   - Firebase UID (строка)
//
// Body:
//   identifier string  — Telegram ID, email или Firebase UID
//   plan       string  — 'trial' | 'base' | 'pro' | 'custom'
//   credits    number  — если plan === 'custom', кол-во кредитов
//   note       string  — комментарий (опционально)
//
// Поведение:
//   - По email: ищет пользователя в Firebase Auth → получает UID
//   - Если у пользователя нет подписки — создаёт новую
//   - Если есть — добавляет кредиты к текущему балансу
// ═══════════════════════════════════════════════════════════════

import { ensureFirebaseAdmin } from '../_firebase-admin.js';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { checkAdminAuth } from './verify.js';

ensureFirebaseAdmin();
const db = getFirestore();

// Кредиты по тарифу
const PLAN_CREDITS = {
  trial: 25,
  base: 100,
  pro: 1000,
};

const PAID_PLANS = new Set(['base', 'pro']);

function resolveEffectivePlan(plan, existingPlan = 'none') {
  if (plan !== 'custom') return plan;
  return existingPlan && existingPlan !== 'none' ? existingPlan : 'trial';
}

function buildExpiresAt(plan) {
  if (!PAID_PLANS.has(plan)) return null;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  return expiresAt;
}

/**
 * Определяет тип идентификатора и возвращает Firebase UID
 */
async function resolveUid(identifier) {
  const clean = String(identifier).trim();
  if (!clean) throw new Error('Идентификатор пустой');

  // 1. Email — содержит @
  if (clean.includes('@') && clean.includes('.')) {
    const lowerEmail = clean.toLowerCase();
    try {
      const userRecord = await getAuth().getUserByEmail(lowerEmail);
      return {
        uid: userRecord.uid,
        resolvedFrom: 'email',
        displayInfo: `${lowerEmail} → ${userRecord.uid}`,
        email: lowerEmail,
      };
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        return {
          uid: null,
          resolvedFrom: 'email_pending',
          displayInfo: `${lowerEmail} (ожидает регистрации)`,
          email: lowerEmail,
        };
      }
      throw new Error(`Ошибка поиска по email: ${err.message}`);
    }
  }

  // 2. Чисто числовой — Telegram ID
  const numericOnly = clean.replace(/\D/g, '');
  if (numericOnly && numericOnly === clean) {
    return {
      uid: numericOnly,
      resolvedFrom: 'telegram_id',
      displayInfo: `TG ID ${numericOnly}`,
      email: null,
    };
  }

  // 3. Всё остальное — Firebase UID (строка)
  return {
    uid: clean,
    resolvedFrom: 'firebase_uid',
    displayInfo: `UID ${clean}`,
    email: null,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key, X-Admin-Init-Data');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // ── Проверка прав доступа ──
  const adminAuth = checkAdminAuth(req);
  if (!adminAuth.ok) {
    return res.status(403).json({ ok: false, error: 'Нет доступа' });
  }

  const { identifier, uid: legacyUid, plan = 'trial', credits: customCredits, note = '' } = req.body || {};
  const rawIdentifier = identifier || legacyUid; // обратная совместимость с полем uid

  if (!rawIdentifier) {
    return res.status(400).json({ ok: false, error: 'Укажите Telegram ID, email или UID пользователя' });
  }

  // ── Резолвим идентификатор в UID ──
  let resolved;
  try {
    resolved = await resolveUid(rawIdentifier);
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }

  const { uid: resolvedUid, resolvedFrom, displayInfo, email } = resolved;

  // ── Кол-во кредитов ──
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

  // Если пользователь не найден по email, создаем "предварительный доступ"
  if (resolvedFrom === 'email_pending') {
    try {
      const now = new Date().toISOString();
      const effectivePlan = resolveEffectivePlan(plan);
      const pendingRef = db.doc(`pending_grants/${email}`);
      await pendingRef.set({
        email,
        plan,
        effectivePlan,
        credits: creditsToGrant,
        note: note || '',
        grantedBy: adminAuth.user?.id || 'admin',
        grantedByName: adminAuth.user?.firstName || 'Admin',
        date: now,
      });

      console.log(`✅ [admin/grant] СОЗДАН PENDING GRANT для ${email}, план: ${plan}, кредитов: ${creditsToGrant}. Выдал: ${adminAuth.user?.firstName}`);

      return res.status(200).json({
        ok: true,
        action: 'pending',
        resolvedFrom,
        displayInfo,
        plan,
        effectivePlan,
        creditsGranted: creditsToGrant,
        newCredits: creditsToGrant,
      });
    } catch (err) {
      console.error('[admin/grant] Ошибка при создании pending grant:', err);
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  try {
    const ref = db.doc(`users/${resolvedUid}/subscription/current`);
    const snap = await ref.get();
    const now = new Date().toISOString();
    const existing = snap.exists ? snap.data() : {};
    const effectivePlan = resolveEffectivePlan(plan, existing?.plan || 'none');
    const planExpiresAt = buildExpiresAt(effectivePlan);

    const grantEntry = {
      planId: plan,
      effectivePlan,
      method: 'admin_grant',
      grantedBy: adminAuth.user?.id || 'admin',
      grantedByName: adminAuth.user?.firstName || 'Admin',
      amount: creditsToGrant,
      date: now,
      note: note || '',
      resolvedFrom,         // как нашли юзера: email, telegram_id, firebase_uid
      originalIdentifier: rawIdentifier,
      isGranted: true,
      isTest: false,
      providerChargeId: 'ADMIN_GRANT',
    };

    if (!snap.exists) {
      await ref.set({
        plan: effectivePlan,
        credits: creditsToGrant,
        creditsTotal: creditsToGrant,
        planActivatedAt: FieldValue.serverTimestamp(),
        planExpiresAt,
        subscriptionStatus: 'active',
        status: 'active',
        payments: [grantEntry],
        grantedByAdmin: true,
        updatedAt: FieldValue.serverTimestamp(),
        ...(email && { email }),
      });

      console.log(`✅ [admin/grant] СОЗДАН ${displayInfo}, план: ${plan}, кредитов: ${creditsToGrant}. Выдал: ${adminAuth.user?.firstName}`);

      return res.status(200).json({
        ok: true,
        action: 'created',
        uid: resolvedUid,
        resolvedFrom,
        displayInfo,
        plan,
        effectivePlan,
        creditsGranted: creditsToGrant,
        newCredits: creditsToGrant,
      });
    } else {
      const currentCredits = existing.credits || 0;
      const shouldIncrement = plan === 'custom';

      await ref.set({
        plan: effectivePlan,
        credits: shouldIncrement ? FieldValue.increment(creditsToGrant) : creditsToGrant,
        creditsTotal: shouldIncrement ? FieldValue.increment(creditsToGrant) : creditsToGrant,
        planActivatedAt: FieldValue.serverTimestamp(),
        planExpiresAt,
        subscriptionStatus: 'active',
        status: 'active',
        payments: FieldValue.arrayUnion(grantEntry),
        grantedByAdmin: true,
        updatedAt: FieldValue.serverTimestamp(),
        ...(email && { email }),
      }, { merge: true });

      const newCredits = shouldIncrement ? (currentCredits + creditsToGrant) : creditsToGrant;
      console.log(`✅ [admin/grant] ${shouldIncrement ? '+' : ''}${creditsToGrant} кред. + plan=${effectivePlan} → ${displayInfo} (было: ${currentCredits}, стало: ${newCredits}). Выдал: ${adminAuth.user?.firstName}`);

      return res.status(200).json({
        ok: true,
        action: shouldIncrement ? 'topup' : 'plan_updated',
        uid: resolvedUid,
        resolvedFrom,
        displayInfo,
        plan,
        effectivePlan,
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
