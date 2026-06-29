import React, { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// Р РѕСѓС‚РёРЅРі: РµСЃР»Рё URL СЃРѕРґРµСЂР¶РёС‚ ?mode=admin РёР»Рё #/admin вЂ” СЂРµРЅРґРµСЂРёРј Р°РґРјРёРЅРєСѓ
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
            <h1 style={{ color: '#ff4d4f', fontSize: 24, marginBottom: 16 }}>РљСЂРёС‚РёС‡РµСЃРєР°СЏ РѕС€РёР±РєР° (React)</h1>
            <p style={{ marginBottom: 16 }}>РЎРґРµР»Р°Р№С‚Рµ СЃРєСЂРёРЅС€РѕС‚ СЌС‚РѕР№ РѕС€РёР±РєРё Рё РѕС‚РїСЂР°РІСЊС‚Рµ СЂР°Р·СЂР°Р±РѕС‚С‡РёРєСѓ:</p>
            <div style={{ background: '#1f2937', padding: 16, borderRadius: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 13 }}>
              <strong style={{color: '#ff7875'}}>{this.state.error && this.state.error.toString()}</strong>
              <br/><br/>
              {this.state.errorInfo && this.state.errorInfo.componentStack}
            </div>
            <button onClick={() => window.location.reload()} style={{ marginTop: 24, padding: '10px 20px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>РџРµСЂРµР·Р°РіСЂСѓР·РёС‚СЊ</button>
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
  const isAuthConfigError = /invalid-api-key|api-key|Auth/i.test(error?.message || '');
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
        <h1 style={{ margin: '0 0 12px', fontSize: 28 }}>РЎРµР»Р»РµСЂ-РЎС‚СѓРґРёСЏ</h1>
        <p style={{ margin: 0, opacity: 0.75 }}>
          {isAuthConfigError
            ? 'РћС€РёР±РєР° РєРѕРЅС„РёРіСѓСЂР°С†РёРё Р°РІС‚РѕСЂРёР·Р°С†РёРё. РџСЂРѕРІРµСЂСЊС‚Рµ Auth web-РїРµСЂРµРјРµРЅРЅС‹Рµ РѕРєСЂСѓР¶РµРЅРёСЏ.'
            : 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РїСЂРёР»РѕР¶РµРЅРёРµ. РћР±РЅРѕРІРёС‚Рµ СЃС‚СЂР°РЅРёС†Сѓ.'}
        </p>
      </div>
    </div>
  );
};

const hasTelegramLaunchParams = () => {
  try {
    const candidates = [];
    const search = window.location.search || '';
    const hash = window.location.hash || '';

    if (search) candidates.push(search.startsWith('?') ? search.slice(1) : search);
    if (hash) {
      const cleanHash = hash.startsWith('#') ? hash.slice(1) : hash;
      candidates.push(cleanHash);
      const hashQueryIndex = cleanHash.indexOf('?');
      if (hashQueryIndex >= 0) candidates.push(cleanHash.slice(hashQueryIndex + 1));
    }

    return candidates.some((candidate) => {
      const params = new URLSearchParams(candidate);
      return Boolean(params.get('tgWebAppData') || (params.get('hash') && params.get('user')));
    });
  } catch {
    return false;
  }
};

const isLikelyTelegramClient = () => {
  try {
    return /Telegram|TelegramBot|TDesktop/i.test(navigator.userAgent || '') || hasTelegramLaunchParams();
  } catch {
    return hasTelegramLaunchParams();
  }
};

const loadTelegramSdk = (timeoutMs = 1200) => new Promise((resolve) => {
  let settled = false;
  const done = () => {
    if (settled) return;
    settled = true;
    resolve();
  };

  if (window.Telegram?.WebApp) {
    done();
    return;
  }

  const existing = document.querySelector('script[data-telegram-sdk="true"]');
  if (existing) {
    existing.addEventListener('load', done, { once: true });
    existing.addEventListener('error', done, { once: true });
    setTimeout(done, timeoutMs);
    return;
  }

  const script = document.createElement('script');
  script.src = 'https://telegram.org/js/telegram-web-app.js';
  script.async = true;
  script.dataset.telegramSdk = 'true';
  script.onload = done;
  script.onerror = done;
  document.head.appendChild(script);
  setTimeout(done, timeoutMs);
});

async function bootstrap() {
  if (isOffer) {
    const { default: OfferPage } = await import('./pages/OfferPage.jsx');
    renderApp(<OfferPage />);
    return;
  }

  const shouldWaitForTelegramSdk = isLikelyTelegramClient() && !hasTelegramLaunchParams();
  const telegramSdkReady = loadTelegramSdk(shouldWaitForTelegramSdk ? 1200 : 0);
  if (shouldWaitForTelegramSdk) {
    await telegramSdkReady;
  }

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
