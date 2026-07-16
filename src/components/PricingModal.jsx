import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PLANS } from '../lib/subscriptionService';
import './PricingModal.css';

// Пакеты доп-генераций (top-up). ИСТОЧНИК ИСТИНЫ по цене/кредитам —
// PLAN_CONFIG в api/create-payment.js и PLAN_CREDITS в api/payment-webhook-yookassa.js.
// При изменении цен там — синхронизировать здесь (см. QA-FINDINGS: дублирование конфига).
const TOPUP_PACKAGES = [
  { id: 'topup_5', credits: 5, price: 249 },
  { id: 'topup_30', credits: 30, price: 1090 },
  { id: 'topup_50', credits: 50, price: 1790, best: true },
  { id: 'topup_100', credits: 100, price: 3490 },
  { id: 'topup_350', credits: 350, price: 8990 },
];

const formatExpiryDate = (value) => {
  if (!value) return null;
  const date = typeof value.toDate === 'function'
    ? value.toDate()
    : new Date(value.seconds ? value.seconds * 1000 : value);

  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('ru-RU');
};

export default function PricingModal({
  isOpen,
  onClose,
  currentPlan,
  onSelectPlan,
  loading,
  subscription,
  onCancelAutoRenew,
  canceling,
  requiresAuth = false,
  onAuthRequired,
  initialView = 'plans', // 'plans' | 'topup'
}) {
  const [selectedPlanId, setSelectedPlanId] = useState(null);

  // Escape closes modal (parity with Telegram Back / desktop UX)
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const plans = [PLANS.trial, PLANS.base, PLANS.pro];
  const expiryDate = formatExpiryDate(subscription?.planExpiresAt);

  const handleSelect = (planId) => {
    if (requiresAuth) {
      onAuthRequired?.();
      return;
    }
    setSelectedPlanId(planId);
    onSelectPlan(planId);
  };

  // Рендер секции Top-Up
  const renderTopUp = (titleText, subtitleText) => (
    <div className="topup-section">
      <div className="topup-header">
        <h3 className="topup-title">{titleText}</h3>
        <p className="topup-subtitle">{subtitleText}</p>
      </div>
      <div className="topup-grid">
        {TOPUP_PACKAGES.map((pkg) => {
          const isSelected = selectedPlanId === pkg.id;
          const perCredit = Math.round(pkg.price / pkg.credits);
          return (
            <button
              key={pkg.id}
              className={`topup-card ${pkg.best ? 'topup-card--best' : ''} ${isSelected ? 'topup-card--selected' : ''}`}
              onClick={() => handleSelect(pkg.id)}
              disabled={loading && isSelected}
            >
              {pkg.best && <span className="topup-badge">Выгодно</span>}
              <span className="topup-credits">{pkg.credits.toLocaleString('ru-RU')}</span>
              <span className="topup-credits-label">генераций</span>
              <span className="topup-price">
                {loading && isSelected ? '⏳' : `${pkg.price.toLocaleString('ru-RU')} ₽`}
              </span>
              <span className="topup-per">≈ {perCredit} ₽/шт</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  // Рендер секции тарифов
  const renderPlans = () => (
    <div className="pricing-grid">
      {plans.map((plan, i) => {
        const isActive = currentPlan === plan.id;
        const isSelected = selectedPlanId === plan.id;
        const isBest = plan.bestSeller;
        const isGold = plan.id === 'pro';

        return (
          <motion.div
            key={plan.id}
            className={`pricing-card ${isBest ? 'pricing-card--best' : ''} ${isGold ? 'pricing-card--gold' : ''} ${isActive ? 'pricing-card--active' : ''} ${isSelected ? 'pricing-card--selected' : ''}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, duration: 0.4 }}
          >
            {isActive 
              ? <div className="pricing-badge pricing-badge--active">✓ Активен</div>
              : isGold
                ? <div className="pricing-badge pricing-badge--gold">Gold Seller</div>
                : isBest 
                  ? <div className="pricing-badge pricing-badge--best">⭐ Best Seller</div>
                  : null
            }

            <div className="pricing-card-emoji">{plan.emoji}</div>
            <h3 className="pricing-card-name">{plan.label}</h3>
            <p className="pricing-card-desc">{plan.description}</p>

            <div className="pricing-price">
              <span className="pricing-price-value">{plan.price.toLocaleString('ru-RU')}</span>
              <span className="pricing-price-currency"> ₽</span>
              {plan.period === 'month' && <span className="pricing-price-period">/мес</span>}
              {!plan.period && <span className="pricing-price-period">разово</span>}
            </div>

            <div className="pricing-credits">
              <span className="pricing-credits-num">{plan.credits.toLocaleString('ru-RU')}</span> генераций
            </div>

            <ul className="pricing-features">
              <li className="pricing-feature-group">Базовые возможности</li>
              <li className="pricing-feature pricing-feature--yes">
                <span className="feature-icon">✅</span> <span className="feature-text">Виртуальная примерка одежды на AI-модели</span>
              </li>
              <li className="pricing-feature pricing-feature--yes">
                <span className="feature-icon">✅</span> <span className="feature-text">Реалистичные фото от покупателей (UGC)</span>
              </li>
              <li className="pricing-feature pricing-feature--yes">
                <span className="feature-icon">✅</span> <span className="feature-text">Готовые карточки для WB, Ozon, Inst</span>
              </li>
              <li className="pricing-feature pricing-feature--yes">
                <span className="feature-icon">✅</span> <span className="feature-text">Предметная и студийная съёмка</span>
              </li>
              <li className="pricing-feature pricing-feature--yes">
                <span className="feature-icon">✅</span> <span className="feature-text">10+ моделей · 7 фонов · 5 форматов</span>
              </li>

              {/* PRO Features - show on all, locked on Trial */}
              <li className="pricing-feature-group">{plan.id === 'trial' ? 'PRO-инструменты' : 'Всё базовое, а также:'}</li>
              <li className={`pricing-feature ${plan.canSaveModels ? 'pricing-feature--yes' : 'pricing-feature--no'}`}>
                <span className="feature-icon">{plan.canSaveModels ? '✅' : '🔒'}</span> <span className="feature-text">{plan.modelGensLimit === 1 ? 'Своя AI-модель — 1 пробная генерация' : 'Своя AI-модель по вашим фото, безлимит'}</span>
              </li>
              <li className={`pricing-feature ${plan.canSaveModels ? 'pricing-feature--yes' : 'pricing-feature--no'}`}>
                <span className="feature-icon">{plan.canSaveModels ? '✅' : '🔒'}</span> <span className="feature-text">Создание уникальных персонажей</span>
              </li>
              <li className={`pricing-feature ${plan.canSaveLocations ? 'pricing-feature--yes' : 'pricing-feature--no'}`}>
                <span className="feature-icon">{plan.canSaveLocations ? '✅' : '🔒'}</span> <span className="feature-text">Свои фоны и локации для съёмки</span>
              </li>
              <li className={`pricing-feature ${plan.canPhotoshoot ? 'pricing-feature--yes' : 'pricing-feature--no'}`}>
                <span className="feature-icon">{plan.canPhotoshoot ? '✅' : '🔒'}</span> <span className="feature-text">Фотосессия: 5 ракурсов за 1 клик</span>
              </li>

              {/* GOLD Features - hide on Trial, show on Base/Pro */}
              {plan.id !== 'trial' && (
                <>
                  <li className="pricing-feature-group">{isGold ? 'Эксклюзивно для Gold:' : 'Gold-премиум'}</li>
                  <li className={`pricing-feature ${isGold ? 'pricing-feature--yes' : 'pricing-feature--no'}`}>
                    <span className="feature-icon">{isGold ? '✅' : '🔒'}</span> <span className="feature-text">Fast Track — приоритетная генерация</span>
                  </li>
                  <li className={`pricing-feature ${isGold ? 'pricing-feature--yes' : 'pricing-feature--no'}`}>
                    <span className="feature-icon">{isGold ? '✅' : '🔒'}</span> <span className="feature-text">Закрытый клуб и ранний доступ</span>
                  </li>
                  <li className={`pricing-feature ${isGold ? 'pricing-feature--yes' : 'pricing-feature--no'}`}>
                    <span className="feature-icon">{isGold ? '✅' : '🔒'}</span> <span className="feature-text">Приоритет техподдержки</span>
                  </li>
                  <li className={`pricing-feature ${isGold ? 'pricing-feature--yes' : 'pricing-feature--no'}`}>
                    <span className="feature-icon">{isGold ? '✅' : '🔒'}</span> <span className="feature-text">Перенос неиспользованных генераций</span>
                  </li>
                </>
              )}
            </ul>

            <div className="pricing-action-area">
              <button
                className={`pricing-btn ${isBest ? 'pricing-btn--best' : ''} ${isGold ? 'pricing-btn--gold' : ''} ${isActive ? 'pricing-btn--active' : ''}`}
                onClick={() => handleSelect(plan.id)}
                disabled={isActive || (loading && isSelected)}
              >
                {requiresAuth ? (
                  'Войти и выбрать'
                ) : loading && isSelected ? (
                  '⏳ Активация...'
                ) : isActive ? (
                  '✓ Активен'
                ) : (
                  <>
                    {isGold ? `👑 Подключить ${plan.label.toUpperCase()}` : isBest ? `🚀 Подключить ${plan.label.toUpperCase()}` : `Подключить ${plan.label}`} —
                    <br />
                    {plan.price.toLocaleString('ru-RU')} ₽
                  </>
                )}
              </button>

              {/* Обязательное уведомление ЮКасса: возможность отмены */}
              {plan.period === 'month' && !isActive && (
                <div className="pricing-cancel-badge">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="pricing-cancel-badge-icon">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                  </svg>
                  <span>Отмена в 1 клик в любой момент</span>
                </div>
              )}
              
              {!plan.period && !isActive && (
                <div className="pricing-cancel-badge pricing-cancel-badge--onetime">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="pricing-cancel-badge-icon">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  <span>Разовый платеж, без подписки</span>
                </div>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );

  const hasPlan = subscription?.plan && subscription.plan !== 'none';
  const isTopUpView = initialView === 'topup' && hasPlan;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="pricing-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            className="pricing-modal"
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="pricing-header">
              <h2 className="pricing-title">
                {isTopUpView ? 'Пополните генерации' : 'Выберите тариф'}
              </h2>
              <p className="pricing-subtitle">
                {isTopUpView 
                  ? 'Ваш тариф активен — докупите кредиты для продолжения' 
                  : 'Качество маркетплейса — скорость AI'}
              </p>
              <button className="pricing-close" onClick={onClose}>✕</button>
            </div>

            {requiresAuth && (
              <div className="pricing-auth-notice" role="status">
                <span className="pricing-auth-notice-icon">🔐</span>
                <div>
                  <strong>Для оформления тарифа войдите</strong>
                  <p>Ваш текущий черновик сохранится, а оплата будет привязана к вашему аккаунту.</p>
                </div>
              </div>
            )}

            {/* Порядок секций зависит от initialView */}
            {isTopUpView ? (
              <>
                {/* TopUp ПЕРВЫМ */}
                {renderTopUp('⚡ Пополните баланс генераций', 'Докупите пакет к текущему тарифу — разово, без подписки')}
                
                {/* СТИЛЬНЫЙ РАЗДЕЛИТЕЛЬ */}
                <div className="pricing-sections-divider">
                  <span className="pricing-sections-divider-line"></span>
                  <span className="pricing-sections-divider-text">или измените тарифный план</span>
                  <span className="pricing-sections-divider-line"></span>
                </div>

                {/* Тарифы ниже — на случай если хочет сменить тариф */}
                {renderPlans()}
              </>
            ) : (
              <>
                {/* Тарифы ПЕРВЫМИ */}
                {renderPlans()}
                
                {/* СТИЛЬНЫЙ РАЗДЕЛИТЕЛЬ */}
                {hasPlan && (
                  <div className="pricing-sections-divider">
                    <span className="pricing-sections-divider-line"></span>
                    <span className="pricing-sections-divider-text">или просто докупите генерации</span>
                    <span className="pricing-sections-divider-line"></span>
                  </div>
                )}

                {/* TopUp — внизу, если есть тариф */}
                {hasPlan && renderTopUp('⚡ Нужно больше генераций?', 'Докупите пакет к текущему тарифу — разово, без подписки')}
              </>
            )}

            {subscription && subscription.plan !== 'none' && subscription.plan !== 'trial' && (
              <div className={`subscription-info-box ${subscription.autoRenew ? 'auto-renew-on' : 'auto-renew-off'}`}>
                <div className="subscription-status-row">
                  <div className="subscription-status-icon">{subscription.autoRenew ? '🔄' : '📅'}</div>
                  <div className="subscription-status-body">
                    <div className="subscription-status-title">
                      {subscription.autoRenew
                        ? 'Подписка активна · Автопродление включено'
                        : 'Подписка активна · Автопродление выключено'}
                    </div>
                    {expiryDate && (
                      <div className="subscription-status-sub">
                        Доступ действует до {expiryDate}
                      </div>
                    )}
                    <div className="subscription-status-hint">
                      {subscription.autoRenew
                        ? 'Вы можете отключить автопродление в любой момент. Доступ сохранится до конца оплаченного периода.'
                        : 'Следующего автоматического списания не будет. Когда период закончится, тариф можно будет оплатить снова.'}
                    </div>
                  </div>
                </div>
                {subscription.autoRenew && (
                  <button
                    className="cancel-auto-renew-btn"
                    onClick={onCancelAutoRenew}
                    disabled={canceling}
                  >
                    {canceling ? 'Отключаем...' : 'Отключить автопродление'}
                  </button>
                )}
              </div>
            )}

            {/* Footer */}
            <p className="pricing-footer">
              Оплачивая тариф, вы соглашаетесь с{' '}
              <a href="/offer" target="_blank" rel="noreferrer">условиями оферты</a>
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
