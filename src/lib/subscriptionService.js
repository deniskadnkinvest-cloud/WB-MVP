import {
  doc, getDoc, setDoc, updateDoc, increment, serverTimestamp, arrayUnion, deleteDoc,
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

export const getSubscription = async (uid, email = null, telegramId = null) => {
  const ref = doc(db, 'users', uid, 'subscription', 'current');
  const snap = await getDoc(ref);
  let data = snap.exists() ? snap.data() : { ...DEFAULT_SUB };

  // Check expiration for monthly plans
  // НЕ обнуляем admin-granted подписки — они бессрочные по умолчанию
  if (data.planExpiresAt && !data.grantedByAdmin && !data.autoRenew) {
    try {
      const expiresDate = typeof data.planExpiresAt.toDate === 'function'
        ? data.planExpiresAt.toDate()
        : new Date(data.planExpiresAt);
      if (!isNaN(expiresDate.getTime()) && expiresDate < new Date()) {
        await updateDoc(ref, { plan: 'none', credits: 0, subscriptionStatus: 'expired' });
        data = { ...data, plan: 'none', credits: 0, subscriptionStatus: 'expired' };
      }
    } catch (e) {
      console.warn('[SubscriptionService] Ошибка проверки planExpiresAt:', e);
    }
  }


  // Если подписки нет (none), проверяем наличие предварительно выданного доступа по email
  if (data.plan === 'none' && email && email.includes('@')) {
    try {
      const cleanEmail = email.trim().toLowerCase();
      const pendingRef = doc(db, 'pending_grants', cleanEmail);
      const pendingSnap = await getDoc(pendingRef);
      
      if (pendingSnap.exists()) {
        const pendingData = pendingSnap.data();
        console.log(`[SubscriptionService] Активируем предварительный доступ для ${cleanEmail}:`, pendingData);
        
        const planId = pendingData.plan === 'custom' ? 'trial' : pendingData.plan;
        const credits = pendingData.credits;
        
        const grantPayment = {
          planId: pendingData.plan,
          amount: credits,
          currency: 'RUB',
          date: new Date().toISOString(),
          method: 'admin_grant',
          note: pendingData.note || 'Авто-активация по email при регистрации',
          grantedBy: pendingData.grantedBy || 'admin',
          grantedByName: pendingData.grantedByName || 'Admin',
          isGranted: true,
          providerChargeId: 'ADMIN_GRANT',
        };

        const newSub = {
          plan: planId,
          credits: credits,
          creditsTotal: credits,
          planActivatedAt: serverTimestamp(),
          planExpiresAt: null,
          payments: [grantPayment],
          grantedByAdmin: true,
          email: cleanEmail,
        };

        await setDoc(ref, newSub);
        
        // Удаляем временный документ
        try {
          await deleteDoc(pendingRef);
        } catch (delErr) {
          console.warn('[SubscriptionService] Не удалось удалить pending grant:', delErr);
        }
        
        return newSub;
      }
    } catch (err) {
      console.error('[SubscriptionService] Ошибка проверки pending_grants:', err);
    }
  }

  // ═══════════════════════════════════════════
  //  MIGRATION: Merge or Apply Telegram ID Subscription
  // ═══════════════════════════════════════════
  if (telegramId) {
    try {
      const tgIdStr = String(telegramId).trim();
      if (tgIdStr && tgIdStr !== uid) {
        const tgSubRef = doc(db, 'users', tgIdStr, 'subscription', 'current');
        const tgSubSnap = await getDoc(tgSubRef);
        
        if (tgSubSnap.exists()) {
          const tgSubData = tgSubSnap.data();
          console.log(`[SubscriptionService] Найдена подписка на TG ID ${tgIdStr}. Переносим на UID ${uid}:`, tgSubData);
          
          let newSub;
          if (data.plan === 'none') {
            newSub = {
              ...tgSubData,
              telegramId: tgIdStr,           // Сохраняем TG ID для поиска в админке
              migratedFromTgId: tgIdStr,
              updatedAt: serverTimestamp(),
            };
          } else {
            // Сливаем подписки, если у юзера уже есть план
            newSub = {
              ...data,
              plan: tgSubData.plan !== 'none' ? tgSubData.plan : data.plan,
              credits: (data.credits || 0) + (tgSubData.credits || 0),
              creditsTotal: (data.creditsTotal || 0) + (tgSubData.creditsTotal || 0),
              telegramId: tgIdStr,           // Сохраняем TG ID для поиска в админке
              migratedFromTgId: tgIdStr,
              updatedAt: serverTimestamp(),
              grantedByAdmin: data.grantedByAdmin || tgSubData.grantedByAdmin,
              payments: [...(data.payments || []), ...(tgSubData.payments || [])],
            };
            if (tgSubData.plan !== 'none') {
              newSub.planActivatedAt = tgSubData.planActivatedAt || data.planActivatedAt;
              newSub.planExpiresAt = tgSubData.planExpiresAt || data.planExpiresAt;
            }
          }
          
          await setDoc(ref, newSub);
          
          // Удаляем старую подписку с Telegram ID
          try {
            await deleteDoc(tgSubRef);
            console.log(`[SubscriptionService] Старая подписка на TG ID ${tgIdStr} удалена.`);
          } catch (delErr) {
            console.warn('[SubscriptionService] Не удалось удалить подписку с TG ID:', delErr);
          }
          
          data = newSub; // Обновляем локальные данные перед возвратом
        }
      }
    } catch (err) {
      console.error('[SubscriptionService] Ошибка миграции подписки по Telegram ID:', err);
    }
  }

  // Если telegramId передан, но ещё не записан в Firestore — сохраняем его
  // чтобы adminPanel мог находить Firebase UID по Telegram ID
  if (telegramId && data.plan !== 'none' && !data.telegramId) {
    try {
      const ref2 = doc(db, 'users', uid, 'subscription', 'current');
      await updateDoc(ref2, { telegramId: String(telegramId) });
      data = { ...data, telegramId: String(telegramId) };
    } catch (e) {
      console.warn('[SubscriptionService] Не удалось сохранить telegramId:', e);
    }
  }

  // Создаем плоский маппинг Telegram ID -> Firebase UID для быстрого поиска в админке
  if (telegramId) {
    try {
      const tgIdStr = String(telegramId).trim();
      const mapRef = doc(db, 'telegram_uid_map', tgIdStr);
      await setDoc(mapRef, {
        firebaseUid: uid,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      console.warn('[SubscriptionService] Не удалось записать маппинг в telegram_uid_map:', e);
    }
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

export const consumeCredit = async (uid, amount = 1) => {
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
