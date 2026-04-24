import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth, firebaseErrorToRussian } from '../contexts/AuthContext';
import './LoginPage.css';

export default function LoginPage() {
  const {
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    resetPassword,
    signInAsGuest,
    isInAppBrowser,
    isPrivate,
  } = useAuth();

  const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'reset'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showBrowserHint, setShowBrowserHint] = useState(false);
  const [googleRedirecting, setGoogleRedirecting] = useState(false);

  // ═══════════════════════════════════════════
  //  GOOGLE SIGN-IN
  // ═══════════════════════════════════════════
  const handleGoogle = async () => {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      if (err.message === 'OPEN_IN_BROWSER') {
        setShowBrowserHint(true);
        setError('');
      } else if (err?.code === 'auth/popup-blocked' || err?.message?.includes('redirect')) {
        // Redirect in progress
        setGoogleRedirecting(true);
        setError('');
      } else {
        setError(firebaseErrorToRussian(err));
      }
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════
  //  EMAIL SIGN-IN / SIGN-UP
  // ═══════════════════════════════════════════
  const handleEmail = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!email) { setError('Введите email'); return; }
    if (mode === 'reset') {
      // Password reset flow
      setLoading(true);
      try {
        await resetPassword(email);
        setSuccess('Письмо для сброса пароля отправлено на ' + email);
        setError('');
      } catch (err) {
        setError(firebaseErrorToRussian(err));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!password) { setError('Введите пароль'); return; }
    if (mode === 'signup' && password.length < 6) {
      setError('Пароль должен содержать минимум 6 символов');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signup') await signUpWithEmail(email, password);
      else await signInWithEmail(email, password);
    } catch (err) {
      setError(firebaseErrorToRussian(err));
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════
  //  GUEST MODE
  // ═══════════════════════════════════════════
  const handleGuest = async () => {
    setError('');
    setLoading(true);
    try {
      await signInAsGuest();
    } catch (err) {
      setError(firebaseErrorToRussian(err));
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════
  //  OPEN IN BROWSER (for in-app browsers)
  // ═══════════════════════════════════════════
  const handleOpenInBrowser = () => {
    const url = window.location.href;
    window.open(url, '_system') || window.open(url, '_blank');
  };

  // ═══════════════════════════════════════════
  //  SWITCH MODE
  // ═══════════════════════════════════════════
  const switchMode = (newMode) => {
    setMode(newMode);
    setError('');
    setSuccess('');
  };

  return (
    <div className="login-wrapper">
      <motion.div
        className="login-card"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <h1 className="login-logo">Селлер-Студия</h1>
        <p className="login-subtitle">Виртуальная примерочная для маркетплейсов</p>

        {/* ═══ Private browsing warning ═══ */}
        {isPrivate && (
          <div className="inapp-banner" style={{ borderColor: 'rgba(255,165,0,0.4)' }}>
            <span className="inapp-banner-icon">🕶️</span>
            <div className="inapp-banner-text">
              <strong>Приватный режим браузера</strong>
              <p>В приватном режиме авторизация может работать нестабильно. Рекомендуем открыть в обычном окне браузера.</p>
            </div>
          </div>
        )}

        {/* ═══ In-app browser warning ═══ */}
        {isInAppBrowser && (
          <div className="inapp-banner">
            <span className="inapp-banner-icon">⚠️</span>
            <div className="inapp-banner-text">
              <strong>Встроенный браузер</strong>
              <p>Для входа через Google откройте в Safari или Chrome. Email-регистрация работает здесь:</p>
              <button className="inapp-open-btn" onClick={handleOpenInBrowser}>
                Открыть в браузере ↗
              </button>
            </div>
          </div>
        )}

        {/* ═══ Redirect in progress ═══ */}
        {googleRedirecting && (
          <div className="inapp-banner" style={{ borderColor: 'rgba(66,133,244,0.4)' }}>
            <span className="inapp-banner-icon">🔄</span>
            <div className="inapp-banner-text">
              <p>Перенаправляем на страницу Google для входа...</p>
            </div>
          </div>
        )}

        {/* ═══ Browser hint ═══ */}
        {showBrowserHint && (
          <div className="inapp-banner" style={{ borderColor: '#4285F4' }}>
            <span className="inapp-banner-icon">🌐</span>
            <div className="inapp-banner-text">
              <p>Окно открывается в вашем браузере. Если нет — скопируйте ссылку и вставьте в Safari/Chrome.</p>
            </div>
          </div>
        )}

        {/* ═══ GOOGLE BUTTON ═══ */}
        {!isInAppBrowser && !googleRedirecting && (
          <button className="google-btn" onClick={handleGoogle} disabled={loading}>
            <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
            {loading ? 'Подключаемся...' : 'Войти через Google'}
          </button>
        )}

        <div className="login-divider"><span>{mode === 'reset' ? 'сброс пароля' : 'или по email'}</span></div>

        {/* ═══ EMAIL FORM ═══ */}
        <form onSubmit={handleEmail} className="email-form">
          <input
            type="email"
            className="login-input"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
          />

          {mode !== 'reset' && (
            <div className="password-field">
              <input
                type={showPassword ? 'text' : 'password'}
                className="login-input"
                placeholder="Пароль"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          )}

          <button type="submit" className="email-btn" disabled={loading}>
            {loading ? '⏳ Загрузка...'
              : mode === 'reset' ? 'Отправить письмо для сброса'
              : mode === 'signup' ? 'Зарегистрироваться'
              : 'Войти'}
          </button>
        </form>

        {/* ═══ MESSAGES ═══ */}
        <AnimatePresence>
          {error && (
            <motion.p
              className="login-error"
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {error}
            </motion.p>
          )}
          {success && (
            <motion.p
              className="login-success"
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              ✅ {success}
            </motion.p>
          )}
        </AnimatePresence>

        {/* ═══ MODE TOGGLES ═══ */}
        <div className="login-links">
          {mode === 'login' && (
            <>
              <p className="login-toggle" onClick={() => switchMode('signup')}>
                Нет аккаунта? <strong>Зарегистрироваться</strong>
              </p>
              <p className="login-toggle login-toggle-secondary" onClick={() => switchMode('reset')}>
                Забыли пароль?
              </p>
            </>
          )}
          {mode === 'signup' && (
            <p className="login-toggle" onClick={() => switchMode('login')}>
              Уже есть аккаунт? <strong>Войти</strong>
            </p>
          )}
          {mode === 'reset' && (
            <p className="login-toggle" onClick={() => switchMode('login')}>
              ← Вернуться ко входу
            </p>
          )}
        </div>

        {/* ═══ GUEST MODE ═══ */}
        <div className="guest-section">
          <div className="login-divider"><span>или</span></div>
          <button className="guest-btn" onClick={handleGuest} disabled={loading}>
            Попробовать без регистрации
          </button>
          <p className="guest-hint">Гостевой режим — ограниченный функционал</p>
        </div>
      </motion.div>
    </div>
  );
}
