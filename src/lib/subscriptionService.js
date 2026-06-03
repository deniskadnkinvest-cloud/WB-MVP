import {
  doc, getDoc, setDoc, updateDoc, increment, serverTimestamp, arrayUnion,
} from 'firebase/firestore';
import { db } from './firebase';

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
    price: 4990,
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
    price: 15990,
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
  payments: [],
};

// ═══════════════════════════════════════════
//  GET SUBSCRIPTION
// ═══════════════════════════════════════════

export const getSubscription = async (uid) => {
  const ref = doc(db, 'users', uid, 'subscription', 'current');
  const snap = await getDoc(ref);
  if (!snap.exists()) return { ...DEFAULT_SUB };
  const data = snap.data();

  // Check expiration for monthly plans
  if (data.planExpiresAt && data.planExpiresAt.toDate() < new Date()) {
    // Plan expired — downgrade to none, keep remaining credits at 0
    await updateDoc(ref, { plan: 'none', credits: 0 });
    return { ...data, plan: 'none', credits: 0 };
  }

  return data;
};

// ═══════════════════════════════════════════
//  ACTIVATE PLAN (after payment)
// ═══════════════════════════════════════════

export const activatePlan = async (uid, planId, paymentInfo = {}) => {
  const plan = PLANS[planId];
  if (!plan) throw new Error(`Unknown plan: ${planId}`);

  const ref = doc(db, 'users', uid, 'subscription', 'current');
  const now = new Date();
  let expiresAt = null;

  if (plan.period === 'month') {
    expiresAt = new Date(now);
    expiresAt.setMonth(expiresAt.getMonth() + 1);
  }

  const payment = {
    planId,
    amount: plan.price,
    currency: 'RUB',
    date: now.toISOString(),
    ...paymentInfo,
  };

  await setDoc(ref, {
    plan: planId,
    credits: plan.credits,
    creditsTotal: plan.credits,
    planActivatedAt: serverTimestamp(),
    planExpiresAt: expiresAt,
    payments: arrayUnion(payment),
  }, { merge: true });

  return { plan: planId, credits: plan.credits };
};

// ═══════════════════════════════════════════
//  USE CREDIT (deduct 1 per generation)
// ═══════════════════════════════════════════

export const useCredit = async (uid, amount = 1) => {
  const sub = await getSubscription(uid);

  if (sub.plan === 'none') {
    throw new Error('NO_PLAN');
  }

  if (sub.credits < amount) {
    throw new Error('NO_CREDITS');
  }

  const ref = doc(db, 'users', uid, 'subscription', 'current');
  await updateDoc(ref, {
    credits: increment(-amount),
  });

  return { creditsRemaining: sub.credits - amount };
};

// ═══════════════════════════════════════════
//  CHECK FEATURE ACCESS
// ═══════════════════════════════════════════

export const checkFeature = (planId, feature) => {
  const plan = PLANS[planId] || PLANS.none;
  return plan[feature] ?? false;
};

// ═══════════════════════════════════════════
//  HELPER: Can generate?
// ═══════════════════════════════════════════

export const canGenerate = (subscription) => {
  if (!subscription) return false;
  if (subscription.plan === 'none') return false;
  if (subscription.credits <= 0) return false;
  return true;
};

// ═══════════════════════════════════════════
//  HELPER: Get plan details for current sub
// ═══════════════════════════════════════════

export const getPlanDetails = (planId) => {
  return PLANS[planId] || PLANS.none;
};
