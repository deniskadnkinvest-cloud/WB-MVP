// src/lib/subscriptionService.js
// Подписки через серверный PostgreSQL API
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
    credits: 10,
    price: 500,
    period: null, // one-time
    // Новые правила: на Тест-драйве МОЖНО создать и сохранить свою модель
    // и сделать с ней 1 генерацию (modelGensLimit). Дальше — апгрейд.
    canSaveModels: true,
    modelGensLimit: 1,
    canSaveLocations: false,
    canPhotoshoot: false,
    canUsePresets: true,
    canUseCustomPrompts: true,
    description: 'Попробуйте все возможности — без подписки',
  },
  base: {
    id: 'base',
    label: 'Про',
    emoji: '⚡',
    credits: 100,
    price: 5000,
    period: 'month',
    canSaveModels: true,
    modelGensLimit: null, // безлимит
    canSaveLocations: true,
    canPhotoshoot: true,
    canUsePresets: true,
    canUseCustomPrompts: true,
    description: 'Свои модели, персонажи и фотосессии',
    bestSeller: true,
  },
  pro: {
    id: 'pro',
    label: 'Gold Seller',
    emoji: '👑',
    credits: 350,
    price: 14990,
    period: 'month',
    canSaveModels: true,
    modelGensLimit: null, // безлимит
    canSaveLocations: true,
    canPhotoshoot: true,
    canUsePresets: true,
    canUseCustomPrompts: true,
    description: 'Эксклюзивные условия для профессиональных брендов',
  },
};

// Сообщение при исчерпании trial-лимита генераций со своей моделью —
// единый текст для пре-чека на фронте и обработки ответа бэка
export const TRIAL_MODEL_LIMIT_MSG = 'На тарифе Тест-драйв доступна только 1 генерация с собственной моделью. Для безлимитных генераций со своей моделью перейдите на тариф Про ⚡ или Gold Seller 👑';

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
