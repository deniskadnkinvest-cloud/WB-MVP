import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAdmin } from '../AdminApp';

const c = {
  surface: 'rgba(255,255,255,0.03)',
  border: 'rgba(255,255,255,0.08)',
  text1: '#f0f0f5',
  text2: 'rgba(255,255,255,0.5)',
  text3: 'rgba(255,255,255,0.25)',
  accent: '#818cf8',
  green: '#34d399',
  red: '#f87171',
};

const TYPE_LABELS = {
  fashion: 'Одежда', product: 'Товары', quick: 'Быстрая', card: 'Карточка',
  card_edit: 'Правка', photo_edit: 'Фото', ugc: 'UGC', model: 'Модель',
  calibration: 'Калибровка', autocatalog: 'Авто-каталог',
};

const FILTERS = [
  { id: 'all', label: 'Все' },
  { id: 'success', label: '✅ Успешные' },
  { id: 'errors', label: '❌ Ошибки' },
];

const spring = { type: 'spring', stiffness: 400, damping: 25, mass: 0.5 };

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins} мин назад`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ч назад`;
  return `${Math.floor(hrs / 24)} дн назад`;
}

function fmtDuration(ms) {
  if (!ms && ms !== 0) return '';
  if (ms < 1000) return `${ms}мс`;
  return `${(ms / 1000).toFixed(1)}с`;
}

export default function LogTab() {
  const { authHeaders } = useAdmin();
  const [generations, setGenerations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch('/api/admin/generations?limit=50', { headers: { ...authHeaders } })
      .then(r => r.json())
      .then(res => {
        if (res.ok) {
          setGenerations(res.generations || []);
        } else {
          setError(res.error || 'Ошибка загрузки');
        }
      })
      .catch(() => setError('Нет соединения'))
      .finally(() => setLoading(false));
  }, [authHeaders]);

  useEffect(() => { load(); }, [load]);

  const filtered = generations.filter(g => {
    if (filter === 'success') return g.success !== false;
    if (filter === 'errors') return g.success === false;
    return true;
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50vh', gap: '12px' }}>
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
          style={{ width: '24px', height: '24px', borderRadius: '50%', border: `2px solid ${c.border}`, borderTopColor: c.accent }} />
        <span style={{ fontSize: '12px', color: c.text3 }}>Загрузка…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 16px' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚠️</div>
        <p style={{ color: c.text2, fontSize: '14px', margin: '0 0 16px' }}>{error}</p>
        <button onClick={load} style={{
          padding: '8px 20px', borderRadius: '10px', background: 'rgba(129,140,248,0.1)',
          border: '1px solid rgba(129,140,248,0.3)', color: c.accent, cursor: 'pointer',
          fontSize: '13px', fontWeight: 600,
        }}>Повторить</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
        <div style={{ fontSize: '17px', fontWeight: 700, letterSpacing: '-0.3px' }}>
          ⚡ Лог генераций
        </div>
        <button onClick={load} style={{
          background: 'none', border: `1px solid ${c.border}`, borderRadius: '8px',
          color: c.text3, padding: '4px 10px', cursor: 'pointer', fontSize: '14px',
        }}>↻</button>
      </div>

      {/* ── Filter Pills ── */}
      <div style={{ display: 'flex', gap: '6px' }}>
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            style={{
              padding: '6px 12px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              background: filter === f.id ? 'rgba(129,140,248,0.15)' : c.surface,
              color: filter === f.id ? c.accent : c.text2,
              transition: 'all 0.2s',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {f.label}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: '11px', color: c.text3, alignSelf: 'center', fontFeatureSettings: "'tnum'" }}>
          {filtered.length} шт
        </span>
      </div>

      {/* ── Generation List ── */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: c.text3, fontSize: '13px' }}>
          {filter === 'all' ? 'Генераций пока нет' : 'Нет результатов'}
        </div>
      ) : (
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.03 } } }}
          style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
        >
          {filtered.map((gen, i) => {
            const isExpanded = expandedId === (gen.id || i);
            const isSuccess = gen.success !== false;

            return (
              <motion.div
                key={gen.id || i}
                variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
                onClick={() => setExpandedId(isExpanded ? null : (gen.id || i))}
                style={{
                  background: c.surface,
                  border: `1px solid ${c.border}`,
                  borderRadius: '12px',
                  padding: '10px 12px',
                  cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {/* Main row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {/* Status dot */}
                  <div style={{
                    width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                    background: isSuccess ? c.green : c.red,
                    boxShadow: `0 0 6px ${isSuccess ? 'rgba(52,211,153,0.4)' : 'rgba(248,113,113,0.4)'}`,
                  }} />

                  {/* Type label */}
                  <span style={{ fontSize: '13px', fontWeight: 600, color: c.text1 }}>
                    {TYPE_LABELS[gen.type] || gen.type || '—'}
                  </span>

                  <span style={{ color: c.text3, fontSize: '11px' }}>—</span>

                  {/* User ID */}
                  <span style={{ fontSize: '11px', color: c.text2, fontFamily: 'monospace', fontFeatureSettings: "'tnum'" }}>
                    {gen.userId ? (gen.userId.length > 14 ? gen.userId.slice(0, 12) + '…' : gen.userId) : '—'}
                  </span>

                  {/* Duration (right-aligned) */}
                  {isSuccess && gen.durationMs && (
                    <span style={{
                      marginLeft: 'auto', fontSize: '11px', fontWeight: 600,
                      color: c.text2, fontFeatureSettings: "'tnum'",
                    }}>
                      {fmtDuration(gen.durationMs)}
                    </span>
                  )}
                </div>

                {/* Second line: error or time */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', paddingLeft: '16px' }}>
                  {!isSuccess && gen.error && (
                    <span style={{
                      fontSize: '11px', color: c.red, fontWeight: 500,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px',
                    }}>
                      {gen.error}
                    </span>
                  )}
                  {!isSuccess && gen.error && <span style={{ color: c.text3, fontSize: '10px' }}>·</span>}
                  <span style={{ fontSize: '10px', color: c.text3 }}>
                    {timeAgo(gen.createdAt)}
                  </span>
                </div>

                {/* Expanded details */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={spring}
                      style={{ overflow: 'hidden' }}
                    >
                      <div style={{
                        marginTop: '10px',
                        paddingTop: '10px',
                        borderTop: `1px solid ${c.border}`,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        fontSize: '11px',
                      }}>
                        <DetailRow label="User ID" value={gen.userId} />
                        <DetailRow label="Тип" value={TYPE_LABELS[gen.type] || gen.type} />
                        <DetailRow label="Статус" value={isSuccess ? '✅ Успешно' : '❌ Ошибка'} />
                        {gen.durationMs && <DetailRow label="Время" value={fmtDuration(gen.durationMs)} />}
                        {gen.error && <DetailRow label="Ошибка" value={gen.error} color={c.red} />}
                        <DetailRow label="Doc ID" value={gen.id} mono />
                        <DetailRow label="Дата" value={gen.createdAt ? new Date(gen.createdAt).toLocaleString('ru-RU') : '—'} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}

function DetailRow({ label, value, color, mono }) {
  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      <span style={{ color: c.text3, minWidth: '70px', flexShrink: 0 }}>{label}</span>
      <span style={{
        color: color || c.text2,
        wordBreak: 'break-all',
        fontFamily: mono ? 'monospace' : 'inherit',
      }}>
        {value || '—'}
      </span>
    </div>
  );
}
