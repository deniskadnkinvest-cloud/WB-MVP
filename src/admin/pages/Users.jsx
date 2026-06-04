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
};

const PLAN_LABELS = { trial: 'Старт', base: 'Про', pro: 'Бизнес', none: '—' };
const PLAN_COLORS = { trial: '#fbbf24', base: '#0ea5e9', pro: '#818cf8', none: '#555' };

const stagger = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.04 } } };
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

function UserRow({ user, onRefund }) {
  const [refunding, setRefunding] = useState(false);
  const [refunded, setRefunded] = useState(false);
  const [credits, setCredits] = useState(user.credits);

  const handleRefund = async () => {
    setRefunding(true);
    try {
      const res = await onRefund(user.uid);
      if (res.ok) { setCredits(res.newCredits); setRefunded(true); setTimeout(() => setRefunded(false), 3000); }
    } finally { setRefunding(false); }
  };

  const activated = user.planActivatedAt ? new Date(user.planActivatedAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
  const expires = user.planExpiresAt ? new Date(user.planExpiresAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }) : null;

  return (
    <motion.div variants={fadeUp} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 0', borderBottom: `1px solid ${c.border}`, gap: '10px',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: PLAN_COLORS[user.plan] || '#555', flexShrink: 0 }} />
          <span style={{ fontSize: '12px', fontWeight: 600, color: PLAN_COLORS[user.plan] || c.text2, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
            {PLAN_LABELS[user.plan] || user.plan}
          </span>
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: '10px', color: c.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user.uid}
        </div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '4px', fontSize: '11px' }}>
          <span style={{ color: c.text2 }}>{credits}/{user.creditsTotal} кред.</span>
          <span style={{ color: c.text3 }}>{activated}{expires && ` → ${expires}`}</span>
        </div>
      </div>

      <button onClick={handleRefund} disabled={refunding || refunded} style={{
        padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 600, flexShrink: 0,
        border: `1px solid ${refunded ? 'rgba(52,211,153,0.3)' : 'rgba(129,140,248,0.3)'}`,
        background: refunded ? 'rgba(52,211,153,0.08)' : 'rgba(129,140,248,0.08)',
        color: refunded ? c.green : c.accent,
        cursor: refunding || refunded ? 'default' : 'pointer',
        opacity: refunding ? 0.5 : 1, transition: 'all 0.15s',
      }}>
        {refunded ? '✓ Выдан' : refunding ? '...' : '+1 кред'}
      </button>
    </motion.div>
  );
}

export default function Users() {
  const { authHeaders } = useAdmin();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const load = () => {
    setLoading(true);
    fetch('/api/admin/stats', { headers: { ...authHeaders } })
      .then(r => r.json())
      .then(res => res.ok ? setUsers(res.data.activeUsersList || []) : setError(res.error))
      .catch(() => setError('Ошибка загрузки'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleRefund = async (uid) => {
    const res = await fetch('/api/admin/refund', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ uid }),
    });
    return res.json();
  };

  const filtered = users.filter(u => {
    if (search && !u.uid.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter !== 'all' && u.plan !== filter) return false;
    return true;
  });

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* ── Search ── */}
      <motion.div variants={fadeUp}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по UID…"
          style={{
            width: '100%', padding: '10px 14px', borderRadius: '12px', fontSize: '13px',
            background: c.surface, border: `1px solid ${c.border}`,
            color: c.text1, outline: 'none', boxSizing: 'border-box',
          }}
          onFocus={e => e.target.style.borderColor = 'rgba(129,140,248,0.4)'}
          onBlur={e => e.target.style.borderColor = c.border}
        />
      </motion.div>

      {/* ── Plan filter ── */}
      <motion.div variants={fadeUp} style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {[
          { id: 'all', label: 'Все' },
          { id: 'trial', label: 'Старт' },
          { id: 'base', label: 'Про' },
          { id: 'pro', label: 'Бизнес' },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{
            padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: filter === f.id ? 600 : 400,
            background: filter === f.id ? 'rgba(129,140,248,0.1)' : 'transparent',
            border: `1px solid ${filter === f.id ? 'rgba(129,140,248,0.25)' : c.border}`,
            color: filter === f.id ? c.accent : c.text3, cursor: 'pointer', transition: 'all 0.15s',
          }}>{f.label}</button>
        ))}
      </motion.div>

      {/* ── Content ── */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
            style={{ width: '24px', height: '24px', borderRadius: '50%', border: `2px solid ${c.border}`, borderTopColor: c.accent }} />
        </div>
      ) : error ? (
        <Section style={{ textAlign: 'center' }}>
          <p style={{ color: c.text2, fontSize: '13px' }}>{error}</p>
          <button onClick={load} style={{ marginTop: '8px', padding: '6px 16px', borderRadius: '8px', background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.3)', color: c.accent, cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>Повторить</button>
        </Section>
      ) : (
        <Section style={{ padding: '4px 20px' }}>
          <div style={{ padding: '12px 0 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: c.text3, fontWeight: 500 }}>{filtered.length} из {users.length}</span>
            <button onClick={load} style={{ padding: '4px 8px', borderRadius: '6px', background: 'transparent', border: `1px solid ${c.border}`, color: c.text3, cursor: 'pointer', fontSize: '12px' }}>↻</button>
          </div>
          <motion.div variants={stagger} initial="hidden" animate="show">
            {filtered.length === 0 ? (
              <p style={{ textAlign: 'center', color: c.text3, padding: '24px 0', fontSize: '13px' }}>Нет результатов</p>
            ) : (
              filtered.map(u => <UserRow key={u.uid} user={u} onRefund={handleRefund} />)
            )}
          </motion.div>
        </Section>
      )}
    </motion.div>
  );
}
