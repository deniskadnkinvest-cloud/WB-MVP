import React, { useState, useEffect } from 'react';
import { useAdmin } from '../AdminApp';

const PLAN_LABELS = { trial: '🎯 Тест-драйв', base: '⚡ Про', pro: '🚀 Бизнес', none: '— Нет' };
const PLAN_COLORS = { trial: '#f59e0b', base: '#3b82f6', pro: '#8b5cf6', none: '#6b7280' };

function Card({ children, style = {} }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '16px',
      padding: '16px',
      ...style,
    }}>
      {children}
    </div>
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
    <div style={{
      padding: '12px 0',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <div style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: PLAN_COLORS[user.plan] || '#6b7280',
              flexShrink: 0,
            }} />
            <span style={{
              fontSize: '11px', fontWeight: 600, letterSpacing: '0.3px',
              color: PLAN_COLORS[user.plan] || '#6b7280',
            }}>
              {PLAN_LABELS[user.plan] || user.plan}
            </span>
          </div>
          <div style={{
            fontFamily: 'monospace', fontSize: '11px',
            color: 'rgba(255,255,255,0.4)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {user.uid}
          </div>
          <div style={{ display: 'flex', gap: '12px', marginTop: '6px' }}>
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
              💳 {credits}/{user.creditsTotal} кред.
            </span>
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>
              с {activatedDate}
              {expiresDate && ` → ${expiresDate}`}
            </span>
          </div>
        </div>

        {/* Refund button */}
        <button
          onClick={handleRefund}
          disabled={refunding || refunded}
          style={{
            padding: '6px 12px',
            borderRadius: '8px',
            border: '1px solid',
            borderColor: refunded ? '#4ade8044' : 'rgba(139,92,246,0.4)',
            background: refunded ? 'rgba(74,222,128,0.1)' : 'rgba(139,92,246,0.1)',
            color: refunded ? '#4ade80' : '#8b5cf6',
            cursor: refunding ? 'not-allowed' : 'pointer',
            fontSize: '12px',
            fontWeight: 600,
            flexShrink: 0,
            transition: 'all 0.2s',
            opacity: refunding ? 0.6 : 1,
          }}
        >
          {refunded ? '✓ +1' : refunding ? '...' : '+1 кред'}
        </button>
      </div>
    </div>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '8px' }}>

      {/* Search + Filter */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по UID..."
          style={{
            flex: 1, padding: '9px 12px', borderRadius: '10px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#fff', fontSize: '13px', outline: 'none',
          }}
        />
        <select
          value={filterPlan}
          onChange={e => setFilterPlan(e.target.value)}
          style={{
            padding: '9px 10px', borderRadius: '10px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#fff', fontSize: '12px', outline: 'none', cursor: 'pointer',
          }}
        >
          <option value="all">Все планы</option>
          <option value="trial">Тест-драйв</option>
          <option value="base">Про</option>
          <option value="pro">Бизнес</option>
        </select>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '40px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '50%',
            border: '3px solid rgba(139,92,246,0.2)',
            borderTop: '3px solid #8b5cf6',
            animation: 'spin 0.8s linear infinite',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : error ? (
        <Card style={{ textAlign: 'center' }}>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>{error}</p>
          <button onClick={load} style={{
            marginTop: '8px', padding: '6px 16px', borderRadius: '8px',
            background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.4)',
            color: '#8b5cf6', cursor: 'pointer', fontSize: '12px',
          }}>Повторить</button>
        </Card>
      ) : (
        <Card style={{ padding: '0 16px' }}>
          <div style={{ padding: '12px 0 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
              {filtered.length} из {users.length} пользователей
            </span>
            <button onClick={load} style={{
              padding: '4px 10px', borderRadius: '6px',
              background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '11px',
            }}>↻</button>
          </div>

          {filtered.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', padding: '20px 0', fontSize: '13px' }}>
              Пользователи не найдены
            </p>
          ) : (
            filtered.map(u => (
              <UserRow key={u.uid} user={u} onRefund={handleRefund} />
            ))
          )}
        </Card>
      )}
    </div>
  );
}
