// src/lib/subscriptionService.js
// Замена Firestore SDK — подписки через PostgreSQL API
// PLANS, DEFAULT_SUB и чистые функции (checkFeature, canGenerate, getPlanDetails) — без изменений
// Вся сложная логика (миграция TG ID, pending_grants, expiration check) теперь на сервере

import { apiFetch } from './api';

// ═══════════════════════════════════════════
//  PLAN DEFINITIONS
// ═══════════════════════════════════════════

export const PLANS = {
  none: {
    id: 'none',
    label: 'Без подписки',
    credits: 0,
    price: 0,
    period: null,
    canSaveModels: false,
    canSaveLocations: false,
    canPhotoshoot: false,
    canUsePresets: false,
    canUseCustomPrompts: false,
  },
  trial: {
    id: 'trial',
    label: 'Тест-драйв',
    emoji: '🎯',
    credits: 25,
    price: 500,
    period: null, // one-time
    canSaveModels: false,
    canSaveLocations: false,
    canPhotoshoot: false,
    canUsePresets: true,
    canUseCustomPrompts: true,
    description: 'Полный креатив, но без сохранения моделей',
  },
  base: {
    id: 'base',
    label: 'Про',
    emoji: '⚡',
    credits: 100,
    price: 5000,
    period: 'month',
    canSaveModels: true,
    canSaveLocations: true,
    canPhotoshoot: true,
    canUsePresets: true,
    canUseCustomPrompts: true,
    description: 'Полноценный инструмент для создания бренда',
    bestSeller: true,
  },
  pro: {
    id: 'pro',
    label: 'Бизнес',
    emoji: '🚀',
    credits: 1000,
    price: 14990,
    period: 'month',
    canSaveModels: true,
    canSaveLocations: true,
    canPhotoshoot: true,
    canUsePresets: true,
    canUseCustomPrompts: true,
    description: 'Максимальный пакет для крупных селлеров и студий',
  },
};

// ═══════════════════════════════════════════
//  DEFAULT SUBSCRIPTION
// ═══════════════════════════════════════════

const DEFAULT_SUB = {
  plan: 'none',
  credits: 0,
  creditsTotal: 0,
  planActivatedAt: null,
  planExpiresAt: null,
  subscriptionStatus: 'inactive',
  autoRenew: false,
  yookassaPaymentMethodId: null,
  payments: [],
};

// ═══════════════════════════════════════════
//  GET SUBSCRIPTION
// ═══════════════════════════════════════════

/**
 * Получить подписку пользователя.
 * Вся сложная логика (проверка expiration, миграция TG ID, pending_grants)
 * теперь выполняется на сервере в /api/subscription.
 *
 * @param {string} uid
 * @param {string|null} email
 * @param {string|null} telegramId
 * @returns {Promise<Object>} — данные подписки (plan, credits, creditsTotal, etc.)
 */
export const getSubscription = async (uid, email = null, telegramId = null) => {
  try {
    const params = new URLSearchParams({ uid });
    if (email) params.set('email', email);
    if (telegramId) params.set('telegramId', String(telegramId));

    const res = await apiFetch(`/api/subscription?${params}`);

    if (!res.ok) {
      console.error('[SubscriptionService] Ошибка получения подписки:', res.status);
      return { ...DEFAULT_SUB };
    }

    const json = await res.json();
    return json.data || { ...DEFAULT_SUB };
  } catch (err) {
    console.error('[SubscriptionService] Ошибка получения подписки:', err);
    return { ...DEFAULT_SUB };
  }
};

// ═══════════════════════════════════════════
//  ACTIVATE PLAN (after payment)
// ═══════════════════════════════════════════

/**
 * Активировать план после оплаты.
 * @param {string} uid
 * @param {string} planId
 * @param {Object} paymentInfo
 * @returns {Promise<{plan: string, credits: number}>}
 */
export const activatePlan = async (uid, planId, paymentInfo = {}) => {
  const plan = PLANS[planId];
  if (!plan) throw new Error(`Unknown plan: ${planId}`);

  const res = await apiFetch('/api/subscription', {
    method: 'POST',
    body: JSON.stringify({ uid, planId, paymentInfo }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка активации плана');
  }

  const json = await res.json();
  return json.data || { plan: planId, credits: plan.credits };
};

// ═══════════════════════════════════════════
//  USE CREDIT (deduct per generation)
// ═══════════════════════════════════════════

/**
 * Списать кредиты за генерацию.
 * Проверка баланса и плана теперь выполняется на сервере.
 *
 * @param {string} uid
 * @param {number} amount — количество кредитов (default 1)
 * @returns {Promise<{creditsRemaining: number}>}
 */
export const consumeCredit = async (uid, amount = 1) => {
  const res = await apiFetch('/api/consume-credit', {
    method: 'POST',
    body: JSON.stringify({ uid, amount }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    // Сервер возвращает 'NO_PLAN' или 'NO_CREDITS' — пробрасываем как Error
    throw new Error(err.error || 'Ошибка списания кредитов');
  }

  const json = await res.json();
  return json.data || { creditsRemaining: 0 };
};

// ═══════════════════════════════════════════
//  CHECK FEATURE ACCESS (чистая функция — без изменений)
// ═══════════════════════════════════════════

export const checkFeature = (planId, feature) => {
  const plan = PLANS[planId] || PLANS.none;
  return plan[feature] ?? false;
};

// ═══════════════════════════════════════════
//  HELPER: Can generate? (чистая функция — без изменений)
// ═══════════════════════════════════════════

export const canGenerate = (subscription) => {
  if (!subscription) return false;
  if (subscription.plan === 'none') return false;
  if (subscription.credits <= 0) return false;
  return true;
};

// ═══════════════════════════════════════════
//  HELPER: Get plan details (чистая функция — без изменений)
// ═══════════════════════════════════════════

export const getPlanDetails = (planId) => {
  return PLANS[planId] || PLANS.none;
};
