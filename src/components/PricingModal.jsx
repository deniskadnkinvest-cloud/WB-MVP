import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PLANS } from '../lib/subscriptionService';
import './PricingModal.css';

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
}) {
  const [selectedPlanId, setSelectedPlanId] = useState(null);

  if (!isOpen) return null;

  const plans = [PLANS.trial, PLANS.base, PLANS.pro];
  const expiryDate = formatExpiryDate(subscription?.planExpiresAt);

  const handleSelect = (planId) => {
    setSelectedPlanId(planId);
    onSelectPlan(planId);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="pricing-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
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
              <h2 className="pricing-title">Выберите тариф</h2>
              <p className="pricing-subtitle">Качество маркетплейса — скорость AI</p>
              <button className="pricing-close" onClick={onClose}>✕</button>
            </div>

            {/* Plans Grid */}
            <div className="pricing-grid">
              {plans.map((plan, i) => {
                const isActive = currentPlan === plan.id;
                const isSelected = selectedPlanId === plan.id;
                const isBest = plan.bestSeller;

                return (
                  <motion.div
                    key={plan.id}
                    className={`pricing-card ${isBest ? 'pricing-card--best' : ''} ${isActive ? 'pricing-card--active' : ''} ${isSelected ? 'pricing-card--selected' : ''}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1, duration: 0.4 }}
                  >
                    {isBest && <div className="pricing-badge">⭐ Best Seller</div>}
                    {isActive && <div className="pricing-badge pricing-badge--active">✓ Активен</div>}

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
                      {plan.id === 'pro' ? (
                        <span className="pricing-credits-num">Безлимит</span>
                      ) : (
                        <>
                          <span className="pricing-credits-num">{plan.credits}</span> кадров
                        </>
                      )}
                    </div>

                    <ul className="pricing-features">
                      <li className="pricing-feature pricing-feature--yes">
                        ✅ Все промпты и фоны
                      </li>
                      <li className={`pricing-feature ${plan.canSaveModels ? 'pricing-feature--yes' : 'pricing-feature--no'}`}>
                        {plan.canSaveModels ? '✅' : '🔒'} Сохранение модели (Identity)
                      </li>
                      <li className={`pricing-feature ${plan.canSaveLocations ? 'pricing-feature--yes' : 'pricing-feature--no'}`}>
                        {plan.canSaveLocations ? '✅' : '🔒'} Свои локации
                      </li>
                      <li className={`pricing-feature ${plan.canPhotoshoot ? 'pricing-feature--yes' : 'pricing-feature--no'}`}>
                        {plan.canPhotoshoot ? '✅' : '🔒'} Пакетная генерация (5 кадров)
                      </li>
                      <li className={`pricing-feature ${plan.canUseCustomPrompts ? 'pricing-feature--yes' : 'pricing-feature--no'}`}>
                        {plan.canUseCustomPrompts ? '✅' : '🔒'} Свой текст модели
                      </li>
                    </ul>

                    <button
                      className={`pricing-btn ${isBest ? 'pricing-btn--best' : ''} ${isActive ? 'pricing-btn--active' : ''}`}
                      onClick={() => handleSelect(plan.id)}
                      disabled={isActive || (loading && isSelected)}
                    >
                      {loading && isSelected ? '⏳ Активация...'
                        : isActive ? '✓ Активен'
                        : isBest ? `🚀 Подключить ${plan.label.toUpperCase()} — ${plan.price.toLocaleString('ru-RU')} ₽`
                        : `Подключить ${plan.label} — ${plan.price.toLocaleString('ru-RU')} ₽`}
                    </button>

                    {/* Обязательное уведомление ЮКасса: возможность отмены */}
                    {plan.period === 'month' && !isActive && (
                      <p className="pricing-cancel-hint">
                        <span>🛡️</span> Отмена подписки в 1 клик в любое время
                      </p>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* Управление текущей подпиской */}
            {subscription && subscription.plan !== 'none' && subscription.plan !== 'trial' && (
              <div className={`subscription-info-box ${subscription.autoRenew ? 'auto-renew-on' : 'auto-renew-off'}`}>
                <div className="subscription-status-row">
                  <div className="subscription-status-icon">
                    {subscription.autoRenew ? '🔄' : '🛡️'}
                  </div>
                  <div className="subscription-status-body">
                    <div className="subscription-status-title">
                      {subscription.autoRenew ? 'Подписка активна · Автопродление включено' : 'Подписка активна · Автопродление выключено'}
                    </div>
                    {expiryDate && (
                      <div className="subscription-status-sub">
                        {subscription.autoRenew ? 'Следующий платеж' : 'Доступ открыт'} до {expiryDate}
                      </div>
                    )}
                    <div className="subscription-status-hint">
                      {subscription.autoRenew 
                        ? 'Вы можете отменить подписку в любой момент. Доступ сохранится до конца оплаченного периода, а карта будет мгновенно отвязана.'
                        : 'Карта успешно отвязана. Автоматических списаний больше не будет. Доступ автоматически закроется по истечении срока.'
                      }
                    </div>
                  </div>
                </div>
                {subscription.autoRenew && (
                  <button
                    className="cancel-auto-renew-btn"
                    onClick={onCancelAutoRenew}
                    disabled={canceling}
                  >
                    {canceling ? '⏳ Отменяем подписку...' : '✕ Отписаться и отвязать карту'}
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

