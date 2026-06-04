import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAdmin } from '../AdminApp';

const c = {
  surface: 'rgba(255,255,255,0.03)',
  surfaceHover: 'rgba(255,255,255,0.05)',
  border: 'rgba(255,255,255,0.06)',
  borderActive: 'rgba(129,140,248,0.4)',
  text1: '#e8e8ed',
  text2: 'rgba(255,255,255,0.5)',
  text3: 'rgba(255,255,255,0.25)',
  accent: '#818cf8',
  green: '#34d399',
  amber: '#fbbf24',
  red: '#f87171',
};

const stagger = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const fadeUp = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } };

const PLANS = [
  { id: 'trial', label: 'Старт',   credits: 25,   icon: '🎯', desc: '25 генераций' },
  { id: 'base',  label: 'Про',     credits: 100,  icon: '⚡', desc: '100 генераций' },
  { id: 'pro',   label: 'Бизнес',  credits: 1000, icon: '🚀', desc: '1000 генераций' },
  { id: 'custom',label: 'Вручную', credits: null, icon: '⚙️', desc: 'Любое кол-во' },
];

const PLAN_COLORS = { trial: '#fbbf24', base: '#0ea5e9', pro: '#818cf8', custom: '#34d399' };
const PLAN_LABELS_SHORT = { trial: 'Старт', base: 'Про', pro: 'Бизнес', none: '—' };
const PLAN_COLORS_MAP = { trial: '#fbbf24', base: '#0ea5e9', pro: '#818cf8', none: '#555' };

function Section({ title, children, style = {} }) {
  return (
    <motion.div variants={fadeUp} style={{
      background: c.surface, border: `1px solid ${c.border}`,
      borderRadius: '16px', padding: '20px', ...style,
    }}>
      {title && (
        <div style={{ fontSize: '11px', color: c.text3, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, marginBottom: '14px' }}>
          {title}
        </div>
      )}
      {children}
    </motion.div>
  );
}

// ── Grant Access Form ──
function GrantAccessForm({ onSuccess, authHeaders }) {
  const [uid, setUid] = useState('');
  const [plan, setPlan] = useState('trial');
  const [customCredits, setCustomCredits] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { ok, action, newCredits, creditsGranted, error }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!uid.trim()) return;
    setLoading(true);
    setResult(null);

    try {
      const body = { uid: uid.trim(), plan, note };
      if (plan === 'custom') body.credits = parseInt(customCredits, 10);

      const res = await fetch('/api/admin/grant-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setResult(data);
      if (data.ok) {
        setUid('');
        setNote('');
        setCustomCredits('');
        onSuccess?.();
      }
    } catch (err) {
      setResult({ ok: false, error: 'Ошибка сети' });
    } finally {
      setLoading(false);
    }
  };

  const selectedPlan = PLANS.find(p => p.id === plan);

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* UID input */}
      <div>
        <label style={{ fontSize: '11px', color: c.text3, fontWeight: 600, letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
          Telegram ID пользователя
        </label>
        <input
          value={uid}
          onChange={e => setUid(e.target.value)}
          placeholder="Например: 123456789"
          required
          style={{
            width: '100%', padding: '12px 14px', borderRadius: '12px', fontSize: '14px',
            background: 'rgba(255,255,255,0.04)', border: `1px solid ${c.border}`,
            color: c.text1, outline: 'none', boxSizing: 'border-box',
            fontFamily: 'monospace', transition: 'border 0.15s',
          }}
          onFocus={e => e.target.style.borderColor = c.borderActive}
          onBlur={e => e.target.style.borderColor = c.border}
        />
        <div style={{ fontSize: '10px', color: c.text3, marginTop: '6px' }}>
          Числовой ID — пользователь должен хотя бы раз запустить бота (/start)
        </div>
      </div>

      {/* Plan selector */}
      <div>
        <label style={{ fontSize: '11px', color: c.text3, fontWeight: 600, letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
          Тариф / Кредиты
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {PLANS.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPlan(p.id)}
              style={{
                padding: '12px', borderRadius: '12px', border: '1px solid',
                borderColor: plan === p.id ? PLAN_COLORS[p.id] + '55' : c.border,
                background: plan === p.id ? PLAN_COLORS[p.id] + '12' : c.surface,
                cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: '14px', marginBottom: '2px' }}>{p.icon}</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: plan === p.id ? PLAN_COLORS[p.id] : c.text1 }}>
                {p.label}
              </div>
              <div style={{ fontSize: '10px', color: c.text3, marginTop: '2px' }}>{p.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Custom credits */}
      <AnimatePresence>
        {plan === 'custom' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <label style={{ fontSize: '11px', color: c.text3, fontWeight: 600, letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
              Кол-во генераций
            </label>
            <input
              type="number"
              value={customCredits}
              onChange={e => setCustomCredits(e.target.value)}
              placeholder="Например: 50"
              min="1"
              max="10000"
              required={plan === 'custom'}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: '12px', fontSize: '14px',
                background: 'rgba(255,255,255,0.04)', border: `1px solid ${c.border}`,
                color: c.text1, outline: 'none', boxSizing: 'border-box', transition: 'border 0.15s',
              }}
              onFocus={e => e.target.style.borderColor = c.borderActive}
              onBlur={e => e.target.style.borderColor = c.border}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Note */}
      <div>
        <label style={{ fontSize: '11px', color: c.text3, fontWeight: 600, letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
          Причина (опционально)
        </label>
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Например: Тестирование, Конкурс, VIP..."
          style={{
            width: '100%', padding: '12px 14px', borderRadius: '12px', fontSize: '13px',
            background: 'rgba(255,255,255,0.04)', border: `1px solid ${c.border}`,
            color: c.text1, outline: 'none', boxSizing: 'border-box', transition: 'border 0.15s',
          }}
          onFocus={e => e.target.style.borderColor = c.borderActive}
          onBlur={e => e.target.style.borderColor = c.border}
        />
      </div>

      {/* Result feedback */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            style={{
              padding: '14px', borderRadius: '12px',
              background: result.ok ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)',
              border: `1px solid ${result.ok ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)'}`,
            }}
          >
            {result.ok ? (
              <>
                <div style={{ fontSize: '13px', fontWeight: 700, color: c.green, marginBottom: '4px' }}>
                  ✓ Доступ выдан
                </div>
                <div style={{ fontSize: '12px', color: c.text2, lineHeight: 1.5 }}>
                  {result.action === 'created'
                    ? `Новый пользователь создан. Выдано ${result.creditsGranted} генераций.`
                    : `Пополнено +${result.creditsGranted} генераций. Баланс: ${result.newCredits}.`
                  }
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '13px', fontWeight: 700, color: c.red, marginBottom: '4px' }}>
                  Ошибка
                </div>
                <div style={{ fontSize: '12px', color: c.text2 }}>{result.error}</div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit button */}
      <motion.button
        type="submit"
        disabled={loading || !uid.trim()}
        whileHover={!loading && uid.trim() ? { scale: 1.01 } : {}}
        whileTap={!loading && uid.trim() ? { scale: 0.98 } : {}}
        style={{
          padding: '14px', borderRadius: '14px', fontSize: '14px', fontWeight: 700,
          background: loading || !uid.trim()
            ? 'rgba(255,255,255,0.04)'
            : `linear-gradient(135deg, ${PLAN_COLORS[plan]}30, ${PLAN_COLORS[plan]}15)`,
          border: `1px solid ${loading || !uid.trim() ? c.border : PLAN_COLORS[plan] + '40'}`,
          color: loading || !uid.trim() ? c.text3 : PLAN_COLORS[plan],
          cursor: loading || !uid.trim() ? 'default' : 'pointer',
          transition: 'all 0.2s',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        }}
      >
        {loading ? (
          <>
            <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
              style={{ display: 'inline-block', fontSize: '14px' }}>⟳</motion.span>
            Выдаём доступ...
          </>
        ) : (
          <>
            {selectedPlan?.icon} Выдать {selectedPlan?.label}
            {plan === 'custom' && customCredits ? ` (${customCredits} кред.)` : selectedPlan?.credits ? ` — ${selectedPlan.credits} ген.` : ''}
          </>
        )}
      </motion.button>
    </form>
  );
}

// ── User Row ──
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

  const activated = user.planActivatedAt
    ? new Date(user.planActivatedAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : '—';
  const expires = user.planExpiresAt
    ? new Date(user.planExpiresAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : null;

  return (
    <motion.div variants={fadeUp} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 0', borderBottom: `1px solid ${c.border}`, gap: '10px',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: PLAN_COLORS_MAP[user.plan] || '#555', flexShrink: 0 }} />
          <span style={{ fontSize: '12px', fontWeight: 600, color: PLAN_COLORS_MAP[user.plan] || c.text2, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
            {PLAN_LABELS_SHORT[user.plan] || user.plan}
          </span>
          {user.grantedByAdmin && (
            <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', color: c.green, fontWeight: 700 }}>admin</span>
          )}
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
  const [tab, setTab] = useState('users'); // 'users' | 'grant'

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

      {/* ── Tab switcher ── */}
      <motion.div variants={fadeUp} style={{ display: 'flex', gap: '6px', padding: '4px', background: c.surface, borderRadius: '14px', border: `1px solid ${c.border}` }}>
        {[
          { id: 'users', label: `Пользователи (${users.length})` },
          { id: 'grant', label: '＋ Выдать доступ' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: '9px', borderRadius: '10px', fontSize: '12px',
            fontWeight: tab === t.id ? 600 : 400,
            background: tab === t.id ? (t.id === 'grant' ? 'rgba(52,211,153,0.12)' : 'rgba(129,140,248,0.12)') : 'transparent',
            border: `1px solid ${tab === t.id ? (t.id === 'grant' ? 'rgba(52,211,153,0.25)' : 'rgba(129,140,248,0.25)') : 'transparent'}`,
            color: tab === t.id ? (t.id === 'grant' ? c.green : c.accent) : c.text3,
            cursor: 'pointer', transition: 'all 0.2s',
          }}>{t.label}</button>
        ))}
      </motion.div>

      <AnimatePresence mode="wait">
        {tab === 'grant' ? (
          <motion.div key="grant" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            <Section title="Выдать бесплатный доступ">
              <GrantAccessForm onSuccess={() => { load(); setTab('users'); }} authHeaders={authHeaders} />
            </Section>
          </motion.div>
        ) : (
          <motion.div key="users" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

            {/* Search */}
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

            {/* Plan filter */}
            <motion.div variants={fadeUp} style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {[{ id: 'all', label: 'Все' }, { id: 'trial', label: 'Старт' }, { id: 'base', label: 'Про' }, { id: 'pro', label: 'Бизнес' }].map(f => (
                <button key={f.id} onClick={() => setFilter(f.id)} style={{
                  padding: '6px 12px', borderRadius: '8px', fontSize: '11px',
                  fontWeight: filter === f.id ? 600 : 400,
                  background: filter === f.id ? 'rgba(129,140,248,0.1)' : 'transparent',
                  border: `1px solid ${filter === f.id ? 'rgba(129,140,248,0.25)' : c.border}`,
                  color: filter === f.id ? c.accent : c.text3,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}>{f.label}</button>
              ))}
            </motion.div>

            {/* List */}
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
        )}
      </AnimatePresence>
    </motion.div>
  );
}
