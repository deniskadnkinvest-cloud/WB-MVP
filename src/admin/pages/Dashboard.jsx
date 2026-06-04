import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAdmin } from '../AdminApp';

// ── Design tokens ──
const c = {
  surface: 'rgba(255,255,255,0.03)',
  border: 'rgba(255,255,255,0.06)',
  text1: '#e8e8ed',
  text2: 'rgba(255,255,255,0.5)',
  text3: 'rgba(255,255,255,0.25)',
  accent: '#818cf8',
  green: '#34d399',
  amber: '#fbbf24',
  red: '#f87171',
};

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] } },
};

function Metric({ label, value, sub, accent = false }) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: c.text3, letterSpacing: '0.8px', textTransform: 'uppercase', fontWeight: 600, marginBottom: '6px' }}>
        {label}
      </div>
      <div style={{ 
        fontSize: '28px', fontWeight: 700, letterSpacing: '-1.5px', lineHeight: 1,
        color: accent ? c.accent : c.text1,
        fontFeatureSettings: "'tnum'",
      }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: '11px', color: c.text3, marginTop: '4px', fontWeight: 500 }}>{sub}</div>}
    </div>
  );
}

function Section({ title, children, style = {} }) {
  return (
    <motion.div variants={fadeUp} style={{
      background: c.surface,
      border: `1px solid ${c.border}`,
      borderRadius: '16px',
      padding: '20px',
      ...style,
    }}>
      {title && (
        <div style={{ fontSize: '11px', color: c.text3, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, marginBottom: '16px' }}>
          {title}
        </div>
      )}
      {children}
    </motion.div>
  );
}

function PlanBar({ planCounts }) {
  const total = Object.values(planCounts).reduce((s, v) => s + v, 0) || 1;
  const plans = [
    { id: 'pro', label: 'Бизнес', color: '#818cf8' },
    { id: 'base', label: 'Про', color: '#0ea5e9' },
    { id: 'trial', label: 'Старт', color: '#fbbf24' },
  ];

  return (
    <div style={{ marginTop: '16px' }}>
      <div style={{ display: 'flex', height: '4px', borderRadius: '4px', overflow: 'hidden', gap: '2px', background: 'rgba(255,255,255,0.04)' }}>
        {plans.map(p => {
          const w = ((planCounts[p.id] || 0) / total) * 100;
          if (!w) return null;
          return <div key={p.id} style={{ width: `${w}%`, background: p.color, borderRadius: '4px', transition: 'width 0.6s ease' }} />;
        })}
      </div>
      <div style={{ display: 'flex', gap: '16px', marginTop: '12px' }}>
        {plans.map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: p.color }} />
            <span style={{ fontSize: '11px', color: c.text2 }}>
              {p.label} <span style={{ color: c.text1, fontWeight: 600 }}>{planCounts[p.id] || 0}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaymentRow({ p, isTest }) {
  const d = new Date(p.date);
  const time = `${d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })} ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  const planNames = { trial: 'Старт', base: 'Про', pro: 'Бизнес' };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 0',
      borderBottom: `1px solid ${c.border}`,
      opacity: isTest ? 0.4 : 1,
    }}>
      <div>
        <div style={{ fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
          {planNames[p.planId] || p.planId}
          {isTest && <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)', color: c.amber, fontWeight: 700 }}>тест</span>}
        </div>
        <div style={{ fontSize: '10px', color: c.text3, fontFamily: 'monospace', marginTop: '3px' }}>{p.uid?.slice(0, 14)}…</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: isTest ? c.text3 : c.green, fontFeatureSettings: "'tnum'" }}>
          {p.stars ? `+${p.stars} ⭐` : '—'}
        </div>
        <div style={{ fontSize: '10px', color: c.text3, marginTop: '2px' }}>{time}</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { authHeaders } = useAdmin();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showTest, setShowTest] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    fetch('/api/admin/stats', { headers: { ...authHeaders } })
      .then(r => r.json())
      .then(res => res.ok ? setData(res.data) : setError(res.error || 'Ошибка'))
      .catch(() => setError('Нет соединения'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          style={{ width: '24px', height: '24px', borderRadius: '50%', border: `2px solid ${c.border}`, borderTopColor: c.accent }}
        />
      </div>
    );
  }

  if (error) {
    return (
      <Section style={{ textAlign: 'center', padding: '40px 20px' }}>
        <p style={{ color: c.text2, margin: '0 0 16px', fontSize: '14px' }}>{error}</p>
        <button onClick={load} style={{ padding: '8px 20px', borderRadius: '8px', background: 'rgba(129,140,248,0.1)', border: `1px solid rgba(129,140,248,0.3)`, color: c.accent, cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
          Повторить
        </button>
      </Section>
    );
  }

  const {
    totalUsers = 0, activeUsers = 0, planCounts = {},
    starsTotal = 0, starsWeek = 0, starsToday = 0,
    realPaymentsCount = 0, testPaymentsCount = 0,
    recentPayments = [], recentTestPayments = [],
    generationsTotal = 0, generationsToday = 0, generationsFromCredits = 0,
    botActivations = 0, botActivationsToday = 0,
  } = data || {};

  const gens = generationsTotal || generationsFromCredits;

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* ── Top metrics row ── */}
      <motion.div variants={fadeUp} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Section>
          <Metric label="Генерации" value={gens} sub={generationsToday > 0 ? `+${generationsToday} сегодня` : 'всего'} accent />
        </Section>
        <Section>
          <Metric label="Пользователи" value={totalUsers} sub={`${activeUsers} с подпиской`} />
        </Section>
      </motion.div>

      {/* ── Revenue ── */}
      <Section title="Выручка">
        {realPaymentsCount === 0 ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: '13px', color: c.text2, marginBottom: '4px' }}>Реальных оплат пока нет</div>
            {testPaymentsCount > 0 && (
              <div style={{ fontSize: '11px', color: c.text3 }}>Тестовых: {testPaymentsCount}</div>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <Metric label="Всего" value={`${starsTotal} ⭐`} accent />
            <Metric label="За неделю" value={`${starsWeek} ⭐`} />
            <Metric label="Сегодня" value={`${starsToday} ⭐`} />
          </div>
        )}
      </Section>

      {/* ── Plans ── */}
      <Section title="Тарифы">
        <div style={{ display: 'flex', gap: '24px' }}>
          <Metric label="Активных" value={activeUsers} accent />
          <Metric label="Конверсия" value={totalUsers > 0 ? `${Math.round((activeUsers / totalUsers) * 100)}%` : '—'} />
        </div>
        <PlanBar planCounts={planCounts} />
      </Section>

      {/* ── Recent transactions ── */}
      <Section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ fontSize: '11px', color: c.text3, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>
            Последние оплаты
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {testPaymentsCount > 0 && (
              <button onClick={() => setShowTest(!showTest)} style={{
                padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 600,
                background: showTest ? 'rgba(251,191,36,0.1)' : 'transparent',
                border: `1px solid ${showTest ? 'rgba(251,191,36,0.3)' : c.border}`,
                color: showTest ? c.amber : c.text3, cursor: 'pointer',
              }}>
                {showTest ? 'Скрыть тест' : `Тест (${testPaymentsCount})`}
              </button>
            )}
            <button onClick={load} style={{
              padding: '3px 8px', borderRadius: '6px', fontSize: '12px',
              background: 'transparent', border: `1px solid ${c.border}`,
              color: c.text3, cursor: 'pointer',
            }}>↻</button>
          </div>
        </div>

        {recentPayments.length === 0 && !showTest ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: c.text3, fontSize: '13px' }}>Нет оплат</div>
        ) : (
          <>
            {recentPayments.slice(0, 8).map((p, i) => <PaymentRow key={`r${i}`} p={p} isTest={false} />)}
            {showTest && recentTestPayments.length > 0 && (
              <>
                <div style={{ margin: '12px 0 8px', padding: '6px', borderRadius: '6px', background: 'rgba(251,191,36,0.05)', border: '1px dashed rgba(251,191,36,0.15)', fontSize: '10px', color: c.amber, textAlign: 'center', fontWeight: 600 }}>
                  Тестовые ({testPaymentsCount}) — не учитываются в выручке
                </div>
                {recentTestPayments.slice(0, 5).map((p, i) => <PaymentRow key={`t${i}`} p={p} isTest={true} />)}
              </>
            )}
          </>
        )}
      </Section>
    </motion.div>
  );
}
