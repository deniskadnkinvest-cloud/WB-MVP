import React from 'react';
import { motion } from 'framer-motion';

const c = {
  surface: 'rgba(255,255,255,0.03)',
  border: 'rgba(255,255,255,0.06)',
  text1: '#e8e8ed',
  text2: 'rgba(255,255,255,0.5)',
  text3: 'rgba(255,255,255,0.25)',
  accent: '#818cf8',
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

const LINKS = [
  { icon: '⚡', title: 'Vercel Logs', desc: 'Логи serverless-функций, ошибки генераций', url: 'https://vercel.com/dashboard', color: '#f59e0b' },
  { icon: '🔥', title: 'Firebase Console', desc: 'Пользователи, Firestore, Storage', url: 'https://console.firebase.google.com', color: '#f97316' },
  { icon: '🔄', title: 'Inngest', desc: 'Очередь задач, ретраи, мониторинг генераций', url: 'https://app.inngest.com', color: '#818cf8' },
  { icon: '🤖', title: 'KIE.ai', desc: 'API usage и rate limits модели', url: 'https://kie.ai', color: '#0ea5e9' },
];

const ROADMAP = [
  { icon: '📊', text: 'Live Error Rate — процент ошибок за час' },
  { icon: '💸', text: 'Waste Analytics — деньги, потерянные на таймаутах' },
  { icon: '🧠', text: 'AI QA — фото с низким quality score' },
  { icon: '🚨', text: 'Auto-alerts — уведомления при спайке ошибок' },
];

export default function Errors() {
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* ── Status ── */}
      <motion.div variants={fadeUp} style={{
        background: 'rgba(129,140,248,0.06)',
        border: '1px solid rgba(129,140,248,0.15)',
        borderRadius: '16px', padding: '20px',
        display: 'flex', gap: '14px', alignItems: 'flex-start',
      }}>
        <span style={{ fontSize: '24px', flexShrink: 0 }}>🗺</span>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: c.text1, marginBottom: '6px' }}>
            Фаза 1 — Мониторинг
          </div>
          <div style={{ fontSize: '12px', color: c.text2, lineHeight: 1.5 }}>
            Полная трассировка ошибок появится после подключения Supabase и Sentry. Используй ссылки ниже для мониторинга.
          </div>
        </div>
      </motion.div>

      {/* ── Links ── */}
      <Section title="Мониторинг">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {LINKS.map(link => (
            <a key={link.url} href={link.url} target="_blank" rel="noreferrer" style={{
              display: 'flex', alignItems: 'center', gap: '14px',
              padding: '14px', borderRadius: '12px',
              background: `${link.color}08`, border: `1px solid ${link.color}18`,
              textDecoration: 'none', transition: 'background 0.15s',
            }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '10px',
                background: `${link.color}15`, border: `1px solid ${link.color}25`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '16px', flexShrink: 0,
              }}>{link.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: c.text1, marginBottom: '2px' }}>{link.title}</div>
                <div style={{ fontSize: '11px', color: c.text2, lineHeight: 1.4 }}>{link.desc}</div>
              </div>
              <span style={{ color: c.text3, fontSize: '14px' }}>↗</span>
            </a>
          ))}
        </div>
      </Section>

      {/* ── Roadmap ── */}
      <Section title="В разработке" style={{ opacity: 0.7 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {ROADMAP.map((item, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '10px 12px', borderRadius: '10px',
              background: 'rgba(255,255,255,0.02)', border: `1px dashed ${c.border}`,
            }}>
              <span style={{ fontSize: '14px' }}>{item.icon}</span>
              <span style={{ fontSize: '12px', color: c.text2, flex: 1, lineHeight: 1.4 }}>{item.text}</span>
              <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '99px', background: 'rgba(129,140,248,0.1)', color: c.accent, fontWeight: 600, letterSpacing: '0.5px' }}>скоро</span>
            </div>
          ))}
        </div>
      </Section>
    </motion.div>
  );
}
