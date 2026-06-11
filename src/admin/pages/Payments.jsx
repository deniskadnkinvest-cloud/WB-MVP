import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAdmin } from '../AdminApp';

const c = {
  surface: 'rgba(255,255,255,0.03)',
  border: 'rgba(255,255,255,0.06)',
  text1: '#e8e8ed',
  text2: 'rgba(255,255,255,0.5)',
  text3: 'rgba(255,255,255,0.25)',
  accent: '#818cf8',
  green: '#34d399',
  amber: '#fbbf24',
};

const stagger = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const fadeUp = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } };

function Section({ title, children, style = {} }) {
  return (
    <motion.div variants={fadeUp} style={{
      background: c.surface, border: `1px solid ${c.border}`,
      borderRadius: '16px', padding: '20px', ...style,
    }}>
      {title && <div style={{ fontSize: '11px', color: c.text3, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, marginBottom: '14px' }}>{title}</div>}
      {children}
    </motion.div>
  );
}

function SmallMetric({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '9px', color: c.text3, letterSpacing: '0.5px', textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '18px', fontWeight: 700, color: color || c.text1, fontFeatureSettings: "'tnum'", letterSpacing: '-0.5px' }}>{value}</div>
    </div>
  );
}

function PaymentRow({ p }) {
  const d = p.date ? new Date(p.date) : null;
  const time = d ? `${d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })} ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : '—';
  const isTest = p.isTest === true;
  const isGrant = p.isGrant === true;
  const planNames = { trial: 'Старт', base: 'Про', pro: 'Бизнес' };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 0', borderBottom: `1px solid ${c.border}`,
      opacity: isTest ? 0.4 : 1,
    }}>
      <div>
        <div style={{ fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
          {planNames[p.planId] || p.planId}
          {isTest && <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)', color: c.amber, fontWeight: 700 }}>тест</span>}
          {isGrant && <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', color: c.green, fontWeight: 700 }}>grant</span>}
        </div>
        <div style={{ fontSize: '10px', color: c.text3, fontFamily: 'monospace', marginTop: '2px' }}>{p.uid}</div>
        <div style={{ fontSize: '10px', color: c.text3, marginTop: '2px' }}>
          {time}
          {isGrant && p.grantedBy && <span> · от {p.grantedBy}</span>}
          {isGrant && p.note && <span> · {p.note}</span>}
        </div>
      </div>
      <div style={{ fontSize: '14px', fontWeight: 700, color: isGrant ? c.green : isTest ? c.text3 : c.green, fontFeatureSettings: "'tnum'" }}>
        {p.stars ? `${isGrant ? '🎁' : '+'} ${p.stars} ${isGrant ? 'кред.' : '⭐'}` : '—'}
      </div>
    </div>
  );
}

export default function Payments() {
  const { authHeaders } = useAdmin();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('real');

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/stats', { headers: { ...authHeaders } })
      .then(r => r.json())
      .then(res => res.ok ? setData(res.data) : setError(res.error))
      .catch(() => setError('Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [authHeaders]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          style={{ width: '24px', height: '24px', borderRadius: '50%', border: `2px solid ${c.border}`, borderTopColor: c.accent }} />
      </div>
    );
  }

  if (error) {
    return <Section style={{ textAlign: 'center' }}><p style={{ color: c.text2, fontSize: '13px' }}>{error}</p></Section>;
  }

  const {
    starsTotal = 0, starsWeek = 0, starsToday = 0, revenueByPlan = {},
    realPaymentsCount = 0, testPaymentsCount = 0, adminGrantsCount = 0, grantedCreditsTotal = 0,
    recentPayments = [], recentTestPayments = [], recentAdminGrants = [],
  } = data || {};

  // Payments по режиму
  let payments = [];
  if (mode === 'real') payments = recentPayments;
  else if (mode === 'test') payments = recentTestPayments;
  else if (mode === 'grants') payments = recentAdminGrants;
  else payments = [...recentPayments, ...recentTestPayments, ...recentAdminGrants].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* ── Revenue Summary ── */}
      <motion.div variants={fadeUp} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
        <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: '14px', padding: '14px', textAlign: 'center' }}>
          <div style={{ fontSize: '10px', color: c.text3, textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 600, marginBottom: '6px' }}>Всего</div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: c.green, fontFeatureSettings: "'tnum'" }}>{starsTotal} ⭐</div>
        </div>
        <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: '14px', padding: '14px', textAlign: 'center' }}>
          <div style={{ fontSize: '10px', color: c.text3, textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 600, marginBottom: '6px' }}>Неделя</div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: c.accent, fontFeatureSettings: "'tnum'" }}>{starsWeek} ⭐</div>
        </div>
        <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: '14px', padding: '14px', textAlign: 'center' }}>
          <div style={{ fontSize: '10px', color: c.text3, textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 600, marginBottom: '6px' }}>Сегодня</div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#22d3ee', fontFeatureSettings: "'tnum'" }}>{starsToday} ⭐</div>
        </div>
      </motion.div>

      {/* ── Revenue by Plan ── */}
      {realPaymentsCount > 0 && (
        <Section title="По тарифам">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
            <SmallMetric label="Старт" value={`${revenueByPlan.trial || 0} ⭐`} color="#fbbf24" />
            <SmallMetric label="Про" value={`${revenueByPlan.base || 0} ⭐`} color="#0ea5e9" />
            <SmallMetric label="Бизнес" value={`${revenueByPlan.pro || 0} ⭐`} color="#818cf8" />
          </div>
        </Section>
      )}

      {/* ── Admin Grants Summary ── */}
      {adminGrantsCount > 0 && (
        <Section title={`Выданный доступ — ${adminGrantsCount} грантов`}>
          <SmallMetric label="Кредитов выдано бесплатно" value={`🎁 ${grantedCreditsTotal}`} color={c.green} />
        </Section>
      )}

      {/* ── Mode tabs ── */}
      <motion.div variants={fadeUp} style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
        {[
          { id: 'real', label: `Реальные (${realPaymentsCount})` },
          { id: 'test', label: `Тестовые (${testPaymentsCount})` },
          { id: 'grants', label: `Гранты (${adminGrantsCount})` },
          { id: 'all', label: 'Все' },
        ].map(m => (
          <button key={m.id} onClick={() => setMode(m.id)} style={{
            padding: '7px 12px', borderRadius: '10px', fontSize: '11px', fontWeight: mode === m.id ? 600 : 400,
            background: mode === m.id ? (m.id === 'test' ? 'rgba(251,191,36,0.1)' : m.id === 'grants' ? 'rgba(52,211,153,0.1)' : 'rgba(129,140,248,0.1)') : 'transparent',
            border: `1px solid ${mode === m.id ? (m.id === 'test' ? 'rgba(251,191,36,0.25)' : m.id === 'grants' ? 'rgba(52,211,153,0.25)' : 'rgba(129,140,248,0.25)') : c.border}`,
            color: mode === m.id ? (m.id === 'test' ? c.amber : m.id === 'grants' ? c.green : c.accent) : c.text3,
            cursor: 'pointer',
          }}>{m.label}</button>
        ))}
        <button onClick={load} style={{
          marginLeft: 'auto', padding: '7px 10px', borderRadius: '10px', fontSize: '12px',
          background: 'transparent', border: `1px solid ${c.border}`, color: c.text3, cursor: 'pointer',
        }}>↻</button>
      </motion.div>

      {/* ── Transactions list ── */}
      {payments.length === 0 ? (
        <Section style={{ textAlign: 'center', padding: '32px' }}>
          <p style={{ color: c.text3, fontSize: '13px', margin: 0 }}>
            {mode === 'real' ? 'Реальных оплат нет' : mode === 'test' ? 'Тестовых нет' : mode === 'grants' ? 'Грантов нет' : 'Нет транзакций'}
          </p>
        </Section>
      ) : (
        <Section style={{ padding: '4px 20px' }}>
          <div style={{ padding: '12px 0 6px', fontSize: '11px', color: c.text3, fontWeight: 500 }}>
            {payments.length} транзакций
          </div>
          {payments.map((p, i) => <PaymentRow key={i} p={p} />)}
        </Section>
      )}
    </motion.div>
  );
}
