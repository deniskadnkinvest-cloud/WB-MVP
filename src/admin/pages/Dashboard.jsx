import React, { useState, useEffect } from 'react';
import { useAdmin } from '../AdminApp';

const PLAN_LABELS = { trial: '🎯 Тест-драйв', base: '⚡ Про', pro: '🚀 Бизнес', none: '— Нет' };
const PLAN_COLORS = { trial: '#f59e0b', base: '#3b82f6', pro: '#8b5cf6', none: '#6b7280' };
const PLAN_PRICES = { trial: 500, base: 4990, pro: 15990 };

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
    <div style={{
      display: 'flex', flexDirection: 'column', gap: '4px',
    }}>
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
      {/* Bar */}
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
      {/* Legend */}
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

function PaymentRow({ payment }) {
  const date = new Date(payment.date);
  const timeStr = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
    + ' ' + date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 0',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
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
          <div style={{ fontSize: '13px', fontWeight: 600 }}>
            {PLAN_LABELS[payment.planId] || payment.planId}
          </div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>
            {payment.uid?.slice(0, 10)}...
          </div>
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#4ade80' }}>
          +{PLAN_PRICES[payment.planId]?.toLocaleString('ru-RU') || '?'} ₽
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

  const { planCounts = {}, totalUsers = 0, activeUsers = 0,
    revenueTotal = 0, revenueWeek = 0, revenueToday = 0,
    recentPayments = [] } = data || {};

  const activeRate = totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0;

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

      {/* ── Revenue Strip ── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(6,182,212,0.1))',
        border: '1px solid rgba(139,92,246,0.25)',
        borderRadius: '16px', padding: '16px',
      }}>
        <p style={{ margin: '0 0 12px', fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Выручка
        </p>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <StatChip label="За всё время" value={`${revenueTotal.toLocaleString('ru-RU')} ₽`} color="#4ade80" large />
          <StatChip label="Эта неделя" value={`${revenueWeek.toLocaleString('ru-RU')} ₽`} color="#a78bfa" />
          <StatChip label="Сегодня" value={`${revenueToday.toLocaleString('ru-RU')} ₽`} color="#38bdf8" />
        </div>
      </div>

      {/* ── Users + Plans ── */}
      <Card>
        <p style={{ margin: '0 0 12px', fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Пользователи
        </p>
        <div style={{ display: 'flex', gap: '24px' }}>
          <StatChip label="Всего" value={totalUsers} color="#fff" />
          <StatChip label="Активных" value={activeUsers} sub={`${activeRate}% конверсия`} color="#4ade80" />
        </div>
        <PlanBar planCounts={planCounts} />
      </Card>

      {/* ── Recent Payments ── */}
      <Card>
        <p style={{ margin: '0 0 4px', fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Последние платежи
        </p>
        {recentPayments.length === 0 ? (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
            Платежей пока нет
          </p>
        ) : (
          recentPayments.slice(0, 10).map((p, i) => (
            <PaymentRow key={i} payment={p} />
          ))
        )}
      </Card>

      {/* ── Quick Links ── */}
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
