import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAdmin } from '../AdminApp';

// ── Design Tokens ──
const c = {
  surface: 'rgba(255,255,255,0.03)',
  surfaceHover: 'rgba(255,255,255,0.06)',
  border: 'rgba(255,255,255,0.08)',
  text1: '#f0f0f5',
  text2: 'rgba(255,255,255,0.6)',
  text3: 'rgba(255,255,255,0.3)',
  violet: '#818cf8',
  green: '#34d399',
  red: '#f87171',
  amber: '#fbbf24',
  cyan: '#22d3ee',
  blue: '#3b82f6',
};

const spring = { type: 'spring', stiffness: 400, damping: 25, mass: 0.5 };
const cardVariant = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: spring },
};

const PLAN_LABELS = { none: 'Нет тарифа', trial: 'Старт', base: 'Про', pro: 'Бизнес' };
const PLAN_COLORS = { none: c.text3, trial: c.amber, base: c.cyan, pro: c.violet };

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function Pill({ children, color = c.blue }) {
  return (
    <span style={{ 
      padding: '4px 8px', borderRadius: '8px', 
      border: `1px solid ${color}30`, background: `${color}14`, 
      color, fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' 
    }}>
      {children}
    </span>
  );
}

// ── User Card (List Item) ──
function UserCard({ user, onClick }) {
  const planColor = PLAN_COLORS[user.plan] || c.text3;
  const name = user.displayName || user.firstName || user.username || 'Без имени';
  const idLabel = user.telegramId ? `TG ${user.telegramId}` : user.email ? user.email : `UID ${user.uid?.slice(0, 8)}…`;

  return (
    <motion.div
      variants={cardVariant}
      whileHover={{ scale: 1.01, background: c.surfaceHover }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onClick(user)}
      style={{
        padding: '16px',
        borderRadius: '16px',
        border: `1px solid ${c.border}`,
        background: c.surface,
        backdropFilter: 'blur(20px)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px'
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: user.plan !== 'none' ? c.green : c.text3 }} />
          <span style={{ fontSize: '15px', fontWeight: 700, color: c.text1 }}>{name}</span>
          <span style={{ fontSize: '12px', color: c.text3, fontFamily: 'monospace' }}>{idLabel}</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Pill color={planColor}>{PLAN_LABELS[user.plan] || user.plan || 'none'}</Pill>
          <span style={{ fontSize: '12px', color: c.text2 }}>{user.credits} кредитов</span>
        </div>
      </div>
      
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '12px', color: c.text2 }}>{user.generationsTotal || Object.values(user.generationsByType || {}).reduce((a,b)=>a+b,0) || 0} ген.</div>
        <div style={{ fontSize: '10px', color: c.text3, marginTop: '4px' }}>{user.updatedAt ? fmtDate(user.updatedAt) : '—'}</div>
      </div>
    </motion.div>
  );
}

// ── User Details Drawer ──
function UserDrawer({ user, onClose, onRefresh }) {
  const { authHeaders } = useAdmin();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Op states
  const [creditsToAdd, setCreditsToAdd] = useState('25');
  const [note, setNote] = useState('');
  const [selectedPlan, setSelectedPlan] = useState('trial');

  const handleOp = async (action, extra = {}) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/user-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ action, identifier: user.uid, note, ...extra }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Ошибка');
      onRefresh(user.uid);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      style={{
        position: 'fixed',
        top: 0, right: 0, bottom: 0,
        width: '100%', maxWidth: '480px',
        background: '#121214',
        borderLeft: `1px solid ${c.border}`,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-10px 0 30px rgba(0,0,0,0.5)'
      }}
    >
      <div style={{ padding: '20px', borderBottom: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: '18px', color: c.text1 }}>Профиль Пользователя</h2>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: c.text3, fontSize: '24px', cursor: 'pointer' }}>×</button>
      </div>

      <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* Basic Info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '12px', color: c.text3 }}>ID: <span style={{ fontFamily: 'monospace', color: c.text1 }}>{user.uid}</span></div>
          {user.telegramId && <div style={{ fontSize: '12px', color: c.text3 }}>TG: <span style={{ fontFamily: 'monospace', color: c.text1 }}>{user.telegramId}</span></div>}
          {user.email && <div style={{ fontSize: '12px', color: c.text3 }}>Email: <span style={{ color: c.text1 }}>{user.email}</span></div>}
          
          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <div style={{ flex: 1, padding: '16px', background: c.surface, borderRadius: '12px', border: `1px solid ${c.border}` }}>
              <div style={{ fontSize: '11px', color: c.text3, textTransform: 'uppercase' }}>Тариф</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: PLAN_COLORS[user.plan] || c.text1, marginTop: '4px' }}>
                {PLAN_LABELS[user.plan] || user.plan || 'None'}
              </div>
            </div>
            <div style={{ flex: 1, padding: '16px', background: c.surface, borderRadius: '12px', border: `1px solid ${c.border}` }}>
              <div style={{ fontSize: '11px', color: c.text3, textTransform: 'uppercase' }}>Кредиты</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: c.cyan, marginTop: '4px' }}>
                {user.credits || 0}
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ padding: '20px', background: 'rgba(129,140,248,0.05)', borderRadius: '16px', border: `1px solid rgba(129,140,248,0.15)` }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: c.violet, marginBottom: '16px' }}>Управление доступом</div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input 
              value={note} onChange={e=>setNote(e.target.value)} 
              placeholder="Заметка (опционально)"
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `1px solid ${c.border}`, background: 'rgba(0,0,0,0.2)', color: c.text1, outline: 'none' }}
            />
            
            <div style={{ display: 'flex', gap: '8px' }}>
              <select value={selectedPlan} onChange={e=>setSelectedPlan(e.target.value)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: `1px solid ${c.border}`, background: 'rgba(0,0,0,0.2)', color: c.text1, outline: 'none' }}>
                <option value="trial">Старт</option>
                <option value="base">Про</option>
                <option value="pro">Бизнес</option>
              </select>
              <button 
                onClick={() => handleOp('grant_plan', { plan: selectedPlan })}
                disabled={loading}
                style={{ padding: '0 16px', borderRadius: '8px', border: 'none', background: c.violet, color: '#fff', fontWeight: 700, cursor: 'pointer' }}
              >
                Выдать тариф
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <input 
                type="number" value={creditsToAdd} onChange={e=>setCreditsToAdd(e.target.value)}
                style={{ flex: 1, padding: '12px', borderRadius: '8px', border: `1px solid ${c.border}`, background: 'rgba(0,0,0,0.2)', color: c.text1, outline: 'none' }}
              />
              <button 
                onClick={() => handleOp('add_credits', { credits: Number(creditsToAdd) })}
                disabled={loading}
                style={{ padding: '0 16px', borderRadius: '8px', border: 'none', background: c.cyan, color: '#000', fontWeight: 700, cursor: 'pointer' }}
              >
                Начислить
              </button>
            </div>
            
            {error && <div style={{ color: c.red, fontSize: '12px', textAlign: 'center' }}>{error}</div>}
          </div>
        </div>

        {/* Generation History (Optional if included in user obj) */}
        {user.generations && Array.isArray(user.generations) && (
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: c.text1, marginBottom: '12px' }}>Последние генерации</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {user.generations.map((gen, i) => (
                <div key={i} style={{ padding: '10px 12px', background: c.surface, borderRadius: '8px', border: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div style={{ fontSize: '14px' }}>{gen.success === false ? '❌' : '✅'}</div>
                    <div>
                      <div style={{ fontSize: '13px', color: c.text1 }}>{gen.type}</div>
                      <div style={{ fontSize: '11px', color: c.text3 }}>{gen.error || gen.promptMeta?.name || '—'}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '11px', color: c.text3 }}>{fmtDate(gen.createdAt)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </motion.div>
  );
}

// ── Main Page ──
export default function UsersCRM() {
  const { authHeaders } = useAdmin();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users?limit=100', { headers: { ...authHeaders } });
      const json = await res.json();
      if (json.ok) setUsers(json.users || []);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  const loadSingleUser = useCallback(async (identifier) => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/user-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ action: 'lookup', identifier }),
      });
      const json = await res.json();
      if (json.ok && json.user) {
        // user-control returns slightly different structure, adapt it:
        const u = json.user;
        const normalized = {
          uid: u.user.uid,
          telegramId: u.user.subscription?.telegramId,
          email: u.user.profile?.email,
          displayName: u.user.profile?.displayName,
          plan: u.user.subscription?.plan || 'none',
          credits: u.user.subscription?.credits || 0,
          updatedAt: u.user.subscription?.updatedAt,
          generations: u.generations || [],
        };
        setSelectedUser(normalized);
      }
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (search.trim()) loadSingleUser(search.trim());
    else loadUsers();
  };

  const filtered = users.filter(u => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      (u.uid && u.uid.toLowerCase().includes(term)) ||
      (u.telegramId && String(u.telegramId).includes(term)) ||
      (u.email && u.email.toLowerCase().includes(term)) ||
      (u.displayName && u.displayName.toLowerCase().includes(term))
    );
  });

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '40px' }}>
      
      {/* Header & Search */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <form onSubmit={handleSearch} style={{ flex: 1, display: 'flex', gap: '8px' }}>
          <input 
            type="text" 
            placeholder="Поиск по Telegram ID, Email или UID..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ 
              flex: 1, padding: '14px 20px', borderRadius: '16px', 
              background: c.surface, border: `1px solid ${c.border}`, 
              color: c.text1, outline: 'none', fontSize: '15px',
              backdropFilter: 'blur(10px)'
            }}
          />
          <button 
            type="submit"
            style={{ 
              padding: '0 24px', borderRadius: '16px', background: c.violet, 
              color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Найти
          </button>
        </form>
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <AnimatePresence>
          {loading ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: 'center', padding: '40px', color: c.text3 }}>Загрузка...</motion.div>
          ) : filtered.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: 'center', padding: '40px', color: c.text3 }}>Ничего не найдено</motion.div>
          ) : (
            filtered.map(user => (
              <UserCard key={user.uid} user={user} onClick={setSelectedUser} />
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Drawer Overlay */}
      <AnimatePresence>
        {selectedUser && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSelectedUser(null)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 90 }}
            />
            <UserDrawer 
              user={selectedUser} 
              onClose={() => setSelectedUser(null)} 
              onRefresh={(uid) => {
                loadSingleUser(uid); // refresh the drawer
                loadUsers();         // refresh the main list
              }}
            />
          </>
        )}
      </AnimatePresence>

    </div>
  );
}
