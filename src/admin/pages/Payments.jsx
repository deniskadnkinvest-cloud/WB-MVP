import React, { useState, useEffect } from 'react';
import { useAdmin } from '../AdminApp';

const PLAN_LABELS = { trial: '🎯 Тест-драйв', base: '⚡ Про', pro: '🚀 Бизнес' };
const PLAN_COLORS = { trial: '#f59e0b', base: '#3b82f6', pro: '#8b5cf6' };
const PLAN_PRICES = { trial: 500, base: 4990, pro: 15990 };

function Card({ children, style = {} }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '16px',
      padding: '16px',
      ...style,
    }}>
      {children}
    </div>
  );
}

function PaymentRow({ p }) {
  const date = p.date ? new Date(p.date) : null;
  const dateStr = date
    ? date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
    + ' ' + date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      padding: '11px 0',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      gap: '10px',
    }}>
      {/* Plan badge */}
      <div style={{
        width: '36px', height: '36px', borderRadius: '10px',
        background: `${PLAN_COLORS[p.planId]}22`,
        border: `1px solid ${PLAN_COLORS[p.planId]}44`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '15px', flexShrink: 0,
      }}>
        {p.planId === 'trial' ? '🎯' : p.planId === 'base' ? '⚡' : '🚀'}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff', marginBottom: '2px' }}>
          {PLAN_LABELS[p.planId] || p.planId}
        </div>
        <div style={{
          fontFamily: 'monospace', fontSize: '10px',
          color: 'rgba(255,255,255,0.35)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {p.uid}
        </div>
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '2px' }}>
          {dateStr} · {p.method === 'telegram_stars' ? '⭐ Stars' : p.method || 'Stars'}
        </div>
      </div>

      {/* Amount */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: '#4ade80' }}>
          +{(PLAN_PRICES[p.planId] || 0).toLocaleString('ru-RU')} ₽
        </div>
      </div>
    </div>
  );
}

export default function Payments() {
  const { authHeaders } = useAdmin();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterPlan, setFilterPlan] = useState('all');

  const [totals, setTotals] = useState({ total: 0, week: 0, today: 0 });

  const load = () => {
    setLoading(true);
    fetch('/api/admin/stats', {
      headers: { ...authHeaders },
    })
      .then(r => r.json())
      .then(res => {
        if (res.ok) {
          setPayments(res.data.recentPayments || []);
          setTotals({
            total: res.data.revenueTotal,
            week: res.data.revenueWeek,
            today: res.data.revenueToday,
          });
        } else {
          setError(res.error);
        }
      })
      .catch(() => setError('Ошибка загрузки'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = payments.filter(p =>
    filterPlan === 'all' || p.planId === filterPlan
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '8px' }}>

      {/* Revenue summary */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
        gap: '8px',
      }}>
        {[
          { label: 'Всего', value: totals.total, color: '#4ade80' },
          { label: 'Неделя', value: totals.week, color: '#a78bfa' },
          { label: 'Сегодня', value: totals.today, color: '#38bdf8' },
        ].map(item => (
          <div key={item.label} style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '12px', padding: '12px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              {item.label}
            </div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: item.color }}>
              {item.value.toLocaleString('ru-RU')} ₽
            </div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: '6px' }}>
        {[
          { id: 'all', label: 'Все' },
          { id: 'trial', label: '🎯 Тест' },
          { id: 'base', label: '⚡ Про' },
          { id: 'pro', label: '🚀 Бизнес' },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setFilterPlan(f.id)}
            style={{
              padding: '6px 12px', borderRadius: '8px', fontSize: '12px',
              fontWeight: filterPlan === f.id ? 600 : 400,
              background: filterPlan === f.id ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${filterPlan === f.id ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.08)'}`,
              color: filterPlan === f.id ? '#a78bfa' : 'rgba(255,255,255,0.5)',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {f.label}
          </button>
        ))}
        <button onClick={load} style={{
          marginLeft: 'auto', padding: '6px 10px', borderRadius: '8px', fontSize: '12px',
          background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
          color: 'rgba(255,255,255,0.4)', cursor: 'pointer',
        }}>↻</button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '40px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '50%',
            border: '3px solid rgba(139,92,246,0.2)',
            borderTop: '3px solid #8b5cf6',
            animation: 'spin 0.8s linear infinite',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : error ? (
        <Card style={{ textAlign: 'center' }}>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>{error}</p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: '32px 16px' }}>
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>Платежей нет</p>
        </Card>
      ) : (
        <Card style={{ padding: '0 16px' }}>
          <div style={{ padding: '10px 0 6px', fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>
            {filtered.length} платежей (последние 20)
          </div>
          {filtered.map((p, i) => <PaymentRow key={i} p={p} />)}
        </Card>
      )}
    </div>
  );
}
