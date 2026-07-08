import React, { useState, useRef, useEffect } from 'react';
import { getPlanDetails, PLANS } from '../lib/subscriptionService';

export default function SubscriptionBadge({ subscription, onClick, onTopUp }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  if (!subscription) return null;

  const plan = getPlanDetails(subscription.plan);
  const credits = subscription.credits ?? 0;
  const totalCredits = PLANS[subscription.plan]?.credits || 0;
  const isEmpty = credits <= 0 && subscription.plan !== 'none';

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleBadgeClick = () => {
    if (subscription.plan === 'none') {
      // No plan — go straight to pricing
      onClick?.();
      return;
    }
    // Has a plan — toggle dropdown menu
    setMenuOpen((prev) => !prev);
  };

  return (
    <div className="sub-badge-wrapper" ref={menuRef}>
      <div
        className={`sub-badge sub-badge--${subscription.plan} ${isEmpty ? 'sub-badge--empty' : ''}`}
        onClick={handleBadgeClick}
        title={isEmpty ? 'Генерации закончились — пополните баланс' : 'Управление подпиской'}
      >
        {subscription.plan === 'none' ? (
          <>
            <span className="sub-badge-plan">Нет тарифа</span>
            <span className="sub-badge-credits">⚡ Выбрать</span>
          </>
        ) : (
          <>
            <span className="sub-badge-plan">{plan.emoji} {plan.label}</span>
            <div className={`sub-badge-credits ${isEmpty ? 'sub-badge-credits--empty' : ''}`}>
              {isEmpty ? '🔋' : '⚡'} {credits}
              {totalCredits > 0 && (
                <span className="sub-badge-total"> / {totalCredits}</span>
              )}
            </div>
            {isEmpty && (
              <span className="sub-badge-alert-dot" />
            )}
            <span className={`sub-badge-chevron ${menuOpen ? 'sub-badge-chevron--open' : ''}`}>▾</span>
          </>
        )}
      </div>

      {/* Dropdown Menu */}
      {menuOpen && (
        <div className="sub-badge-menu">
          <button
            className="sub-badge-menu-item"
            onClick={() => { setMenuOpen(false); onClick?.(); }}
          >
            <span className="sub-badge-menu-icon">📋</span>
            <span className="sub-badge-menu-text">Выбрать тариф</span>
          </button>
          <div className="sub-badge-menu-divider" />
          <button
            className={`sub-badge-menu-item ${isEmpty ? 'sub-badge-menu-item--highlight' : ''}`}
            onClick={() => { setMenuOpen(false); onTopUp?.(); }}
          >
            <span className="sub-badge-menu-icon">⚡</span>
            <span className="sub-badge-menu-text">Пополнить генерации</span>
            {isEmpty && <span className="sub-badge-menu-badge">нужно</span>}
          </button>
        </div>
      )}
    </div>
  );
}
