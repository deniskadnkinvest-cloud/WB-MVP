import React from 'react';

export default function PlaceholderPage({ title }) {
  return (
    <div style={{ padding: '24px', background: '#121212', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
      <h2 style={{ margin: '0 0 16px 0', fontSize: '24px', fontWeight: 600 }}>{title}</h2>
      <p style={{ color: '#9ca3af', lineHeight: 1.5 }}>
        Этот раздел находится в разработке (Фаза 2-4). Скоро здесь появится таблица данных и аналитика.
      </p>
    </div>
  );
}
