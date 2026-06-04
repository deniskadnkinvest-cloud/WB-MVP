import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 15, scale: 0.98 },
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

const LINKS = [
  {
    icon: '⚡',
    title: 'Vercel Function Logs',
    desc: 'Логи generate-image.js, payment-webhook.js. Поиск по ошибкам в реальном времени.',
    url: 'https://vercel.com/dashboard',
    color: '#f59e0b',
  },
  {
    icon: '🔥',
    title: 'Firebase Console',
    desc: 'Firestore данные пользователей, Auth, Storage. Мониторинг использования.',
    url: 'https://console.firebase.google.com',
    color: '#f97316',
  },
  {
    icon: '🔄',
    title: 'Inngest Dashboard',
    desc: 'Очередь задач, статусы воркеров, ретраи. Главный инструмент дебага генераций.',
    url: 'https://app.inngest.com',
    color: '#8b5cf6',
  },
  {
    icon: '🤖',
    title: 'KIE.ai Dashboard',
    desc: 'API usage, rate limits, статистика nano-banana-2 модели.',
    url: 'https://kie.ai',
    color: '#06b6d4',
  },
];

const COMING_SOON = [
  { icon: '📊', text: 'Live Error Rate — % ошибок за час (нужен Supabase)' },
  { icon: '💸', text: 'Waste Analytics — $$ сожжённые на таймаутах' },
  { icon: '🧠', text: 'AI QA Board — фото с низким quality score' },
  { icon: '🚨', text: 'Auto-alerts — Inngest Cron в Telegram при спайке ошибок' },
];

export default function Errors() {
  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="show"
      style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '20px' }}
    >
      {/* ── Status banner ── */}
      <motion.div 
        variants={itemVariants}
        style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(6,182,212,0.1))',
          border: '1px solid rgba(99,102,241,0.3)',
          boxShadow: '0 10px 30px rgba(99,102,241,0.2), inset 0 1px 0 rgba(255,255,255,0.1)',
          borderRadius: '24px', padding: '24px',
          display: 'flex', alignItems: 'flex-start', gap: '16px',
        }}
      >
        <div style={{ fontSize: '32px', lineHeight: 1, flexShrink: 0, filter: 'drop-shadow(0 0 10px rgba(99,102,241,0.8))' }}>🗺</div>
        <div>
          <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 800, color: '#fff', letterSpacing: '-0.5px' }}>
            Phase 1: Sentry + Supabase
          </h3>
          <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: '1.6', fontWeight: 500 }}>
            Полноценная трассировка ошибок появится после подключения Supabase (лог генераций)
            и Sentry (crash analytics). Сейчас используй ссылки ниже.
          </p>
        </div>
      </motion.div>

      {/* ── Quick links ── */}
      <Card>
        <p style={{ margin: '0 0 16px', fontSize: '11px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600 }}>
          Live Monitoring
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {LINKS.map((link, i) => (
            <motion.a
              key={link.url}
              whileHover={{ scale: 1.02, x: 5, backgroundColor: `${link.color}11`, borderColor: `${link.color}44` }}
              whileTap={{ scale: 0.98 }}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'flex', alignItems: 'center', gap: '16px',
                padding: '16px',
                borderRadius: '16px',
                background: `linear-gradient(145deg, ${link.color}0a, rgba(255,255,255,0.01))`,
                border: `1px solid ${link.color}22`,
                textDecoration: 'none',
                transition: 'border 0.2s, background 0.2s',
              }}
            >
              <div style={{
                width: '48px', height: '48px', borderRadius: '14px',
                background: `linear-gradient(135deg, ${link.color}22, ${link.color}11)`,
                border: `1px solid ${link.color}44`,
                boxShadow: `inset 0 0 10px ${link.color}22`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '20px', flexShrink: 0,
              }}>
                {link.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>
                  {link.title}
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', lineHeight: '1.5', fontWeight: 500 }}>
                  {link.desc}
                </div>
              </div>
              <span style={{ color: link.color, fontSize: '18px', flexShrink: 0, opacity: 0.5 }}>↗</span>
            </motion.a>
          ))}
        </div>
      </Card>

      {/* ── Roadmap ── */}
      <Card style={{ opacity: 0.8 }}>
        <p style={{ margin: '0 0 16px', fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 600 }}>
          Phase 2 Roadmap
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {COMING_SOON.map((item, i) => (
            <motion.div 
              key={i} 
              whileHover={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '12px 16px',
                borderRadius: '12px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px dashed rgba(255,255,255,0.1)',
                opacity: 0.7,
              }}
            >
              <span style={{ fontSize: '18px' }}>{item.icon}</span>
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', lineHeight: '1.4', fontWeight: 500 }}>
                {item.text}
              </span>
              <span style={{
                marginLeft: 'auto', fontSize: '9px', padding: '4px 8px',
                borderRadius: '99px', background: 'rgba(139,92,246,0.15)',
                border: '1px solid rgba(139,92,246,0.3)',
                color: '#d8b4fe', flexShrink: 0, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase'
              }}>
                Soon
              </span>
            </motion.div>
          ))}
        </div>
      </Card>
    </motion.div>
  );
}
