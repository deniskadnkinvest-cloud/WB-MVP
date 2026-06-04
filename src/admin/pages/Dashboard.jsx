import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAdmin } from '../AdminApp';

const PLAN_LABELS = { trial: 'Старт', base: 'Про', pro: 'Бизнес', none: 'Нет' };
const PLAN_COLORS = { trial: '#f59e0b', base: '#3b82f6', pro: '#8b5cf6', none: '#6b7280' };

// ── Motion Variants ──
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 350, damping: 25 } }
};

// ── Components ──
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

function StatChip({ label, value, sub, color = '#8b5cf6', large, glow }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', position: 'relative' }}>
      <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
        {label}
      </span>
      <span style={{ 
        fontSize: large ? '36px' : '24px', 
        fontWeight: 800, 
        color, 
        lineHeight: 1,
        letterSpacing: '-1px',
        textShadow: glow ? `0 0 20px ${color}80` : 'none',
        fontFamily: "'Inter', sans-serif"
      }}>
        {value}
      </span>
      {sub && (
        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}>{sub}</span>
      )}
    </div>
  );
}

function PlanBar({ planCounts }) {
  const total = Object.values(planCounts).reduce((s, v) => s + v, 0) || 1;
  const plans = ['pro', 'base', 'trial'];

  return (
    <div style={{ marginTop: '20px' }}>
      <div style={{ display: 'flex', height: '10px', borderRadius: '99px', overflow: 'hidden', gap: '3px', marginBottom: '14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
        {plans.map(p => {
          const w = (planCounts[p] / total) * 100;
          if (!w) return null;
          return (
            <motion.div 
              key={p} 
              initial={{ width: 0 }}
              animate={{ width: `${w}%` }}
              transition={{ duration: 1, type: 'spring', bounce: 0.2 }}
              style={{ background: PLAN_COLORS[p], borderRadius: '99px', boxShadow: `0 0 10px ${PLAN_COLORS[p]}80` }} 
            />
          );
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
        {[...plans, 'none'].map(p => (
          <div key={p} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.03)', padding: '4px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: PLAN_COLORS[p], boxShadow: `0 0 8px ${PLAN_COLORS[p]}` }} />
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', fontWeight: 600, textTransform: 'uppercase' }}>
              {PLAN_LABELS[p]} <span style={{ color: '#fff', marginLeft: '4px' }}>{planCounts[p] || 0}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaymentRow({ payment, isTest, delayIndex = 0 }) {
  const date = new Date(payment.date);
  const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) 
    + ' · ' + date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });

  return (
    <motion.div 
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: isTest ? 0.45 : 1, x: 0 }}
      transition={{ delay: delayIndex * 0.05, type: 'spring' }}
      whileHover={{ scale: 1.01, backgroundColor: 'rgba(255,255,255,0.02)' }}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.03)',
        borderRadius: '8px',
        cursor: 'default',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '12px',
          background: `linear-gradient(135deg, ${PLAN_COLORS[payment.planId]}22, rgba(255,255,255,0.01))`,
          border: `1px solid ${PLAN_COLORS[payment.planId]}44`,
          boxShadow: `inset 0 0 10px ${PLAN_COLORS[payment.planId]}11`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '16px',
        }}>
          {payment.planId === 'trial' ? '🎯' : payment.planId === 'base' ? '⚡' : '🚀'}
        </div>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', color: '#fff' }}>
            {PLAN_LABELS[payment.planId] || payment.planId}
            {isTest && (
              <span style={{
                fontSize: '9px', padding: '2px 6px', borderRadius: '4px',
                background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b',
                textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.5px'
              }}>тест</span>
            )}
          </div>
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', marginTop: '2px' }}>
            {payment.uid?.slice(0, 16)}...
          </div>
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '15px', fontWeight: 800, color: isTest ? 'rgba(255,255,255,0.3)' : '#4ade80' }}>
          {payment.stars ? `+${payment.stars} ⭐` : '—'}
        </div>
        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', fontWeight: 500, marginTop: '2px' }}>{timeStr}</div>
      </div>
    </motion.div>
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
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
          style={{
            width: '40px', height: '40px', borderRadius: '50%',
            border: '3px solid rgba(139,92,246,0.1)',
            borderTop: '3px solid #06b6d4',
            borderRight: '3px solid #8b5cf6',
          }} 
        />
      </div>
    );
  }

  if (error) {
    return (
      <Card style={{ textAlign: 'center', padding: '40px 20px', borderColor: 'rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.05)' }}>
        <div style={{ fontSize: '40px', marginBottom: '16px', filter: 'drop-shadow(0 0 10px rgba(239,68,68,0.5))' }}>🚨</div>
        <p style={{ color: 'rgba(255,255,255,0.6)', margin: '0 0 24px', fontSize: '14px', fontWeight: 500 }}>{error}</p>
        <motion.button 
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={load} 
          style={{
            padding: '10px 24px', borderRadius: '12px',
            background: 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(239,68,68,0.05))',
            border: '1px solid rgba(239,68,68,0.4)',
            color: '#f87171', cursor: 'pointer', fontSize: '13px', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '1px'
          }}
        >
          Повторить
        </motion.button>
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
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="show"
      style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '20px' }}
    >
      {/* ── Refresh Row ── */}
      <motion.div variants={itemVariants} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: 500, fontFamily: 'monospace' }}>
          {lastRefresh ? `SYNCED: ${lastRefresh.toLocaleTimeString('en-US', { hour12: false })}` : ''}
        </span>
        <motion.button 
          whileHover={{ scale: 1.05, backgroundColor: 'rgba(255,255,255,0.08)' }}
          whileTap={{ scale: 0.95 }}
          onClick={load} 
          style={{
            padding: '6px 14px', borderRadius: '10px',
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '11px',
            fontWeight: 600, display: 'flex', gap: '6px', alignItems: 'center'
          }}
        >
          <span style={{ fontSize: '14px' }}>↻</span> Refresh
        </motion.button>
      </motion.div>

      {/* ── Neural Pulse: Generations & Bot ── */}
      <Card style={{
        background: 'linear-gradient(135deg, rgba(6,182,212,0.15), rgba(139,92,246,0.1))',
        borderColor: 'rgba(6,182,212,0.3)',
        boxShadow: '0 10px 40px rgba(6,182,212,0.15), inset 0 1px 0 rgba(255,255,255,0.1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#06b6d4', boxShadow: '0 0 10px #06b6d4' }} />
          <p style={{ margin: 0, fontSize: '11px', color: '#fff', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 700 }}>
            Neural Pulse
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
          <StatChip label="Генерации" value={displayGenerations} sub={generationsToday > 0 ? `+${generationsToday} сегодня` : null} color="#22d3ee" large glow />
          <StatChip label="Активации бота" value={botActivations} sub={botActivationsToday > 0 ? `+${botActivationsToday} сегодня` : null} color="#c084fc" glow />
          <StatChip label="Конверсия" value={totalUsers > 0 ? `${activeRate}%` : '—'} sub="юзер → оплата" color="#4ade80" />
        </div>
      </Card>

      {/* ── Revenue ── */}
      <Card style={{
        background: 'linear-gradient(135deg, rgba(74,222,128,0.12), rgba(56,189,248,0.08))',
        borderColor: 'rgba(74,222,128,0.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 10px #4ade80' }} />
          <p style={{ margin: 0, fontSize: '11px', color: '#fff', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 700 }}>
            Revenue Stream
          </p>
        </div>
        {realPaymentsCount === 0 ? (
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', margin: 0, fontStyle: 'italic' }}>
            Ожидание реальных транзакций. Тестовые платежи: {testPaymentsCount}.
          </p>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <StatChip label="Всего Stars" value={`${starsTotal}`} sub="⭐ lifetime" color="#4ade80" large glow />
            <StatChip label="Неделя" value={`${starsWeek}`} sub="⭐" color="#a78bfa" glow />
            <StatChip label="Сегодня" value={`${starsToday}`} sub="⭐" color="#38bdf8" glow />
          </div>
        )}
      </Card>

      {/* ── Users & Plans ── */}
      <Card>
        <p style={{ margin: '0 0 16px', fontSize: '11px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600 }}>
          User Base
        </p>
        <div style={{ display: 'flex', gap: '32px' }}>
          <StatChip label="Всего" value={totalUsers} color="#fff" />
          <StatChip label="С подпиской" value={activeUsers} color="#4ade80" />
        </div>
        <PlanBar planCounts={planCounts} />
      </Card>

      {/* ── Transactions ── */}
      <Card style={{ padding: '20px 10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', padding: '0 10px' }}>
          <p style={{ margin: 0, fontSize: '11px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600 }}>
            Recent Transactions
          </p>
          {testPaymentsCount > 0 && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowTestPayments(!showTestPayments)}
              style={{
                padding: '4px 10px', borderRadius: '8px', fontSize: '10px', fontWeight: 700,
                background: showTestPayments ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${showTestPayments ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.1)'}`,
                color: showTestPayments ? '#fbbf24' : 'rgba(255,255,255,0.5)',
                cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.5px'
              }}
            >
              {showTestPayments ? `Скрыть тест (${testPaymentsCount})` : `Показать тест (${testPaymentsCount})`}
            </motion.button>
          )}
        </div>

        {recentPayments.length === 0 && !showTestPayments ? (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px', textAlign: 'center', padding: '30px 0' }}>
            Нет реальных транзакций
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {recentPayments.slice(0, 10).map((p, i) => (
              <PaymentRow key={`real-${i}`} payment={p} isTest={false} delayIndex={i} />
            ))}
            {showTestPayments && recentTestPayments.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                style={{ overflow: 'hidden' }}
              >
                <div style={{
                  margin: '16px 10px 8px', padding: '8px 12px', borderRadius: '8px',
                  background: 'rgba(245,158,11,0.05)', border: '1px dashed rgba(245,158,11,0.2)',
                  fontSize: '11px', color: '#fbbf24', textAlign: 'center', fontWeight: 600,
                  letterSpacing: '0.5px'
                }}>
                  ТЕСТОВЫЕ ТРАНЗАКЦИИ
                </div>
                {recentTestPayments.slice(0, 10).map((p, i) => (
                  <PaymentRow key={`test-${i}`} payment={p} isTest={true} delayIndex={i} />
                ))}
              </motion.div>
            )}
          </div>
        )}
      </Card>

      {/* ── Quick Links ── */}
      <Card>
        <p style={{ margin: '0 0 16px', fontSize: '11px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600 }}>
          System Links
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[
            { icon: '⚡', label: 'Vercel Edge Network', url: 'https://vercel.com/dashboard' },
            { icon: '🔥', label: 'Firebase Realtime DB', url: 'https://console.firebase.google.com' },
            { icon: '🔄', label: 'Inngest Queues', url: 'https://app.inngest.com' },
          ].map((link, i) => (
            <motion.a 
              key={link.url}
              whileHover={{ scale: 1.02, x: 5, backgroundColor: 'rgba(255,255,255,0.06)' }}
              whileTap={{ scale: 0.98 }}
              href={link.url} target="_blank" rel="noreferrer" 
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '12px 16px', borderRadius: '12px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.05)',
                textDecoration: 'none', color: '#fff',
                fontSize: '13px', fontWeight: 500,
              }}
            >
              <span style={{ fontSize: '16px' }}>{link.icon}</span>
              <span style={{ flex: 1 }}>{link.label}</span>
              <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '14px' }}>↗</span>
            </motion.a>
          ))}
        </div>
      </Card>
    </motion.div>
  );
}
