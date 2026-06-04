import React, { useState, useEffect } from 'react';
import { useAdmin } from '../AdminApp';

const PLAN_LABELS = { trial: '🎯 Старт', base: '⚡ Про', pro: '🚀 Бизнес' };
const PLAN_COLORS = { trial: '#f59e0b', base: '#3b82f6', pro: '#8b5cf6' };

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

  const isTest = p.isTest === true;
  const planColor = PLAN_COLORS[p.planId] || '#6b7280';

  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      padding: '11px 0',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      gap: '10px',
      opacity: isTest ? 0.5 : 1,
    }}>
      {/* Plan badge */}
      <div style={{
        width: '36px', height: '36px', borderRadius: '10px',
        background: `${planColor}22`,
        border: `1px solid ${planColor}44`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '15px', flexShrink: 0,
      }}>
        {p.planId === 'trial' ? '🎯' : p.planId === 'base' ? '⚡' : '🚀'}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {PLAN_LABELS[p.planId] || p.planId}
          {isTest && (
            <span style={{
              fontSize: '9px', padding: '1px 5px', borderRadius: '4px',
              background: 'rgba(245,158,11,0.2)', color: '#f59e0b',
              textTransform: 'uppercase', fontWeight: 700,
            }}>тест</span>
          )}
        </div>
        <div style={{
          fontFamily: 'monospace', fontSize: '10px',
          color: 'rgba(255,255,255,0.35)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {p.uid}
        </div>
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '2px' }}>
          {dateStr} · {p.method === 'telegram_stars' ? '⭐ Stars' : p.method === 'yookassa' ? '💳 ЮKassa' : p.method || '⭐ Stars'}
        </div>
      </div>

      {/* Amount — реальные Stars */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: isTest ? 'rgba(255,255,255,0.3)' : '#4ade80' }}>
          {p.stars ? `${p.stars} ⭐` : '—'}
        </div>
        {p.currency && p.currency !== 'XTR' && (
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>
            {p.currency}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Payments() {
  const { authHeaders } = useAdmin();
  const [realPayments, setRealPayments] = useState([]);
  const [testPayments, setTestPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterPlan, setFilterPlan] = useState('all');
  const [showMode, setShowMode] = useState('real'); // 'real' | 'test' | 'all'

  const [totals, setTotals] = useState({ total: 0, week: 0, today: 0 });

  const load = () => {
    setLoading(true);
    fetch('/api/admin/stats', {
      headers: { ...authHeaders },
    })
      .then(r => r.json())
      .then(res => {
        if (res.ok) {
          setRealPayments(res.data.recentPayments || []);
          setTestPayments(res.data.recentTestPayments || []);
          setTotals({
            total: res.data.starsTotal || 0,
            week: res.data.starsWeek || 0,
            today: res.data.starsToday || 0,
          });
        } else {
          setError(res.error);
        }
      })
      .catch(() => setError('Ошибка загрузки'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Собираем платежи по режиму отображения
  let displayPayments = [];
  if (showMode === 'real') displayPayments = realPayments;
  else if (showMode === 'test') displayPayments = testPayments;
  else displayPayments = [...realPayments, ...testPayments].sort((a, b) => new Date(b.date) - new Date(a.date));

  const filtered = displayPayments.filter(p =>
    filterPlan === 'all' || p.planId === filterPlan
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '8px' }}>

      {/* Revenue summary — только реальные Stars */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
        {[
          { label: 'Всего Stars', value: totals.total, color: '#4ade80' },
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
              {item.value} ⭐
            </div>
          </div>
        ))}
      </div>

      {/* Mode: Real / Test / All */}
      <div style={{ display: 'flex', gap: '6px' }}>
        {[
          { id: 'real', label: `Реальные (${realPayments.length})` },
          { id: 'test', label: `Тестовые (${testPayments.length})` },
          { id: 'all', label: 'Все' },
        ].map(m => (
          <button
            key={m.id}
            onClick={() => setShowMode(m.id)}
            style={{
              padding: '6px 12px', borderRadius: '8px', fontSize: '11px',
              fontWeight: showMode === m.id ? 600 : 400,
              background: showMode === m.id
                ? (m.id === 'test' ? 'rgba(245,158,11,0.15)' : 'rgba(139,92,246,0.2)')
                : 'rgba(255,255,255,0.04)',
              border: `1px solid ${showMode === m.id
                ? (m.id === 'test' ? 'rgba(245,158,11,0.4)' : 'rgba(139,92,246,0.5)')
                : 'rgba(255,255,255,0.08)'}`,
              color: showMode === m.id
                ? (m.id === 'test' ? '#f59e0b' : '#a78bfa')
                : 'rgba(255,255,255,0.5)',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {m.label}
          </button>
        ))}
        <button onClick={load} style={{
          marginLeft: 'auto', padding: '6px 10px', borderRadius: '8px', fontSize: '12px',
          background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
          color: 'rgba(255,255,255,0.4)', cursor: 'pointer',
        }}>↻</button>
      </div>

      {/* Filter by plan */}
      <div style={{ display: 'flex', gap: '6px' }}>
        {[
          { id: 'all', label: 'Все тарифы' },
          { id: 'trial', label: '🎯 Старт' },
          { id: 'base', label: '⚡ Про' },
          { id: 'pro', label: '🚀 Бизнес' },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setFilterPlan(f.id)}
            style={{
              padding: '5px 10px', borderRadius: '8px', fontSize: '11px',
              fontWeight: filterPlan === f.id ? 600 : 400,
              background: filterPlan === f.id ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${filterPlan === f.id ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.06)'}`,
              color: filterPlan === f.id ? '#818cf8' : 'rgba(255,255,255,0.4)',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {f.label}
          </button>
        ))}
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
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>
            {showMode === 'real' ? 'Реальных платежей пока нет' : showMode === 'test' ? 'Тестовых платежей нет' : 'Платежей нет'}
          </p>
        </Card>
      ) : (
        <Card style={{ padding: '0 16px' }}>
          <div style={{ padding: '10px 0 6px', fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>
            {filtered.length} {showMode === 'test' ? 'тестовых' : showMode === 'real' ? 'реальных' : ''} платежей
          </div>
          {filtered.map((p, i) => <PaymentRow key={i} p={p} />)}
        </Card>
      )}
    </div>
  );
}
