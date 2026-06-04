import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAdmin } from '../AdminApp';

const PLAN_LABELS = { trial: 'Старт', base: 'Про', pro: 'Бизнес', none: 'Нет' };
const PLAN_COLORS = { trial: '#f59e0b', base: '#3b82f6', pro: '#8b5cf6', none: '#6b7280' };

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

  const activatedDate = user.planActivatedAt
    ? new Date(user.planActivatedAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : '—';

  const expiresDate = user.planExpiresAt
    ? new Date(user.planExpiresAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : null;

  return (
    <motion.div 
      variants={itemVariants}
      whileHover={{ scale: 1.01, backgroundColor: 'rgba(255,255,255,0.03)' }}
      style={{
        padding: '14px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        borderRadius: '12px',
        cursor: 'default',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px',
      }}
    >
      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <div style={{
            width: '8px', height: '8px', borderRadius: '50%',
            background: PLAN_COLORS[user.plan] || '#6b7280',
            boxShadow: `0 0 8px ${PLAN_COLORS[user.plan] || '#6b7280'}`,
            flexShrink: 0,
          }} />
          <span style={{
            fontSize: '12px', fontWeight: 700, letterSpacing: '0.5px',
            color: PLAN_COLORS[user.plan] || '#6b7280', textTransform: 'uppercase'
          }}>
            {PLAN_LABELS[user.plan] || user.plan}
          </span>
        </div>
        <div style={{
          fontFamily: 'monospace', fontSize: '11px', fontWeight: 500,
          color: 'rgba(255,255,255,0.4)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {user.uid}
        </div>
        <div style={{ display: 'flex', gap: '12px', marginTop: '6px', fontSize: '11px', fontWeight: 500 }}>
          <span style={{ color: 'rgba(255,255,255,0.6)' }}>
            💳 {credits}/{user.creditsTotal} кред.
          </span>
          <span style={{ color: 'rgba(255,255,255,0.3)' }}>
            {activatedDate}
            {expiresDate && ` → ${expiresDate}`}
          </span>
        </div>
      </div>

      {/* Refund button */}
      <motion.button
        whileHover={!refunding && !refunded ? { scale: 1.05 } : {}}
        whileTap={!refunding && !refunded ? { scale: 0.95 } : {}}
        onClick={handleRefund}
        disabled={refunding || refunded}
        style={{
          padding: '8px 14px',
          borderRadius: '10px',
          border: '1px solid',
          borderColor: refunded ? '#4ade8044' : 'rgba(139,92,246,0.4)',
          background: refunded ? 'rgba(74,222,128,0.15)' : 'rgba(139,92,246,0.15)',
          color: refunded ? '#4ade80' : '#d8b4fe',
          cursor: refunding || refunded ? 'default' : 'pointer',
          fontSize: '11px',
          fontWeight: 700,
          flexShrink: 0,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          boxShadow: refunded ? '0 0 10px rgba(74,222,128,0.2)' : 'none',
        }}
      >
        {refunded ? '✓ +1 выдан' : refunding ? '...' : '+1 Кредит'}
      </motion.button>
    </motion.div>
  );
}

export default function Users() {
  const { authHeaders } = useAdmin();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filterPlan, setFilterPlan] = useState('all');

  const load = () => {
    setLoading(true);
    fetch('/api/admin/stats', {
      headers: { ...authHeaders },
    })
      .then(r => r.json())
      .then(res => {
        if (res.ok) setUsers(res.data.activeUsersList || []);
        else setError(res.error);
      })
      .catch(() => setError('Ошибка загрузки'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleRefund = async (uid) => {
    const res = await fetch('/api/admin/refund', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({ uid }),
    });
    return res.json();
  };

  const filtered = users.filter(u => {
    const matchSearch = !search || u.uid.toLowerCase().includes(search.toLowerCase());
    const matchPlan = filterPlan === 'all' || u.plan === filterPlan;
    return matchSearch && matchPlan;
  });

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="show"
      style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '20px' }}
    >
      {/* ── Search & Filters ── */}
      <motion.div variants={itemVariants} style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по UID..."
          style={{
            width: '100%', padding: '12px 16px', borderRadius: '16px',
            background: 'linear-gradient(145deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#fff', fontSize: '13px', outline: 'none',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)',
            backdropFilter: 'blur(20px)',
            transition: 'border 0.2s, box-shadow 0.2s',
          }}
          onFocus={e => {
            e.target.style.borderColor = '#8b5cf6';
            e.target.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.2)';
          }}
          onBlur={e => {
            e.target.style.borderColor = 'rgba(255,255,255,0.1)';
            e.target.style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.2)';
          }}
        />
        
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: '4px' }}>
          {[
            { id: 'all', label: 'Все планы' },
            { id: 'trial', label: '🎯 Старт' },
            { id: 'base', label: '⚡ Про' },
            { id: 'pro', label: '🚀 Бизнес' },
          ].map(f => (
            <motion.button
              key={f.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => setFilterPlan(f.id)}
              style={{
                padding: '8px 16px', borderRadius: '12px', fontSize: '12px',
                fontWeight: filterPlan === f.id ? 700 : 500,
                background: filterPlan === f.id ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${filterPlan === f.id ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.05)'}`,
                color: filterPlan === f.id ? '#d8b4fe' : 'rgba(255,255,255,0.4)',
                cursor: 'pointer', transition: 'all 0.2s',
                whiteSpace: 'nowrap'
              }}
            >
              {f.label}
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* ── Content ── */}
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
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={load} style={{
            marginTop: '12px', padding: '8px 20px', borderRadius: '10px',
            background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.4)',
            color: '#d8b4fe', cursor: 'pointer', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase'
          }}>Повторить</motion.button>
        </Card>
      ) : (
        <Card style={{ padding: '8px 16px' }}>
          <div style={{ padding: '12px 0 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>
              {filtered.length} из {users.length} активных
            </span>
            <motion.button 
              whileTap={{ scale: 0.9 }}
              onClick={load} style={{
              padding: '6px 12px', borderRadius: '8px',
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '12px',
            }}>↻</motion.button>
          </div>

          <motion.div variants={containerVariants} initial="hidden" animate="show">
            <AnimatePresence>
              {filtered.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', padding: '40px 0', fontSize: '13px', fontWeight: 500 }}>
                  Пользователи не найдены
                </p>
              ) : (
                filtered.map(u => (
                  <UserRow key={u.uid} user={u} onRefund={handleRefund} />
                ))
              )}
            </AnimatePresence>
          </motion.div>
        </Card>
      )}
    </motion.div>
  );
}
