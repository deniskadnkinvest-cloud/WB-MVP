import React, { useState } from 'react';
import { motion } from 'framer-motion';
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
  red: '#f87171',
};

const stagger = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } };
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

function ServiceStatus({ name, url, status }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px', borderRadius: '12px',
      background: 'rgba(255,255,255,0.02)', border: `1px solid ${c.border}`,
      textDecoration: 'none', transition: 'background 0.15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '8px', height: '8px', borderRadius: '50%',
          background: status === 'ok' ? c.green : status === 'warn' ? c.amber : c.red,
          boxShadow: `0 0 6px ${status === 'ok' ? 'rgba(52,211,153,0.5)' : status === 'warn' ? 'rgba(251,191,36,0.5)' : 'rgba(248,113,113,0.5)'}`,
        }} />
        <span style={{ fontSize: '13px', fontWeight: 600, color: c.text1 }}>{name}</span>
      </div>
      <span style={{ color: c.text3, fontSize: '14px' }}>↗</span>
    </a>
  );
}

const LINKS = [
  { name: 'Vercel Logs', url: 'https://vercel.com/dashboard', status: 'ok', desc: 'Логи функций, ошибки генераций' },
  { name: 'Firebase Console', url: 'https://console.firebase.google.com', status: 'ok', desc: 'Firestore, Auth, Storage' },
  { name: 'Inngest Dashboard', url: 'https://app.inngest.com', status: 'ok', desc: 'Очередь задач, ретраи' },
  { name: 'KIE.ai Dashboard', url: 'https://kie.ai', status: 'ok', desc: 'API usage, rate limits' },
];

const ROADMAP = [
  { icon: '📊', text: 'Live Error Rate — процент ошибок за час', phase: 'Supabase' },
  { icon: '💸', text: 'Waste Analytics — деньги на таймаутах', phase: 'Supabase' },
  { icon: '🧠', text: 'AI QA Board — фото с низким quality score', phase: 'Supabase' },
  { icon: '🚨', text: 'Auto-alerts — уведомления при спайке ошибок', phase: 'Inngest Cron' },
  { icon: '📋', text: 'Generation X-Ray — детальный журнал генераций', phase: 'Supabase' },
  { icon: '💰', text: 'FinOps — CPG, Cost Breakdown, Waste', phase: 'Supabase' },
  { icon: '🔄', text: 'Webhook Reconciliation — сверка платежей', phase: 'Supabase' },
  { icon: '🎯', text: 'LLM-Judge Drift Monitor', phase: 'Phase 3' },
];

const ARCHITECTURE = [
  { step: '0', label: 'Прозрение', desc: 'Sentry + Vercel Axiom + TG алерты', status: 'partial', items: ['TG алерты ✅', 'Sentry — не подключён', 'Axiom — не подключён'] },
  { step: '1', label: 'Сбор данных', desc: 'Supabase + waitUntil() + логирование', status: 'pending', items: ['Supabase — не развёрнут', 'waitUntil() — не внедрён', 'generation_logs — нет'] },
  { step: '2', label: 'Command Center', desc: 'Next.js + Shadcn + Tremor админка', status: 'current', items: ['Inline-админка (текущая) ✅', 'Отдельный проект — нет'] },
  { step: '3', label: 'AI-Автоматизация', desc: 'Auto-refunds, QA, Abuse throttling', status: 'pending', items: ['Hallucination Board — нет', 'Auto-refunds — нет'] },
];

export default function Errors() {
  const [expandedPhase, setExpandedPhase] = useState(null);

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* ── Service Status ── */}
      <Section title="Статус сервисов">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {LINKS.map(link => (
            <ServiceStatus key={link.name} {...link} />
          ))}
        </div>
      </Section>

      {/* ── Architecture Phases ── */}
      <Section title="Архитектурный план (Deep Think)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {ARCHITECTURE.map((phase, i) => {
            const isExpanded = expandedPhase === i;
            const statusColors = { partial: c.amber, pending: c.text3, current: c.accent, done: c.green };
            const statusLabels = { partial: 'Частично', pending: 'Ожидает', current: 'Текущая', done: 'Готово' };

            return (
              <div key={i}>
                <button onClick={() => setExpandedPhase(isExpanded ? null : i)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px', borderRadius: '12px',
                  background: isExpanded ? 'rgba(129,140,248,0.06)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${isExpanded ? 'rgba(129,140,248,0.15)' : c.border}`,
                  cursor: 'pointer', textAlign: 'left',
                }}>
                  <div style={{
                    width: '24px', height: '24px', borderRadius: '8px', flexShrink: 0,
                    background: `${statusColors[phase.status]}22`,
                    border: `1px solid ${statusColors[phase.status]}44`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '11px', fontWeight: 800, color: statusColors[phase.status],
                  }}>{phase.step}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: c.text1 }}>{phase.label}</div>
                    <div style={{ fontSize: '10px', color: c.text3, marginTop: '2px' }}>{phase.desc}</div>
                  </div>
                  <span style={{
                    fontSize: '9px', padding: '2px 6px', borderRadius: '99px',
                    background: `${statusColors[phase.status]}15`,
                    color: statusColors[phase.status], fontWeight: 700, letterSpacing: '0.3px',
                  }}>{statusLabels[phase.status]}</span>
                </button>
                {isExpanded && (
                  <div style={{ padding: '8px 16px 4px 48px' }}>
                    {phase.items.map((item, j) => (
                      <div key={j} style={{ fontSize: '11px', color: c.text2, padding: '3px 0', lineHeight: 1.5 }}>
                        • {item}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* ── Roadmap ── */}
      <Section title="В разработке" style={{ opacity: 0.8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {ROADMAP.map((item, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '10px 12px', borderRadius: '10px',
              background: 'rgba(255,255,255,0.02)', border: `1px dashed ${c.border}`,
            }}>
              <span style={{ fontSize: '14px' }}>{item.icon}</span>
              <span style={{ fontSize: '12px', color: c.text2, flex: 1, lineHeight: 1.4 }}>{item.text}</span>
              <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '99px', background: 'rgba(129,140,248,0.1)', color: c.accent, fontWeight: 600, letterSpacing: '0.3px', flexShrink: 0 }}>
                {item.phase}
              </span>
            </div>
          ))}
        </div>
      </Section>
    </motion.div>
  );
}
