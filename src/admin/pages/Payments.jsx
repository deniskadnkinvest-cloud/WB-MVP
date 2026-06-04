import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAdmin } from '../AdminApp';

const PLAN_LABELS = { trial: 'Старт', base: 'Про', pro: 'Бизнес' };
const PLAN_COLORS = { trial: '#f59e0b', base: '#3b82f6', pro: '#8b5cf6' };

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 10, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 400, damping: 25 } }
};

function Card({ children, style = {} }) {
  return (
    <motion.div 
      variants={itemVariants}
      style={{
        background: 'linear-gradient(145deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '24px',
        padding: '20px',
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2), inset 0 1px 1px rgba(255,255,255,0.05)',
        ...style,
      }}
    >
      {children}
    </motion.div>
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
    <motion.div 
      variants={itemVariants}
      whileHover={{ scale: 1.01, backgroundColor: 'rgba(255,255,255,0.03)' }}
      style={{
        display: 'flex', alignItems: 'center',
        padding: '14px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        gap: '12px',
        opacity: isTest ? 0.6 : 1,
        cursor: 'default',
        borderRadius: '12px',
      }}>
      {/* Plan badge */}
      <div style={{
        width: '40px', height: '40px', borderRadius: '14px',
        background: `linear-gradient(135deg, ${planColor}22, rgba(255,255,255,0.01))`,
        border: `1px solid ${planColor}44`,
        boxShadow: `inset 0 0 10px ${planColor}11`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '18px', flexShrink: 0,
      }}>
        {p.planId === 'trial' ? '🎯' : p.planId === 'base' ? '⚡' : '🚀'}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {PLAN_LABELS[p.planId] || p.planId}
          {isTest && (
            <span style={{
              fontSize: '9px', padding: '2px 6px', borderRadius: '6px',
              background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#fbbf24',
              textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.5px'
            }}>тест</span>
          )}
        </div>
        <div style={{
          fontFamily: 'monospace', fontSize: '11px', fontWeight: 500,
          color: 'rgba(255,255,255,0.4)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {p.uid}
        </div>
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '4px', fontWeight: 500 }}>
          {dateStr} · {p.method === 'telegram_stars' ? '⭐ Stars' : p.method === 'yookassa' ? '💳 ЮKassa' : p.method || '⭐ Stars'}
        </div>
      </div>

      {/* Amount — реальные Stars */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: '16px', fontWeight: 800, color: isTest ? 'rgba(255,255,255,0.3)' : '#4ade80' }}>
          {p.stars ? `+${p.stars} ⭐` : '—'}
        </div>
        {p.currency && p.currency !== 'XTR' && (
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginTop: '4px', fontWeight: 600 }}>
            {p.currency}
          </div>
        )}
      </div>
    </motion.div>
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
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="show"
      style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '20px' }}
    >
      {/* ── Revenue Summary ── */}
      <motion.div variants={itemVariants} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
        {[
          { label: 'Всего Stars', value: totals.total, color: '#4ade80' },
          { label: 'Неделя', value: totals.week, color: '#a78bfa' },
          { label: 'Сегодня', value: totals.today, color: '#38bdf8' },
        ].map(item => (
          <div key={item.label} style={{
            background: 'linear-gradient(145deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '20px', padding: '16px 12px',
            textAlign: 'center',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            backdropFilter: 'blur(20px)'
          }}>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>
              {item.label}
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: item.color, textShadow: `0 0 15px ${item.color}66` }}>
              {item.value} ⭐
            </div>
          </div>
        ))}
      </motion.div>

      {/* ── Mode & Filter ── */}
      <motion.div variants={itemVariants} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', scrollbarWidth: 'none' }}>
          {[
            { id: 'real', label: `Реальные (${realPayments.length})` },
            { id: 'test', label: `Тестовые (${testPayments.length})` },
            { id: 'all', label: 'Все' },
          ].map(m => (
            <motion.button
              key={m.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowMode(m.id)}
              style={{
                padding: '8px 16px', borderRadius: '12px', fontSize: '12px',
                fontWeight: showMode === m.id ? 700 : 500,
                background: showMode === m.id
                  ? (m.id === 'test' ? 'rgba(245,158,11,0.15)' : 'rgba(139,92,246,0.2)')
                  : 'rgba(255,255,255,0.03)',
                border: `1px solid ${showMode === m.id
                  ? (m.id === 'test' ? 'rgba(245,158,11,0.4)' : 'rgba(139,92,246,0.5)')
                  : 'rgba(255,255,255,0.08)'}`,
                color: showMode === m.id
                  ? (m.id === 'test' ? '#fbbf24' : '#d8b4fe')
                  : 'rgba(255,255,255,0.5)',
                cursor: 'pointer', transition: 'background 0.2s, border 0.2s',
                whiteSpace: 'nowrap'
              }}
            >
              {m.label}
            </motion.button>
          ))}
          <motion.button 
            whileTap={{ scale: 0.95 }}
            onClick={load} style={{
            marginLeft: 'auto', padding: '8px 12px', borderRadius: '12px', fontSize: '14px',
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.5)', cursor: 'pointer',
          }}>↻</motion.button>
        </div>

        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', scrollbarWidth: 'none' }}>
          {[
            { id: 'all', label: 'Все тарифы' },
            { id: 'trial', label: '🎯 Старт' },
            { id: 'base', label: '⚡ Про' },
            { id: 'pro', label: '🚀 Бизнес' },
          ].map(f => (
            <motion.button
              key={f.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => setFilterPlan(f.id)}
              style={{
                padding: '6px 14px', borderRadius: '10px', fontSize: '11px',
                fontWeight: filterPlan === f.id ? 700 : 500,
                background: filterPlan === f.id ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${filterPlan === f.id ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.05)'}`,
                color: filterPlan === f.id ? '#818cf8' : 'rgba(255,255,255,0.4)',
                cursor: 'pointer', transition: 'all 0.2s',
                whiteSpace: 'nowrap'
              }}
            >
              {f.label}
            </motion.button>
          ))}
        </div>
      </motion.div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '40vh' }}>
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
            style={{
              width: '40px', height: '40px', borderRadius: '50%',
              border: '3px solid rgba(139,92,246,0.1)',
              borderTop: '3px solid #8b5cf6',
            }} 
          />
        </div>
      ) : error ? (
        <Card style={{ textAlign: 'center' }}>
          <p style={{ color: 'rgba(239,68,68,0.8)', fontSize: '13px', fontWeight: 600 }}>{error}</p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: '40px 16px' }}>
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px', fontWeight: 500, letterSpacing: '0.5px' }}>
            {showMode === 'real' ? 'Реальных платежей пока нет' : showMode === 'test' ? 'Тестовых платежей нет' : 'Платежей нет'}
          </p>
        </Card>
      ) : (
        <Card style={{ padding: '8px 16px' }}>
          <div style={{ padding: '12px 0 8px', fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>
            {filtered.length} {showMode === 'test' ? 'тестовых' : showMode === 'real' ? 'реальных' : ''} транзакций
          </div>
          <motion.div variants={containerVariants} initial="hidden" animate="show">
            <AnimatePresence>
              {filtered.map((p, i) => <PaymentRow key={p.id || i} p={p} />)}
            </AnimatePresence>
          </motion.div>
        </Card>
      )}
    </motion.div>
  );
}
