import React, { useState, useEffect } from 'react';
import { useAdmin } from '../AdminApp';

const PLAN_LABELS = { trial: '🎯 Старт', base: '⚡ Про', pro: '🚀 Бизнес', none: '— Нет' };
const PLAN_COLORS = { trial: '#f59e0b', base: '#3b82f6', pro: '#8b5cf6', none: '#6b7280' };

function Card({ children, style = {} }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '16px',
      padding: '16px',
      backdropFilter: 'blur(40px)',
      ...style,
    }}>
      {children}
    </div>
  );
}

function StatChip({ label, value, sub, color = '#8b5cf6', large }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{ fontSize: large ? '28px' : '22px', fontWeight: 700, color, lineHeight: 1 }}>
        {value}
      </span>
      {sub && (
        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>{sub}</span>
      )}
    </div>
  );
}

function PlanBar({ planCounts }) {
  const total = Object.values(planCounts).reduce((s, v) => s + v, 0) || 1;
  const plans = ['pro', 'base', 'trial'];

  return (
    <div style={{ marginTop: '12px' }}>
      <div style={{ display: 'flex', height: '8px', borderRadius: '99px', overflow: 'hidden', gap: '2px', marginBottom: '10px' }}>
        {plans.map(p => {
          const w = (planCounts[p] / total) * 100;
          if (!w) return null;
          return (
            <div key={p} style={{
              width: `${w}%`, background: PLAN_COLORS[p], borderRadius: '99px',
              transition: 'width 0.6s ease',
            }} />
          );
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {[...plans, 'none'].map(p => (
          <div key={p} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: PLAN_COLORS[p] }} />
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
              {PLAN_LABELS[p]}: <b style={{ color: '#fff' }}>{planCounts[p] || 0}</b>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaymentRow({ payment, isTest }) {
  const date = new Date(payment.date);
  const timeStr = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
    + ' ' + date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 0',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      opacity: isTest ? 0.45 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '32px', height: '32px', borderRadius: '10px',
          background: `${PLAN_COLORS[payment.planId]}22`,
          border: `1px solid ${PLAN_COLORS[payment.planId]}44`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '14px',
        }}>
          {payment.planId === 'trial' ? '🎯' : payment.planId === 'base' ? '⚡' : '🚀'}
        </div>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
            {PLAN_LABELS[payment.planId] || payment.planId}
            {isTest && (
              <span style={{
                fontSize: '9px', padding: '1px 5px', borderRadius: '4px',
                background: 'rgba(245,158,11,0.2)', color: '#f59e0b',
                textTransform: 'uppercase', fontWeight: 700,
              }}>тест</span>
            )}
          </div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>
            {payment.uid?.slice(0, 12)}...
          </div>
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: isTest ? 'rgba(255,255,255,0.3)' : '#4ade80' }}>
          {payment.stars ? `${payment.stars} ⭐` : '—'}
        </div>
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>{timeStr}</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { authHeaders } = useAdmin();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [showTestPayments, setShowTestPayments] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    fetch('/api/admin/stats', {
      headers: { ...authHeaders },
    })
      .then(r => r.json())
      .then(res => {
        if (res.ok) {
          setData(res.data);
          setLastRefresh(new Date());
        } else {
          setError(res.error || 'Ошибка загрузки');
        }
      })
      .catch(() => setError('Нет соединения'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '60px' }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '50%',
          border: '3px solid rgba(139,92,246,0.2)',
          borderTop: '3px solid #8b5cf6',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <Card style={{ textAlign: 'center', padding: '32px 16px' }}>
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚠️</div>
        <p style={{ color: 'rgba(255,255,255,0.5)', margin: '0 0 16px', fontSize: '14px' }}>{error}</p>
        <button onClick={load} style={{
          padding: '8px 20px', borderRadius: '10px',
          background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.4)',
          color: '#8b5cf6', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
        }}>
          Повторить
        </button>
      </Card>
    );
  }

  const {
    planCounts = {}, totalUsers = 0, activeUsers = 0,
    starsTotal = 0, starsWeek = 0, starsToday = 0,
    realPaymentsCount = 0, testPaymentsCount = 0,
    recentPayments = [], recentTestPayments = [],
    generationsTotal = 0, generationsToday = 0, generationsFromCredits = 0,
    botActivations = 0, botActivationsToday = 0,
  } = data || {};

  const activeRate = totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0;
  const displayGenerations = generationsTotal || generationsFromCredits;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '8px' }}>

      {/* Refresh row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>
          {lastRefresh ? `Обновлено: ${lastRefresh.toLocaleTimeString('ru-RU')}` : ''}
        </span>
        <button onClick={load} style={{
          padding: '5px 12px', borderRadius: '8px',
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
          color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '12px',
        }}>
          ↻ Обновить
        </button>
      </div>

      {/* ── Генерации и Бот ── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(6,182,212,0.12), rgba(139,92,246,0.08))',
        border: '1px solid rgba(6,182,212,0.2)',
        borderRadius: '16px', padding: '16px',
      }}>
        <p style={{ margin: '0 0 12px', fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Генерации и активность
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
          <StatChip label="Генерации" value={displayGenerations} sub={generationsToday > 0 ? `+${generationsToday} сегодня` : null} color="#06b6d4" large />
          <StatChip label="Запусков бота" value={botActivations} sub={botActivationsToday > 0 ? `+${botActivationsToday} сегодня` : null} color="#a78bfa" />
          <StatChip label="Конверсия" value={totalUsers > 0 ? `${Math.round((activeUsers / totalUsers) * 100)}%` : '—'} sub="юзер → оплата" color="#4ade80" />
        </div>
      </div>

      {/* ── Выручка (только реальные Stars) ── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(74,222,128,0.1), rgba(56,189,248,0.08))',
        border: '1px solid rgba(74,222,128,0.2)',
        borderRadius: '16px', padding: '16px',
      }}>
        <p style={{ margin: '0 0 12px', fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Выручка (реальные платежи) — {realPaymentsCount} шт.
        </p>
        {realPaymentsCount === 0 ? (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px', margin: 0 }}>
            Реальных оплат пока нет. Все {testPaymentsCount} платежей — тестовые.
          </p>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <StatChip label="Всего Stars" value={`${starsTotal} ⭐`} color="#4ade80" large />
            <StatChip label="Эта неделя" value={`${starsWeek} ⭐`} color="#a78bfa" />
            <StatChip label="Сегодня" value={`${starsToday} ⭐`} color="#38bdf8" />
          </div>
        )}
      </div>

      {/* ── Пользователи + Планы ── */}
      <Card>
        <p style={{ margin: '0 0 12px', fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Пользователи
        </p>
        <div style={{ display: 'flex', gap: '24px' }}>
          <StatChip label="Всего" value={totalUsers} color="#fff" />
          <StatChip label="С подпиской" value={activeUsers} sub={`${activeRate}% конверсия`} color="#4ade80" />
        </div>
        <PlanBar planCounts={planCounts} />
      </Card>

      {/* ── Последние реальные платежи ── */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <p style={{ margin: 0, fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Реальные платежи
          </p>
          {testPaymentsCount > 0 && (
            <button
              onClick={() => setShowTestPayments(!showTestPayments)}
              style={{
                padding: '3px 8px', borderRadius: '6px', fontSize: '10px',
                background: showTestPayments ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: showTestPayments ? '#f59e0b' : 'rgba(255,255,255,0.4)',
                cursor: 'pointer',
              }}
            >
              {showTestPayments ? `Скрыть тестовые (${testPaymentsCount})` : `Показать тестовые (${testPaymentsCount})`}
            </button>
          )}
        </div>

        {recentPayments.length === 0 && !showTestPayments ? (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
            Реальных платежей пока нет
          </p>
        ) : (
          <>
            {recentPayments.slice(0, 10).map((p, i) => (
              <PaymentRow key={`real-${i}`} payment={p} isTest={false} />
            ))}
            {showTestPayments && recentTestPayments.length > 0 && (
              <>
                <div style={{
                  margin: '12px 0 8px', padding: '6px 10px', borderRadius: '8px',
                  background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)',
                  fontSize: '11px', color: '#f59e0b', textAlign: 'center',
                }}>
                  Тестовые платежи ({testPaymentsCount} шт.) — не учитываются в выручке
                </div>
                {recentTestPayments.slice(0, 10).map((p, i) => (
                  <PaymentRow key={`test-${i}`} payment={p} isTest={true} />
                ))}
              </>
            )}
          </>
        )}
      </Card>

      {/* ── Быстрые ссылки ── */}
      <Card>
        <p style={{ margin: '0 0 10px', fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Быстрые ссылки
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[
            { icon: '⚡', label: 'Vercel Function Logs', url: 'https://vercel.com/dashboard' },
            { icon: '🔥', label: 'Firebase Console', url: 'https://console.firebase.google.com' },
            { icon: '🔄', label: 'Inngest Dashboard', url: 'https://app.inngest.com' },
          ].map(link => (
            <a key={link.url} href={link.url} target="_blank" rel="noreferrer" style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '10px 12px', borderRadius: '10px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
              textDecoration: 'none', color: '#fff',
              fontSize: '13px', transition: 'background 0.2s',
            }}>
              <span>{link.icon}</span>
              <span style={{ flex: 1 }}>{link.label}</span>
              <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px' }}>↗</span>
            </a>
          ))}
        </div>
      </Card>
    </div>
  );
}
