import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAdmin } from '../AdminApp';

const c = {
  surface: 'rgba(255,255,255,0.03)',
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

// ═══════════════════════════════════════════
//  Форма выдачи доступа
// ═══════════════════════════════════════════

const PLANS = [
  { id: 'trial', label: 'Старт',   credits: 25,   icon: '🎯', desc: '25 генераций' },
  { id: 'base',  label: 'Про',     credits: 100,  icon: '⚡', desc: '100 генераций' },
  { id: 'pro',   label: 'Бизнес',  credits: 1000, icon: '🚀', desc: '1000 генераций' },
  { id: 'custom',label: 'Вручную', credits: null, icon: '⚙️', desc: 'Любое кол-во' },
];
const PLAN_BTN_COLORS = { trial: '#fbbf24', base: '#0ea5e9', pro: '#818cf8', custom: '#34d399' };

function GrantAccessForm({ onSuccess, authHeaders }) {
  const [identifier, setIdentifier] = useState('');
  const [plan, setPlan] = useState('trial');
  const [customCredits, setCustomCredits] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!identifier.trim()) return;
    setLoading(true);
    setResult(null);

    try {
      const body = { identifier: identifier.trim(), plan, note };
      if (plan === 'custom') body.credits = parseInt(customCredits, 10);

      const res = await fetch('/api/admin/grant-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setResult(data);
      if (data.ok) {
        setIdentifier('');
        setNote('');
        setCustomCredits('');
        if (onSuccess) onSuccess();
      }
    } catch {
      setResult({ ok: false, error: 'Ошибка сети' });
    } finally {
      setLoading(false);
    }
  };

  const selectedPlan = PLANS.find(p => p.id === plan);

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Identifier — TG ID / Email / UID */}
      <div>
        <label style={{ fontSize: '11px', color: c.text3, fontWeight: 600, letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
          Telegram ID / Email / UID
        </label>
        <input value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder="123456789 или user@mail.ru" required
          style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', fontSize: '14px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${c.border}`, color: c.text1, outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace' }}
        />
        <div style={{ fontSize: '10px', color: c.text3, marginTop: '6px', lineHeight: 1.5 }}>
          <span style={{ color: c.text2, fontWeight: 600 }}>Telegram ID</span> — попроси написать боту @userinfobot · <span style={{ color: c.text2, fontWeight: 600 }}>Email</span> — если зарегистрировались через почту
        </div>
      </div>

      {/* Plan selector */}
      <div>
        <label style={{ fontSize: '11px', color: c.text3, fontWeight: 600, letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
          Тариф
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {PLANS.map(p => (
            <button key={p.id} type="button" onClick={() => setPlan(p.id)} style={{
              padding: '12px', borderRadius: '12px',
              border: `1px solid ${plan === p.id ? PLAN_BTN_COLORS[p.id] + '55' : c.border}`,
              background: plan === p.id ? PLAN_BTN_COLORS[p.id] + '12' : c.surface,
              cursor: 'pointer', textAlign: 'left',
            }}>
              <div style={{ fontSize: '14px', marginBottom: '2px' }}>{p.icon}</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: plan === p.id ? PLAN_BTN_COLORS[p.id] : c.text1 }}>{p.label}</div>
              <div style={{ fontSize: '10px', color: c.text3, marginTop: '2px' }}>{p.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Custom credits */}
      {plan === 'custom' && (
        <div>
          <label style={{ fontSize: '11px', color: c.text3, fontWeight: 600, letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>Кол-во генераций</label>
          <input type="number" value={customCredits} onChange={e => setCustomCredits(e.target.value)} placeholder="Например: 50" min="1" max="10000" required
            style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', fontSize: '14px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${c.border}`, color: c.text1, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
      )}

      {/* Note */}
      <div>
        <label style={{ fontSize: '11px', color: c.text3, fontWeight: 600, letterSpacing: '0.8px', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>Причина (опционально)</label>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Тестирование, конкурс, VIP..."
          style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', fontSize: '13px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${c.border}`, color: c.text1, outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      {/* Result */}
      {result && (
        <div style={{
          padding: '14px', borderRadius: '12px',
          background: result.ok ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)',
          border: `1px solid ${result.ok ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)'}`,
        }}>
          {result.ok ? (
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: c.green, marginBottom: '4px' }}>✓ Доступ выдан</div>
              <div style={{ fontSize: '12px', color: c.text2, lineHeight: 1.5 }}>
                {result.displayInfo && <div style={{ fontSize: '10px', color: c.text3, marginBottom: '3px', fontFamily: 'monospace' }}>{result.displayInfo}</div>}
                {result.action === 'created' && `Новый пользователь создан. Выдано ${result.creditsGranted} генераций.`}
                {result.action === 'topup' && `Пополнено +${result.creditsGranted}. Баланс: ${result.newCredits}.`}
                {result.action === 'pending' && `Доступ успешно зарезервирован! Пользователь получит ${result.creditsGranted} генераций сразу после регистрации по этой почте.`}
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: c.red, marginBottom: '4px' }}>Ошибка</div>
              <div style={{ fontSize: '12px', color: c.text2 }}>{result.error}</div>
            </div>
          )}
        </div>
      )}

      {/* Submit */}
      <button type="submit" disabled={loading || !identifier.trim()} style={{
        padding: '14px', borderRadius: '14px', fontSize: '14px', fontWeight: 700,
        background: loading || !identifier.trim() ? 'rgba(255,255,255,0.04)' : `linear-gradient(135deg, ${PLAN_BTN_COLORS[plan]}30, ${PLAN_BTN_COLORS[plan]}15)`,
        border: `1px solid ${loading || !identifier.trim() ? c.border : PLAN_BTN_COLORS[plan] + '40'}`,
        color: loading || !identifier.trim() ? c.text3 : PLAN_BTN_COLORS[plan],
        cursor: loading || !identifier.trim() ? 'default' : 'pointer',
      }}>
        {loading ? 'Выдаём доступ...' : `${selectedPlan?.icon || ''} Выдать ${selectedPlan?.label || ''}`}
        {!loading && plan !== 'custom' && selectedPlan?.credits ? ` — ${selectedPlan.credits} ген.` : ''}
        {!loading && plan === 'custom' && customCredits ? ` — ${customCredits} ген.` : ''}
      </button>
    </form>
  );
}

// ═══════════════════════════════════════════
//  Строка пользователя
// ═══════════════════════════════════════════

function UserRow({ user, onRefund }) {
  const [refunding, setRefunding] = useState(false);
  const [refunded, setRefunded] = useState(false);
  const [credits, setCredits] = useState(user.credits);

  const handleRefund = async () => {
    setRefunding(true);
    try {
      const res = await onRefund(user.uid);
      if (res.ok) { 
        setCredits(res.newCredits); 
        setRefunded(true); 
        setTimeout(() => setRefunded(false), 3000); 
      }
    } finally { 
      setRefunding(false); 
    }
  };

  const activated = user.planActivatedAt 
    ? (user.planActivatedAt.seconds 
        ? new Date(user.planActivatedAt.seconds * 1000).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })
        : new Date(user.planActivatedAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })
      )
    : '—';

  // Определяем тип пользователя по UID
  const isTelegram = /^\d+$/.test(String(user.uid));
  const userTypeBadge = isTelegram ? 'TG' : 'Email';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 0', borderBottom: `1px solid ${c.border}`, gap: '10px',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: PLAN_COLORS[user.plan] || '#555', flexShrink: 0 }} />
          <span style={{ fontSize: '11px', fontWeight: 700, color: PLAN_COLORS[user.plan] || c.text2, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
            {PLAN_LABELS[user.plan] || user.plan}
          </span>
          <span style={{ 
            fontSize: '9px', 
            padding: '1px 5px', 
            borderRadius: '4px', 
            background: isTelegram ? 'rgba(56, 189, 248, 0.1)' : 'rgba(167, 139, 250, 0.1)', 
            border: `1px solid ${isTelegram ? 'rgba(56, 189, 248, 0.2)' : 'rgba(167, 139, 250, 0.2)'}`, 
            color: isTelegram ? '#38bdf8' : c.purple, 
            fontWeight: 800 
          }}>
            {userTypeBadge}
          </span>
          {user.grantedByAdmin && (
            <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', color: c.green, fontWeight: 700 }}>admin</span>
          )}
          {user.ltv > 0 && (
            <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', background: 'rgba(251, 146, 60, 0.1)', border: '1px solid rgba(251, 146, 60, 0.2)', color: c.accent, fontWeight: 800 }}>
              ★ {user.ltv} RUB
            </span>
          )}
        </div>

        {/* Имя и Username */}
        {(user.firstName || user.username) && (
          <div style={{ fontSize: '13px', fontWeight: 600, color: c.text1, marginBottom: '2px', display: 'flex', gap: '6px', alignItems: 'center' }}>
            {user.firstName && <span>{user.firstName}</span>}
            {user.username && <span style={{ color: c.accent, fontSize: '12px' }}>@{user.username}</span>}
          </div>
        )}

        <div style={{ fontFamily: 'monospace', fontSize: '10px', color: c.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user.uid}
        </div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '4px', fontSize: '11px' }}>
          <span style={{ color: c.text2 }}>{credits}/{user.creditsTotal} кред.</span>
          <span style={{ color: c.text3 }}>Акт: {activated}</span>
        </div>
      </div>

      <button onClick={handleRefund} disabled={refunding || refunded} style={{
        padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 600, flexShrink: 0,
        border: `1px solid ${refunded ? 'rgba(52,211,153,0.3)' : 'rgba(129,140,248,0.3)'}`,
        background: refunded ? 'rgba(52,211,153,0.08)' : 'rgba(129,140,248,0.08)',
        color: refunded ? c.green : c.accent,
        cursor: refunding || refunded ? 'default' : 'pointer',
        opacity: refunding ? 0.5 : 1,
      }}>
        {refunded ? '✓ Выдан' : refunding ? '...' : '+1 кред'}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════
//  Главный компонент
// ═══════════════════════════════════════════

export default function Users() {
  const { authHeaders } = useAdmin();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [tab, setTab] = useState('users');

  const load = useCallback((searchQuery = '') => {
    setLoading(true);
    let url = '/api/admin/users?limit=100';
    if (searchQuery.trim()) {
      url += `&search=${encodeURIComponent(searchQuery.trim())}`;
    }
    fetch(url, { headers: { ...authHeaders } })
      .then(r => r.json())
      .then(res => {
        if (res.ok) {
          setUsers(res.users || []);
          setError(null);
        } else {
          setError(res.error || 'Ошибка загрузки');
        }
      })
      .catch(() => setError('Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [authHeaders]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefund = async (uid) => {
    const res = await fetch('/api/admin/refund', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ uid }),
    });
    return res.json();
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    load(search);
  };

  const filtered = users.filter(u => {
    if (filter !== 'all' && u.plan !== filter) return false;
    return true;
  });

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* ── Tab switcher — простой, без AnimatePresence ── */}
      <motion.div variants={fadeUp} style={{ display: 'flex', gap: '6px', padding: '4px', background: c.surface, borderRadius: '14px', border: `1px solid ${c.border}` }}>
        <button onClick={() => setTab('users')} style={{
          flex: 1, padding: '9px', borderRadius: '10px', fontSize: '12px',
          fontWeight: tab === 'users' ? 600 : 400,
          background: tab === 'users' ? 'rgba(129,140,248,0.12)' : 'transparent',
          border: `1px solid ${tab === 'users' ? 'rgba(129,140,248,0.25)' : 'transparent'}`,
          color: tab === 'users' ? c.accent : c.text3, cursor: 'pointer',
        }}>Юзеры ({users.length})</button>
        <button onClick={() => setTab('grant')} style={{
          flex: 1, padding: '9px', borderRadius: '10px', fontSize: '12px',
          fontWeight: tab === 'grant' ? 600 : 400,
          background: tab === 'grant' ? 'rgba(52,211,153,0.12)' : 'transparent',
          border: `1px solid ${tab === 'grant' ? 'rgba(52,211,153,0.25)' : 'transparent'}`,
          color: tab === 'grant' ? c.green : c.text3, cursor: 'pointer',
        }}>＋ Выдать доступ</button>
      </motion.div>

      {/* ── Grant Access Tab ── */}
      {tab === 'grant' && (
        <Section title="Выдать бесплатный доступ">
          <GrantAccessForm onSuccess={() => { load(); }} authHeaders={authHeaders} />
        </Section>
      )}

      {/* ── Users Tab ── */}
      {tab === 'users' && (
        <>
          {/* Search */}
          <motion.div variants={fadeUp}>
            <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '8px' }}>
              <input 
                value={search} 
                onChange={e => setSearch(e.target.value)} 
                placeholder="Поиск по UID, Username или Email…"
                style={{ flex: 1, padding: '10px 14px', borderRadius: '12px', fontSize: '13px', background: c.surface, border: `1px solid ${c.border}`, color: c.text1, outline: 'none', boxSizing: 'border-box' }}
              />
              <button 
                type="submit" 
                style={{ background: c.accent, border: 'none', borderRadius: '12px', color: '#000', padding: '10px 20px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
              >
                Найти
              </button>
            </form>
          </motion.div>

          {/* Plan filter */}
          <motion.div variants={fadeUp} style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[{ id: 'all', label: 'Все' }, { id: 'trial', label: 'Старт' }, { id: 'base', label: 'Про' }, { id: 'pro', label: 'Бизнес' }].map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)} style={{
                padding: '6px 12px', borderRadius: '8px', fontSize: '11px',
                fontWeight: filter === f.id ? 600 : 400,
                background: filter === f.id ? 'rgba(129,140,248,0.1)' : 'transparent',
                border: `1px solid ${filter === f.id ? 'rgba(129,140,248,0.25)' : c.border}`,
                color: filter === f.id ? c.accent : c.text3, cursor: 'pointer',
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
              <button onClick={() => load(search)} style={{ marginTop: '8px', padding: '6px 16px', borderRadius: '8px', background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.3)', color: c.accent, cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>Повторить</button>
            </Section>
          ) : (
            <Section style={{ padding: '4px 20px' }}>
              <div style={{ padding: '12px 0 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: c.text3, fontWeight: 500 }}>Показано {filtered.length} пользователей</span>
                <button onClick={() => load(search)} style={{ padding: '4px 8px', borderRadius: '6px', background: 'transparent', border: `1px solid ${c.border}`, color: c.text3, cursor: 'pointer', fontSize: '12px' }}>↻</button>
              </div>
              {filtered.length === 0 ? (
                <p style={{ textAlign: 'center', color: c.text3, padding: '24px 0', fontSize: '13px' }}>Нет результатов</p>
              ) : (
                filtered.map(u => <UserRow key={u.uid} user={u} onRefund={handleRefund} />)
              )}
            </Section>
          )}
        </>
      )}
    </motion.div>
  );
}
