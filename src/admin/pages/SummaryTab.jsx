import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAdmin } from '../AdminApp';

// ── Design tokens ──
const c = {
  surface: 'rgba(255,255,255,0.03)',
  border: 'rgba(255,255,255,0.08)',
  text1: '#f0f0f5',
  text2: 'rgba(255,255,255,0.5)',
  text3: 'rgba(255,255,255,0.25)',
  violet: '#818cf8',
  green: '#34d399',
  red: '#f87171',
  amber: '#fbbf24',
  cyan: '#22d3ee',
};

const spring = { type: 'spring', stiffness: 400, damping: 25, mass: 0.5 };

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const cardVariant = {
  hidden: { opacity: 0, y: 18, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1, transition: spring },
};

// ── Helpers ──

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins} мин назад`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ч назад`;
  return `${Math.floor(hrs / 24)} дн назад`;
}

const PLAN_NAMES = { trial: 'Старт', base: 'Про', pro: 'Бизнес' };

// ── Metric Card ──

function MetricCard({ icon, label, value, accent }) {
  return (
    <motion.div
      variants={cardVariant}
      whileTap={{ scale: 0.97 }}
      style={{
        background: c.surface,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: `1px solid ${c.border}`,
        borderRadius: '16px',
        padding: '16px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        position: 'relative',
        overflow: 'hidden',
        minHeight: '82px',
      }}
    >
      {/* Subtle glow */}
      <div style={{
        position: 'absolute',
        top: '-20px',
        right: '-20px',
        width: '60px',
        height: '60px',
        borderRadius: '50%',
        background: accent,
        opacity: 0.06,
        filter: 'blur(20px)',
        pointerEvents: 'none',
      }} />

      <div style={{
        fontSize: '10px',
        color: c.text3,
        letterSpacing: '0.8px',
        textTransform: 'uppercase',
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
      }}>
        <span style={{ fontSize: '12px' }}>{icon}</span>
        {label}
      </div>

      <div style={{
        fontSize: '32px',
        fontWeight: 700,
        letterSpacing: '-1.5px',
        lineHeight: 1,
        color: accent,
        fontFeatureSettings: "'tnum'",
        fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        {value}
      </div>
    </motion.div>
  );
}

// ── Event Row ──

function EventRow({ event, style }) {
  const isGrant = event._type === 'grant';
  const planName = PLAN_NAMES[event.planId] || event.planId || '—';
  const uid = event.uid ? event.uid.slice(0, 10) + '…' : '—';

  return (
    <motion.div
      variants={cardVariant}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 0',
        borderBottom: `1px solid rgba(255,255,255,0.04)`,
        ...style,
      }}
    >
      {/* Emoji indicator */}
      <div style={{
        width: '28px',
        height: '28px',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '14px',
        background: isGrant ? 'rgba(52,211,153,0.08)' : 'rgba(129,140,248,0.08)',
        border: `1px solid ${isGrant ? 'rgba(52,211,153,0.15)' : 'rgba(129,140,248,0.15)'}`,
        flexShrink: 0,
      }}>
        {isGrant ? '🎁' : '🟢'}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '13px',
          fontWeight: 600,
          color: c.text1,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          {planName}
          {event.stars != null && (
            <span style={{
              fontSize: '12px',
              fontWeight: 700,
              color: isGrant ? c.green : c.amber,
              fontFeatureSettings: "'tnum'",
            }}>
              {event.stars} ⭐
            </span>
          )}
        </div>
        <div style={{
          fontSize: '10px',
          color: c.text3,
          fontFamily: 'monospace',
          marginTop: '2px',
        }}>
          {uid}
        </div>
      </div>

      {/* Time */}
      <div style={{
        fontSize: '10px',
        color: c.text3,
        fontWeight: 500,
        flexShrink: 0,
        textAlign: 'right',
      }}>
        {event.date ? timeAgo(event.date) : '—'}
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════
//  SummaryTab — главная вкладка дашборда
// ═══════════════════════════════════════════

export default function SummaryTab() {
  const { authHeaders } = useAdmin();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    setLoading(prev => !data ? true : prev);
    setRefreshing(true);
    setError(null);
    fetch('/api/admin/stats', { headers: { ...authHeaders } })
      .then(r => r.json())
      .then(res => {
        if (res.ok) setData(res.data);
        else setError(res.error || 'Ошибка загрузки');
      })
      .catch(() => setError('Нет соединения'))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, [authHeaders, data]);

  useEffect(() => { load(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Loading State ──
  if (loading && !data) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '60vh',
        gap: '14px',
      }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            border: `2px solid ${c.border}`,
            borderTopColor: c.violet,
          }}
        />
        <span style={{ fontSize: '12px', color: c.text3, fontWeight: 500 }}>
          Загрузка…
        </span>
      </div>
    );
  }

  // ── Error State ──
  if (error && !data) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '50vh',
        gap: '16px',
        padding: '0 24px',
      }}>
        <div style={{ fontSize: '32px' }}>⚠️</div>
        <div style={{ fontSize: '14px', color: c.text2, textAlign: 'center' }}>
          {error}
        </div>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={load}
          style={{
            padding: '10px 28px',
            borderRadius: '12px',
            background: 'rgba(129,140,248,0.1)',
            border: '1px solid rgba(129,140,248,0.25)',
            color: c.violet,
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 600,
            outline: 'none',
          }}
        >
          Повторить
        </motion.button>
      </div>
    );
  }

  // ── Destructure data ──
  const {
    totalUsers = 0,
    activeUsers = 0,
    generationsTotal = 0,
    generationsToday = 0,
    starsToday = 0,
    starsTotal = 0,
    recentPayments = [],
    recentAdminGrants = [],
    generatedAt,
  } = data || {};

  const errorsCount = 0; // API пока не отдаёт ошибки отдельно
  const successCount = generationsTotal;

  const syncTime = generatedAt
    ? new Date(generatedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : '—';

  // ── Build events timeline ──
  const events = [
    ...recentPayments.map(p => ({ ...p, _type: 'payment' })),
    ...recentAdminGrants.map(g => ({ ...g, _type: 'grant' })),
  ]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 8);

  // ── Metric cards config ──
  const cards = [
    { icon: '⭐', label: 'Доход (Сегодня / Всего)', value: `${starsToday} / ${starsTotal} ⭐`, accent: c.amber },
    { icon: '👥', label: 'Пользователи (Активные / Всего)', value: `${activeUsers} / ${totalUsers}`, accent: c.violet },
    { icon: '⚡', label: 'Генерации (Сегодня / Всего)', value: `${generationsToday} / ${generationsTotal}`, accent: c.cyan },
  ];

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        maxWidth: '480px',
        margin: '0 auto',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >

      {/* ═══ Status Bar ═══ */}
      <motion.div
        variants={cardVariant}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderRadius: '12px',
          background: 'rgba(52,211,153,0.04)',
          border: '1px solid rgba(52,211,153,0.1)',
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '11px',
          color: c.text2,
          fontWeight: 500,
        }}>
          <div style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: c.green,
            boxShadow: '0 0 8px rgba(52,211,153,0.5)',
          }} />
          <span>Обновлено: {syncTime}</span>
          {error && <span style={{ color: c.amber, fontSize: '10px' }}> · {error}</span>}
        </div>

        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={load}
          disabled={refreshing}
          style={{
            width: '30px',
            height: '30px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${c.border}`,
            color: refreshing ? c.text3 : c.text2,
            cursor: refreshing ? 'default' : 'pointer',
            fontSize: '14px',
            outline: 'none',
            padding: 0,
          }}
        >
          <motion.span
            animate={refreshing ? { rotate: 360 } : { rotate: 0 }}
            transition={refreshing ? { repeat: Infinity, duration: 0.8, ease: 'linear' } : spring}
          >
            ↻
          </motion.span>
        </motion.button>
      </motion.div>

      {/* ═══ 3 Metric Cards (1 column) ═══ */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr',
        gap: '10px',
      }}>
        {cards.map((card, i) => (
          <MetricCard
            key={i}
            icon={card.icon}
            label={card.label}
            value={card.value}
            accent={card.accent}
          />
        ))}
      </div>

      {/* ═══ Recent Events Feed ═══ */}
      <motion.div
        variants={cardVariant}
        style={{
          background: c.surface,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: `1px solid ${c.border}`,
          borderRadius: '16px',
          padding: '16px',
        }}
      >
        <div style={{
          fontSize: '10px',
          color: c.text3,
          textTransform: 'uppercase',
          letterSpacing: '1px',
          fontWeight: 600,
          marginBottom: '8px',
        }}>
          Последние события
        </div>

        {events.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '24px 0',
            color: c.text3,
            fontSize: '13px',
          }}>
            Событий пока нет
          </div>
        ) : (
          <AnimatePresence>
            {events.map((event, i) => (
              <EventRow
                key={`${event._type}-${event.uid}-${event.date}-${i}`}
                event={event}
                style={i === events.length - 1 ? { borderBottom: 'none' } : {}}
              />
            ))}
          </AnimatePresence>
        )}
      </motion.div>

    </motion.div>
  );
}
