import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import './LoginPage.css';

export default function LoginPage() {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, isInAppBrowser } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showBrowserHint, setShowBrowserHint] = useState(false);

  const handleGoogle = async () => {
    setError('');
    setLoading(true);
    try { await signInWithGoogle(); }
    catch (err) {
      if (err.message === 'OPEN_IN_BROWSER') {
        setShowBrowserHint(true);
        setError('');
      } else {
        setError(err.message);
      }
    }
    finally { setLoading(false); }
  };

  const handleEmail = async (e) => {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError('Введите email и пароль'); return; }
    setLoading(true);
    try {
      if (isSignUp) await signUpWithEmail(email, password);
      else await signInWithEmail(email, password);
    } catch (err) {
      const msg = err.code === 'auth/invalid-credential' ? 'Неверный email или пароль'
        : err.code === 'auth/email-already-in-use' ? 'Этот email уже зарегистрирован'
        : err.code === 'auth/weak-password' ? 'Пароль слишком короткий (мин. 6 символов)'
        : err.message;
      setError(msg);
    } finally { setLoading(false); }
  };

  const handleOpenInBrowser = () => {
    const url = window.location.href;
    // Try to force-open in system browser
    window.open(url, '_system') || window.open(url, '_blank');
  };

  return (
    <div className="login-wrapper">
      <motion.div className="login-card" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
        <h1 className="login-logo">Селлер-Студия</h1>
        <p className="login-subtitle">Виртуальная примерочная для маркетплейсов</p>

        {/* In-app browser warning banner */}
        {isInAppBrowser && (
          <div className="inapp-banner">
            <span className="inapp-banner-icon">⚠️</span>
            <div className="inapp-banner-text">
              <strong>Вы открыли ссылку во встроенном браузере</strong>
              <p>Вход через Google работает только в обычном браузере (Safari, Chrome). Используйте email-регистрацию ниже или откройте в браузере:</p>
              <button className="inapp-open-btn" onClick={handleOpenInBrowser}>
                Открыть в браузере ↗
              </button>
            </div>
          </div>
        )}

        {/* Show browser hint after Google sign-in attempt in in-app browser */}
        {showBrowserHint && (
          <div className="inapp-banner" style={{ borderColor: '#4285F4' }}>
            <span className="inapp-banner-icon">🌐</span>
            <div className="inapp-banner-text">
              <p>Мы пытаемся открыть приложение в вашем браузере. Если окно не открылось, скопируйте ссылку и вставьте в Safari или Chrome.</p>
            </div>
          </div>
        )}

        {!isInAppBrowser && (
          <button className="google-btn" onClick={handleGoogle} disabled={loading}>
            <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
            Войти через Google
          </button>
        )}

        <div className="login-divider"><span>или</span></div>

        <form onSubmit={handleEmail} className="email-form">
          <input type="email" className="login-input" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
          <input type="password" className="login-input" placeholder="Пароль" value={password} onChange={e => setPassword(e.target.value)} />
          <button type="submit" className="email-btn" disabled={loading}>
            {isSignUp ? 'Зарегистрироваться' : 'Войти'}
          </button>
        </form>

        {error && <p className="login-error">{error}</p>}

        <p className="login-toggle" onClick={() => { setIsSignUp(!isSignUp); setError(''); }}>
          {isSignUp ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}
        </p>
      </motion.div>
    </div>
  );
}

