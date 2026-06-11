import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAdmin } from '../AdminApp';

// ── Design tokens ──
const c = {
  surface: 'rgba(255,255,255,0.03)',
  border: 'rgba(255,255,255,0.06)',
  text1: '#e8e8ed',
  text2: 'rgba(255,255,255,0.5)',
  text3: 'rgba(255,255,255,0.25)',
  accent: '#818cf8',
  green: '#34d399',
  amber: '#fbbf24',
  red: '#f87171',
  cyan: '#22d3ee',
};

const stagger = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const fadeUp = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] } } };

function Metric({ label, value, sub, color }) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: c.text3, letterSpacing: '0.8px', textTransform: 'uppercase', fontWeight: 600, marginBottom: '6px' }}>
        {label}
      </div>
      <div style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-1.5px', lineHeight: 1, color: color || c.text1, fontFeatureSettings: "'tnum'" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: '11px', color: c.text3, marginTop: '4px', fontWeight: 500 }}>{sub}</div>}
    </div>
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

function Section({ title, children, style = {} }) {
  return (
    <motion.div variants={fadeUp} style={{
      background: c.surface, border: `1px solid ${c.border}`, borderRadius: '16px', padding: '20px', ...style,
    }}>
      {title && <div style={{ fontSize: '11px', color: c.text3, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, marginBottom: '16px' }}>{title}</div>}
      {children}
    </motion.div>
  );
}

function HealthDot({ ok, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{
        width: '6px', height: '6px', borderRadius: '50%',
        background: ok ? c.green : c.red,
        boxShadow: `0 0 6px ${ok ? 'rgba(52,211,153,0.5)' : 'rgba(248,113,113,0.5)'}`,
      }} />
      <span style={{ fontSize: '11px', color: c.text2, fontWeight: 500 }}>{label}</span>
    </div>
  );
}

function PlanBar({ planCounts }) {
  const total = (planCounts.trial || 0) + (planCounts.base || 0) + (planCounts.pro || 0) || 1;
  const plans = [
    { id: 'pro', label: 'Бизнес', color: '#818cf8' },
    { id: 'base', label: 'Про', color: '#0ea5e9' },
    { id: 'trial', label: 'Старт', color: '#fbbf24' },
  ];
  return (
    <div>
      <div style={{ display: 'flex', height: '4px', borderRadius: '4px', overflow: 'hidden', gap: '2px', background: 'rgba(255,255,255,0.04)' }}>
        {plans.map(p => {
          const w = ((planCounts[p.id] || 0) / total) * 100;
          if (!w) return null;
          return <div key={p.id} style={{ width: `${w}%`, background: p.color, borderRadius: '4px', transition: 'width 0.6s ease' }} />;
        })}
      </div>
      <div style={{ display: 'flex', gap: '14px', marginTop: '10px' }}>
        {plans.map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: p.color }} />
            <span style={{ fontSize: '11px', color: c.text2 }}>
              {p.label} <span style={{ color: c.text1, fontWeight: 600 }}>{planCounts[p.id] || 0}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ModeBar({ modes }) {
  const total = (modes.fashion || 0) + (modes.product || 0) + (modes.calibration || 0) || 1;
  const items = [
    { id: 'fashion', label: 'Fashion', color: '#818cf8', count: modes.fashion || 0 },
    { id: 'product', label: 'Товарка', color: '#22d3ee', count: modes.product || 0 },
    { id: 'calibration', label: 'Калибровка', count: modes.calibration || 0, color: '#fbbf24' },
  ];
  return (
    <div>
      <div style={{ display: 'flex', height: '4px', borderRadius: '4px', overflow: 'hidden', gap: '2px', background: 'rgba(255,255,255,0.04)' }}>
        {items.map(m => {
          const w = (m.count / total) * 100;
          if (!w) return null;
          return <div key={m.id} style={{ width: `${w}%`, background: m.color, borderRadius: '4px' }} />;
        })}
      </div>
      <div style={{ display: 'flex', gap: '14px', marginTop: '10px' }}>
        {items.map(m => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: m.color }} />
            <span style={{ fontSize: '11px', color: c.text2 }}>
              {m.label} <span style={{ color: c.text1, fontWeight: 600 }}>{m.count}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaymentRow({ p }) {
  const d = new Date(p.date);
  const time = `${d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })} ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  const planNames = { trial: 'Старт', base: 'Про', pro: 'Бизнес' };
  const isTest = p.isTest === true;
  const isGrant = p.isGrant === true;

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
        <div style={{ fontSize: '10px', color: c.text3, fontFamily: 'monospace', marginTop: '2px' }}>{p.uid?.slice(0, 14)}…</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: isGrant ? c.green : isTest ? c.text3 : c.green, fontFeatureSettings: "'tnum'" }}>
          {p.stars ? `${isGrant ? '🎁' : '+'} ${p.stars} ⭐` : '—'}
        </div>
        <div style={{ fontSize: '10px', color: c.text3, marginTop: '1px' }}>{time}</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { authHeaders } = useAdmin();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showTest, setShowTest] = useState(false);
  const [loadTime, setLoadTime] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const t0 = Date.now();
    fetch('/api/admin/stats', { headers: { ...authHeaders } })
      .then(r => r.json())
      .then(res => {
        setLoadTime(Date.now() - t0);
        res.ok ? setData(res.data) : setError(res.error || 'Ошибка');
      })
      .catch(() => setError('Нет соединения'))
      .finally(() => setLoading(false));
  }, [authHeaders]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50vh', gap: '12px' }}>
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          style={{ width: '24px', height: '24px', borderRadius: '50%', border: `2px solid ${c.border}`, borderTopColor: c.accent }} />
        <span style={{ fontSize: '11px', color: c.text3 }}>Загрузка данных…</span>
      </div>
    );
  }

  if (error) {
    return (
      <Section style={{ textAlign: 'center', padding: '40px 20px' }}>
        <p style={{ color: c.text2, margin: '0 0 16px', fontSize: '14px' }}>{error}</p>
        <button onClick={load} style={{ padding: '8px 20px', borderRadius: '8px', background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.3)', color: c.accent, cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
          Повторить
        </button>
      </Section>
    );
  }

  const {
    totalUsers = 0, activeUsers = 0, planCounts = {}, conversionRate = 0,
    starsTotal = 0, starsWeek = 0, starsToday = 0, revenueByPlan = {},
    realPaymentsCount = 0, testPaymentsCount = 0, adminGrantsCount = 0, grantedCreditsTotal = 0,
    recentPayments = [], recentTestPayments = [], recentAdminGrants = [],
    generationsTotal = 0, generationsToday = 0, generationsFromCredits = 0,
    generationsLogCount = 0,
    generationsByMode = {},
    botStatus = 'not_configured', botUsername = null,
    botActivations = 0, botActivationsToday = 0,
    generatedAt,
  } = data || {};

  const gens = generationsLogCount || generationsTotal || generationsFromCredits;
  const syncTime = generatedAt ? new Date(generatedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* ── System Status Bar ── */}
      <motion.div variants={fadeUp} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px', borderRadius: '12px',
        background: botStatus === 'error' ? 'rgba(248,113,113,0.04)' : 'rgba(52,211,153,0.04)',
        border: botStatus === 'error' ? '1px solid rgba(248,113,113,0.15)' : '1px solid rgba(52,211,153,0.1)',
      }}>
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
          <HealthDot ok={true} label="Vercel" />
          <HealthDot ok={true} label="Firebase" />
          <HealthDot ok={true} label="Inngest" />
          <HealthDot ok={true} label="KIE.ai" />
          <HealthDot ok={botStatus === 'active'} label={botStatus === 'active' ? `@${botUsername}` : botStatus === 'not_configured' ? 'Бот: нет API токена' : 'Бот: ошибка ключа'} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {loadTime && <span style={{ fontSize: '9px', color: c.text3, fontFamily: 'monospace' }}>{loadTime}ms</span>}
          <button onClick={load} style={{
            padding: '3px 8px', borderRadius: '6px', fontSize: '12px', background: 'transparent',
            border: `1px solid ${c.border}`, color: c.text3, cursor: 'pointer',
          }}>↻</button>
        </div>
      </motion.div>

      {/* Warning if bot token is broken */}
      {botStatus === 'error' && (
        <motion.div variants={fadeUp} style={{
          padding: '12px 16px', borderRadius: '12px',
          background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)',
          color: c.red, fontSize: '13px', fontWeight: 600
        }}>
          ⚠️ Внимание: TELEGRAM_BOT_TOKEN невалиден или не настроен. Рассылки не будут отправляться.
        </motion.div>
      )}

      {/* ── Top Metrics 2×2 ── */}
      <motion.div variants={fadeUp} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <Section>
          <Metric label="Генерации" value={gens} sub={generationsToday > 0 ? `+${generationsToday} сегодня` : `всего (логов: ${generationsLogCount})`} color={c.accent} />
        </Section>
        <Section>
          <Metric label="Пользователи" value={totalUsers} sub={`${activeUsers} активных · ${conversionRate}%`} />
        </Section>
      </motion.div>

      {/* ── Generations by Mode ── */}
      {(generationsByMode.fashion || generationsByMode.product || generationsByMode.calibration) > 0 && (
        <Section title="Режимы генераций">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '14px' }}>
            <SmallMetric label="Fashion" value={generationsByMode.fashion || 0} color={c.accent} />
            <SmallMetric label="Товарка" value={generationsByMode.product || 0} color={c.cyan} />
            <SmallMetric label="Калибровка" value={generationsByMode.calibration || 0} color={c.amber} />
          </div>
          <ModeBar modes={generationsByMode} />
        </Section>
      )}

      {/* ── Bot Activity ── */}
      <Section title="Бот">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '10px', color: c.text3, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600, marginBottom: '4px' }}>Активации</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: c.text1, fontFeatureSettings: "'tnum'" }}>{botActivations}</div>
            {botActivationsToday > 0 && <div style={{ fontSize: '11px', color: c.green, marginTop: '3px' }}>+{botActivationsToday} сегодня</div>}
          </div>
          <div>
            <div style={{ fontSize: '10px', color: c.text3, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600, marginBottom: '4px' }}>Конверсия в подписку</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: conversionRate > 50 ? c.green : conversionRate > 20 ? c.amber : c.red, fontFeatureSettings: "'tnum'" }}>{conversionRate}%</div>
          </div>
        </div>
      </Section>

      {/* ── Revenue ── */}
      <Section title="Выручка (реальные оплаты)">
        {realPaymentsCount === 0 ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ fontSize: '13px', color: c.text2 }}>Реальных оплат пока нет</div>
            {testPaymentsCount > 0 && <div style={{ fontSize: '11px', color: c.text3, marginTop: '4px' }}>Тестовых: {testPaymentsCount}</div>}
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '16px' }}>
              <SmallMetric label="Всего" value={`${starsTotal} ⭐`} color={c.green} />
              <SmallMetric label="Неделя" value={`${starsWeek} ⭐`} color={c.accent} />
              <SmallMetric label="Сегодня" value={`${starsToday} ⭐`} color={c.cyan} />
            </div>
            {/* Revenue by plan */}
            <div style={{ fontSize: '10px', color: c.text3, textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 600, marginBottom: '8px' }}>По тарифам</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              <SmallMetric label="Старт" value={revenueByPlan.trial || 0} color="#fbbf24" />
              <SmallMetric label="Про" value={revenueByPlan.base || 0} color="#0ea5e9" />
              <SmallMetric label="Бизнес" value={revenueByPlan.pro || 0} color="#818cf8" />
            </div>
          </>
        )}
      </Section>

      {/* ── Plans Distribution ── */}
      <Section title="Тарифы">
        <div style={{ display: 'flex', gap: '24px', marginBottom: '16px' }}>
          <Metric label="С подпиской" value={activeUsers} color={c.accent} />
          <Metric label="Без подписки" value={planCounts.none || (totalUsers - activeUsers)} />
        </div>
        <PlanBar planCounts={planCounts} />
      </Section>

      {/* ── Admin Grants ── */}
      {adminGrantsCount > 0 && (
        <Section title={`Выданный доступ (${adminGrantsCount})`}>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '10px', color: c.text3, letterSpacing: '0.5px', fontWeight: 600, marginBottom: '4px' }}>КРЕДИТОВ ВЫДАНО</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: c.green, fontFeatureSettings: "'tnum'" }}>🎁 {grantedCreditsTotal}</div>
            </div>
          </div>
          {recentAdminGrants.slice(0, 3).map((p, i) => <PaymentRow key={`g${i}`} p={p} />)}
        </Section>
      )}

      {/* ── Recent Transactions ── */}
      <Section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ fontSize: '11px', color: c.text3, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>
            Последние оплаты
          </div>
          <div style={{ display: 'flex', gap: '5px' }}>
            {testPaymentsCount > 0 && (
              <button onClick={() => setShowTest(!showTest)} style={{
                padding: '3px 7px', borderRadius: '6px', fontSize: '10px', fontWeight: 600,
                background: showTest ? 'rgba(251,191,36,0.1)' : 'transparent',
                border: `1px solid ${showTest ? 'rgba(251,191,36,0.3)' : c.border}`,
                color: showTest ? c.amber : c.text3, cursor: 'pointer',
              }}>
                Тест ({testPaymentsCount})
              </button>
            )}
          </div>
        </div>

        {recentPayments.length === 0 && !showTest ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: c.text3, fontSize: '13px' }}>Нет оплат</div>
        ) : (
          <>
            {recentPayments.slice(0, 6).map((p, i) => <PaymentRow key={`r${i}`} p={p} />)}
            {showTest && recentTestPayments.length > 0 && (
              <>
                <div style={{ margin: '10px 0 6px', padding: '5px', borderRadius: '6px', background: 'rgba(251,191,36,0.05)', border: '1px dashed rgba(251,191,36,0.15)', fontSize: '10px', color: c.amber, textAlign: 'center', fontWeight: 600 }}>
                  Тестовые — не учитываются
                </div>
                {recentTestPayments.slice(0, 5).map((p, i) => <PaymentRow key={`t${i}`} p={p} />)}
              </>
            )}
          </>
        )}
      </Section>

      {/* ── Sync info ── */}
      <motion.div variants={fadeUp} style={{ textAlign: 'center', padding: '8px 0', fontSize: '10px', color: c.text3 }}>
        Синхронизация: {syncTime}
      </motion.div>
    </motion.div>
  );
}
