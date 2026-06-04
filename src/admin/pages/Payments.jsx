import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

function PaymentRow({ p }) {
  const d = p.date ? new Date(p.date) : null;
  const time = d ? `${d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })} ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : '—';
  const isTest = p.isTest === true;
  const planNames = { trial: 'Старт', base: 'Про', pro: 'Бизнес' };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 0', borderBottom: `1px solid ${c.border}`,
      opacity: isTest ? 0.4 : 1,
    }}>
      <div>
        <div style={{ fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
          {planNames[p.planId] || p.planId}
          {isTest && <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)', color: c.amber, fontWeight: 700 }}>тест</span>}
        </div>
        <div style={{ fontSize: '10px', color: c.text3, fontFamily: 'monospace', marginTop: '3px' }}>{p.uid}</div>
        <div style={{ fontSize: '10px', color: c.text3, marginTop: '2px' }}>{time}</div>
      </div>
      <div style={{ fontSize: '14px', fontWeight: 700, color: isTest ? c.text3 : c.green, fontFeatureSettings: "'tnum'" }}>
        {p.stars ? `+${p.stars} ⭐` : '—'}
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
  const [mode, setMode] = useState('real');
  const [totals, setTotals] = useState({ total: 0, week: 0, today: 0 });

  const load = () => {
    setLoading(true);
    fetch('/api/admin/stats', { headers: { ...authHeaders } })
      .then(r => r.json())
      .then(res => {
        if (res.ok) {
          setRealPayments(res.data.recentPayments || []);
          setTestPayments(res.data.recentTestPayments || []);
          setTotals({ total: res.data.starsTotal || 0, week: res.data.starsWeek || 0, today: res.data.starsToday || 0 });
        } else setError(res.error);
      })
      .catch(() => setError('Ошибка загрузки'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const payments = mode === 'real' ? realPayments : mode === 'test' ? testPayments : [...realPayments, ...testPayments].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* ── Summary ── */}
      <motion.div variants={fadeUp} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
        {[
          { label: 'Всего', value: totals.total, color: c.green },
          { label: 'Неделя', value: totals.week, color: c.accent },
          { label: 'Сегодня', value: totals.today, color: '#0ea5e9' },
        ].map(item => (
          <div key={item.label} style={{
            background: c.surface, border: `1px solid ${c.border}`,
            borderRadius: '14px', padding: '14px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '10px', color: c.text3, textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 600, marginBottom: '6px' }}>{item.label}</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: item.color, fontFeatureSettings: "'tnum'" }}>{item.value} ⭐</div>
          </div>
        ))}
      </motion.div>

      {/* ── Mode tabs ── */}
      <motion.div variants={fadeUp} style={{ display: 'flex', gap: '6px' }}>
        {[
          { id: 'real', label: `Реальные (${realPayments.length})` },
          { id: 'test', label: `Тестовые (${testPayments.length})` },
          { id: 'all', label: 'Все' },
        ].map(m => (
          <button key={m.id} onClick={() => setMode(m.id)} style={{
            padding: '7px 14px', borderRadius: '10px', fontSize: '11px', fontWeight: mode === m.id ? 600 : 400,
            background: mode === m.id ? (m.id === 'test' ? 'rgba(251,191,36,0.1)' : 'rgba(129,140,248,0.1)') : 'transparent',
            border: `1px solid ${mode === m.id ? (m.id === 'test' ? 'rgba(251,191,36,0.25)' : 'rgba(129,140,248,0.25)') : c.border}`,
            color: mode === m.id ? (m.id === 'test' ? c.amber : c.accent) : c.text3,
            cursor: 'pointer', transition: 'all 0.15s',
          }}>{m.label}</button>
        ))}
        <button onClick={load} style={{
          marginLeft: 'auto', padding: '7px 10px', borderRadius: '10px', fontSize: '12px',
          background: 'transparent', border: `1px solid ${c.border}`, color: c.text3, cursor: 'pointer',
        }}>↻</button>
      </motion.div>

      {/* ── List ── */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
            style={{ width: '24px', height: '24px', borderRadius: '50%', border: `2px solid ${c.border}`, borderTopColor: c.accent }} />
        </div>
      ) : error ? (
        <Section style={{ textAlign: 'center' }}>
          <p style={{ color: c.text2, fontSize: '13px' }}>{error}</p>
        </Section>
      ) : payments.length === 0 ? (
        <Section style={{ textAlign: 'center', padding: '32px' }}>
          <p style={{ color: c.text3, fontSize: '13px', margin: 0 }}>
            {mode === 'real' ? 'Реальных оплат пока нет' : mode === 'test' ? 'Тестовых нет' : 'Нет оплат'}
          </p>
        </Section>
      ) : (
        <Section style={{ padding: '4px 20px' }}>
          <div style={{ padding: '12px 0 8px', fontSize: '11px', color: c.text3, fontWeight: 500 }}>
            {payments.length} {mode === 'test' ? 'тестовых' : mode === 'real' ? 'реальных' : ''} оплат
          </div>
          {payments.map((p, i) => <PaymentRow key={i} p={p} />)}
        </Section>
      )}
    </motion.div>
  );
}
