import React from 'react';
import { getPlanDetails } from '../lib/subscriptionService';

export default function SubscriptionBadge({ subscription, onClick }) {
  if (!subscription) return null;

  const plan = getPlanDetails(subscription.plan);
  const hasCredits = subscription.credits > 0;

  return (
    <div
      className={`sub-badge sub-badge--${subscription.plan}`}
      onClick={onClick}
      title="Управление подпиской"
    >
      {subscription.plan === 'none' ? (
        <>
          <span className="sub-badge-plan">Нет тарифа</span>
          <span className="sub-badge-credits">⚡ Выбрать</span>
        </>
      ) : (
        <>
          <span className="sub-badge-plan">{plan.emoji} {plan.label}</span>
          <span className="sub-badge-credits">
            {subscription.plan === 'pro' ? (
              '⚡ Безлимит'
            ) : (
              `⚡ ${subscription.credits}/${subscription.creditsTotal}`
            )}
          </span>
        </>
      )}
    </div>
  );
}
