import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PLANS } from '../lib/subscriptionService';
import './PricingModal.css';

export default function PricingModal({ isOpen, onClose, currentPlan, onSelectPlan, loading }) {
  const [selectedPlanId, setSelectedPlanId] = useState(null);

  if (!isOpen) return null;

  const plans = [PLANS.trial, PLANS.base, PLANS.pro];

  const handleSelect = (planId) => {
    setSelectedPlanId(planId);
    onSelectPlan(planId);
  };

  const formatPrice = (price, period) => {
    const formatted = price.toLocaleString('ru-RU');
    if (period === 'month') return `${formatted} ₽/мес`;
    return `${formatted} ₽`;
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
                    {isActive && <div className="pricing-badge pricing-badge--active">Текущий</div>}

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
                      <span className="pricing-credits-num">{plan.credits}</span> кадров
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
                      disabled={isActive || loading}
                    >
                      {loading && isSelected ? '⏳ Обработка...'
                        : isActive ? '✓ Активен'
                        : isBest ? '🚀 Подключить PRO'
                        : 'Выбрать'}
                    </button>
                  </motion.div>
                );
              })}
            </div>

            {/* Footer note */}
            <p className="pricing-footer">
              💡 Тестовый режим — оплата через Telegram Stars
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
