import React from 'react';

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
    color: '#6366f1',
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
  { icon: '⚡', text: 'Auto-alerts — Inngest Cron в Telegram при спайке ошибок' },
];

export default function Errors() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '8px' }}>

      {/* Status banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(6,182,212,0.08))',
        border: '1px solid rgba(99,102,241,0.25)',
        borderRadius: '16px', padding: '16px',
        display: 'flex', alignItems: 'flex-start', gap: '12px',
      }}>
        <div style={{ fontSize: '28px', lineHeight: 1, flexShrink: 0 }}>🗺</div>
        <div>
          <h3 style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 700, color: '#fff' }}>
            Phase 1: Sentry + Supabase
          </h3>
          <p style={{ margin: 0, fontSize: '12px', color: 'rgba(255,255,255,0.5)', lineHeight: '1.5' }}>
            Полноценная трассировка ошибок появится после подключения Supabase (лог генераций)
            и Sentry (crash analytics). Сейчас используй ссылки ниже.
          </p>
        </div>
      </div>

      {/* Quick links */}
      <Card>
        <p style={{ margin: '0 0 12px', fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Мониторинг сейчас
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {LINKS.map(link => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '12px',
                borderRadius: '12px',
                background: `${link.color}0a`,
                border: `1px solid ${link.color}22`,
                textDecoration: 'none',
                transition: 'background 0.2s',
              }}
            >
              <div style={{
                width: '40px', height: '40px', borderRadius: '10px',
                background: `${link.color}18`,
                border: `1px solid ${link.color}33`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '18px', flexShrink: 0,
              }}>
                {link.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff', marginBottom: '2px' }}>
                  {link.title}
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', lineHeight: '1.4' }}>
                  {link.desc}
                </div>
              </div>
              <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '14px', flexShrink: 0 }}>↗</span>
            </a>
          ))}
        </div>
      </Card>

      {/* Roadmap */}
      <Card>
        <p style={{ margin: '0 0 12px', fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          В разработке (Phase 2)
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {COMING_SOON.map((item, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '10px 12px',
              borderRadius: '10px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              opacity: 0.7,
            }}>
              <span style={{ fontSize: '16px' }}>{item.icon}</span>
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)', lineHeight: '1.4' }}>
                {item.text}
              </span>
              <span style={{
                marginLeft: 'auto', fontSize: '10px', padding: '2px 7px',
                borderRadius: '99px', background: 'rgba(139,92,246,0.15)',
                color: '#8b5cf6', flexShrink: 0,
              }}>
                Soon
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
