import React, { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// Роутинг: если URL содержит ?mode=admin или #/admin — рендерим админку
const isAdmin = new URLSearchParams(window.location.search).get('mode') === 'admin'
  || window.location.hash === '#/admin'
  || window.location.hash.startsWith('#/admin/');
const isOffer = window.location.pathname === '/offer' || window.location.pathname === '/offer/';

const root = createRoot(document.getElementById('root'));

class GlobalErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('React ErrorBoundary caught an error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', display: 'grid', placeItems: 'center',
          padding: 24, background: '#0b0f1a', color: '#f5efe1',
          fontFamily: 'monospace', textAlign: 'left', overflow: 'auto'
        }}>
          <div style={{ maxWidth: 800, width: '100%' }}>
            <h1 style={{ color: '#ff4d4f', fontSize: 24, marginBottom: 16 }}>Критическая ошибка (React)</h1>
            <p style={{ marginBottom: 16 }}>Сделайте скриншот этой ошибки и отправьте разработчику:</p>
            <div style={{ background: '#1f2937', padding: 16, borderRadius: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 13 }}>
              <strong style={{color: '#ff7875'}}>{this.state.error && this.state.error.toString()}</strong>
              <br/><br/>
              {this.state.errorInfo && this.state.errorInfo.componentStack}
            </div>
            <button onClick={() => window.location.reload()} style={{ marginTop: 24, padding: '10px 20px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Перезагрузить</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const renderApp = (children) => {
  root.render(<StrictMode><GlobalErrorBoundary>{children}</GlobalErrorBoundary></StrictMode>);
};

const renderBootstrapError = (error) => {
  console.error('App bootstrap failed:', error);
  const isFirebaseConfigError = /invalid-api-key|api-key|Firebase/i.test(error?.message || '');
  renderApp(
    <div style={{
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      padding: 24,
      background: '#0b0f1a',
      color: '#f5efe1',
      fontFamily: 'serif',
      textAlign: 'center',
    }}>
      <div>
        <h1 style={{ margin: '0 0 12px', fontSize: 28 }}>Селлер-Студия</h1>
        <p style={{ margin: 0, opacity: 0.75 }}>
          {isFirebaseConfigError
            ? 'Ошибка конфигурации авторизации. Проверьте Firebase web-переменные окружения.'
            : 'Не удалось загрузить приложение. Обновите страницу.'}
        </p>
      </div>
    </div>
  );
};

const loadTelegramSdk = () => new Promise((resolve) => {
  if (window.Telegram?.WebApp) {
    resolve();
    return;
  }

  const existing = document.querySelector('script[data-telegram-sdk="true"]');
  if (existing) {
    existing.addEventListener('load', resolve, { once: true });
    existing.addEventListener('error', resolve, { once: true });
    return;
  }

  const script = document.createElement('script');
  script.src = 'https://telegram.org/js/telegram-web-app.js';
  script.async = true;
  script.dataset.telegramSdk = 'true';
  script.onload = resolve;
  script.onerror = resolve;
  document.head.appendChild(script);
  setTimeout(resolve, 2500);
});

async function bootstrap() {
  if (isOffer) {
    const { default: OfferPage } = await import('./pages/OfferPage.jsx');
    renderApp(<OfferPage />);
    return;
  }

  await loadTelegramSdk();

  if (isAdmin) {
    const { default: AdminApp } = await import('./admin/AdminApp');
    renderApp(<AdminApp />);
    return;
  }

  const [{ AuthProvider }, { default: App }] = await Promise.all([
    import('./contexts/AuthContext'),
    import('./App.jsx'),
  ]);

  renderApp(
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}

bootstrap().catch(renderBootstrapError);
