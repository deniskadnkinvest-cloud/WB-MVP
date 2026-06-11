import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth, firebaseErrorToRussian } from '../contexts/AuthContext';
import './LoginPage.css';

export default function LoginPage() {
  const {
    sendOtpCode,
    verifyOtpCode,
    signInWithEmail,
    signUpWithEmail,
    resetPassword,
    signInAsGuest,
    signInWithTelegramAccount,
    isInAppBrowser,
    isTelegram,
    telegramUser,
    isPrivate,
  } = useAuth();

  const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'reset' | 'otp_request' | 'otp_verify'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showBrowserHint, setShowBrowserHint] = useState(false);

  const [showEmailForm, setShowEmailForm] = useState(false);

  // OTP States
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
  const [otpTimer, setOtpTimer] = useState(0);
  const otpRefs = useRef([]);

  // Timer Effect
  useEffect(() => {
    if (otpTimer <= 0) return;
    const interval = setInterval(() => {
      setOtpTimer(prev => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [otpTimer]);

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleOtpChange = (value, index) => {
    const cleaned = value.replace(/[^0-9]/g, '');
    if (!cleaned) return;

    const newCode = [...otpCode];
    newCode[index] = cleaned[cleaned.length - 1];
    setOtpCode(newCode);

    // Auto-advance focus
    if (index < 5 && cleaned) {
      otpRefs.current[index + 1]?.focus();
    }

    // Auto-submit if all filled
    const fullCode = newCode.join('');
    if (fullCode.length === 6) {
      handleVerifyOtp(email, fullCode);
    }
  };

  const handleOtpKeyDown = (e, index) => {
    if (e.key === 'Backspace') {
      const newCode = [...otpCode];
      if (!newCode[index] && index > 0) {
        newCode[index - 1] = '';
        setOtpCode(newCode);
        otpRefs.current[index - 1]?.focus();
      } else {
        newCode[index] = '';
        setOtpCode(newCode);
      }
      e.preventDefault();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').trim().replace(/[^0-9]/g, '');
    if (pastedData.length === 6) {
      const newCode = pastedData.split('');
      setOtpCode(newCode);
      handleVerifyOtp(email, pastedData);
    }
  };

  const handleSendOtp = async (e) => {
    if (e) e.preventDefault();
    if (!email) { setError('Введите email'); return; }
    setError(''); setSuccess(''); setLoading(true);
    try {
      const data = await sendOtpCode(email);
      // Переключаем режим напрямую, не затирая success через switchMode
      setMode('otp_verify');
      setError('');
      if (data && data.telegramFallback) {
        setSuccess('Код отправлен в ваш Telegram.');
      } else if (data && data.supportFallback) {
        setSuccess('Почта временно недоступна. Код передан в резервный канал поддержки.');
      } else {
        setSuccess('Код отправлен на почту ' + email);
      }
      setOtpCode(['', '', '', '', '', '']);
      setOtpTimer(300); // 5 minutes
      setTimeout(() => {
        otpRefs.current[0]?.focus();
      }, 300);
    } catch (err) {
      setError(err.message || 'Ошибка отправки кода');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (targetEmail, codeString) => {
    setError(''); setSuccess(''); setLoading(true);
    try {
      await verifyOtpCode(targetEmail, codeString);
      setSuccess('Успешный вход!');
    } catch (err) {
      setError(err.message || 'Неверный код подтверждения');
      setOtpCode(['', '', '', '', '', '']);
      setTimeout(() => {
        otpRefs.current[0]?.focus();
      }, 50);
    } finally {
      setLoading(false);
    }
  };


  // ═══════════════════════════════════════════
  //  EMAIL / MAGIC LINK / RESET
  // ═══════════════════════════════════════════
  const handleEmail = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!email) { setError('Введите email'); return; }

    if (mode === 'otp_request') {
      await handleSendOtp(e);
      return;
    }

    if (mode === 'reset') {
      setLoading(true);
      try {
        await resetPassword(email);
        setSuccess('Письмо для сброса пароля отправлено на ' + email);
      } catch (err) { setError(firebaseErrorToRussian(err)); }
      finally { setLoading(false); }
      return;
    }

    if (!password) { setError('Введите пароль'); return; }
    if (mode === 'signup' && password.length < 6) {
      setError('Пароль должен содержать минимум 6 символов'); return;
    }

    setLoading(true);
    try {
      if (mode === 'signup') await signUpWithEmail(email, password);
      else await signInWithEmail(email, password);
    } catch (err) { setError(firebaseErrorToRussian(err)); }
    finally { setLoading(false); }
  };

  // ═══════════════════════════════════════════
  //  TELEGRAM ACCOUNT
  // ═══════════════════════════════════════════
  const handleTelegramLogin = async () => {
    setError(''); setLoading(true);
    try { await signInWithTelegramAccount(); }
    catch (err) { setError(firebaseErrorToRussian(err)); }
    finally { setLoading(false); }
  };

  // ═══════════════════════════════════════════
  //  GUEST MODE
  // ═══════════════════════════════════════════
  const handleGuest = async () => {
    setError(''); setLoading(true);
    try { await signInAsGuest(); }
    catch (err) { setError(firebaseErrorToRussian(err)); }
    finally { setLoading(false); }
  };

  const handleOpenInBrowser = () => {
    const url = window.location.href;
    window.open(url, '_system') || window.open(url, '_blank');
  };

  const switchMode = (newMode) => {
    setMode(newMode); setError(''); setSuccess('');
  };

  const tgDisplayName = telegramUser
    ? [telegramUser.firstName, telegramUser.lastName].filter(Boolean).join(' ')
    : null;

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
              <p>В приватном режиме авторизация может работать нестабильно.</p>
            </div>
          </div>
        )}

        {/* ═══ In-app browser warning ═══ */}
        {isInAppBrowser && (
          <div className="inapp-banner">
            <span className="inapp-banner-icon">⚠️</span>
            <div className="inapp-banner-text">
              <strong>Встроенный браузер</strong>
              <p>Для входа откройте в Safari или Chrome.</p>
              <button className="inapp-open-btn" onClick={handleOpenInBrowser}>
                Открыть в браузере ↗
              </button>
            </div>
          </div>
        )}


        {showBrowserHint && (
          <div className="inapp-banner" style={{ borderColor: '#4285F4' }}>
            <span className="inapp-banner-icon">🌐</span>
            <div className="inapp-banner-text"><p>Окно открывается в браузере. Если нет — скопируйте ссылку.</p></div>
          </div>
        )}

        {/* ═══════════════════════════════════════════ */}
        {/*  TELEGRAM MINI APP: TG account + email     */}
        {/* ═══════════════════════════════════════════ */}
        {isTelegram ? (
          <>
            {/* Primary: Telegram account login */}
            <button className="auth-social-btn" onClick={handleTelegramLogin} disabled={loading}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.28-.02-.12.02-2.02 1.28-5.7 3.77-.54.37-1.03.55-1.47.54-.48-.01-1.4-.27-2.09-.49-.84-.28-1.51-.42-1.45-.89.03-.25.38-.5 1.04-.76 4.09-1.78 6.82-2.96 8.19-3.52 3.9-1.62 4.71-1.9 5.24-1.91.12 0 .37.03.54.17.14.12.18.28.2.47-.01.06.01.24 0 .37z" fill="#29B6F6"/>
              </svg>
              {loading ? '⏳ Подключаемся...' : `Войти как ${tgDisplayName || 'Telegram'}`}
            </button>

            {/* Secondary: show email options */}
            {!showEmailForm ? (
              <button
                className="magic-link-btn"
                onClick={() => { setShowEmailForm(true); setMode('otp_request'); }}
              >
                ✉️ Войти по email
              </button>
            ) : mode === 'otp_verify' ? (
              <>
                <div className="login-divider">
                  <span>код подтверждения</span>
                </div>
                <div className="otp-container" style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                    Код отправлен на <strong>{email}</strong>
                  </p>
                  <div className="otp-inputs-container">
                    {otpCode.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={el => otpRefs.current[idx] = el}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={1}
                        value={digit}
                        onChange={e => handleOtpChange(e.target.value, idx)}
                        onKeyDown={e => handleOtpKeyDown(e, idx)}
                        onPaste={handleOtpPaste}
                        className="otp-input-box"
                        disabled={loading}
                      />
                    ))}
                  </div>
                  
                  {otpTimer > 0 ? (
                    <p className="otp-timer-text">
                      Запросить повторно через <strong style={{ color: 'var(--gold)' }}>{formatTimer(otpTimer)}</strong>
                    </p>
                  ) : (
                    <p className="otp-timer-text">
                      <button type="button" className="otp-resend-btn" onClick={handleSendOtp} disabled={loading}>
                        Отправить код повторно
                      </button>
                    </p>
                  )}

                  <p className="otp-change-email" style={{ marginTop: '20px', cursor: 'pointer', display: 'inline-block' }} onClick={() => switchMode('otp_request')}>
                    ← Изменить email
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="login-divider">
                  <span>{mode === 'otp_request' ? 'код на email' : mode === 'reset' ? 'сброс пароля' : mode === 'signup' ? 'регистрация' : 'вход по email'}</span>
                </div>
                <form onSubmit={handleEmail} className="email-form">
                  <input
                    type="email"
                    className="login-input"
                    placeholder="Email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoComplete="email"
                  />

                  {mode !== 'reset' && mode !== 'otp_request' && (
                    <div className="password-field">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        className="login-input"
                        placeholder="Пароль"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      />
                      <button type="button" className="password-toggle"
                        onClick={() => setShowPassword(!showPassword)} tabIndex={-1}
                        aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}>
                        {showPassword ? '🙈' : '👁️'}
                      </button>
                    </div>
                  )}

                  <button type="submit" className="email-btn" disabled={loading}>
                    {loading ? '⏳ Загрузка...'
                      : mode === 'otp_request' ? '📧 Получить код'
                      : mode === 'reset' ? 'Отправить письмо для сброса'
                      : mode === 'signup' ? 'Зарегистрироваться'
                      : 'Войти'}
                  </button>
                </form>

                <div className="login-links">
                  {mode === 'otp_request' && (
                    <>
                      <p className="login-toggle" onClick={() => switchMode('login')}>
                        Войти с <strong>паролем</strong>
                      </p>
                      <p className="login-toggle login-toggle-secondary" onClick={() => { setShowEmailForm(false); setError(''); setSuccess(''); }}>
                        ← Назад
                      </p>
                    </>
                  )}
                  {mode === 'login' && (
                    <>
                      <p className="login-toggle" onClick={() => switchMode('otp_request')}>
                        Войти <strong>без пароля</strong> (по коду на email)
                      </p>
                      <p className="login-toggle" onClick={() => switchMode('signup')}>
                        Нет аккаунта? <strong>Зарегистрироваться</strong>
                      </p>
                      <p className="login-toggle" onClick={() => switchMode('reset')}>
                        Забыли пароль?
                      </p>
                    </>
                  )}
                  {mode === 'signup' && (
                    <p className="login-toggle" onClick={() => switchMode('otp_request')}>
                      Уже есть аккаунт? <strong>Войти по коду</strong>
                    </p>
                  )}
                  {mode === 'reset' && (
                    <p className="login-toggle" onClick={() => switchMode('otp_request')}>← Вернуться ко входу</p>
                  )}
                </div>
              </>
            )}
          </>
        ) : mode === 'otp_verify' ? (
          <>
            <div className="login-divider">
              <span>код подтверждения</span>
            </div>
            <div className="otp-container" style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Код отправлен на <strong>{email}</strong>
              </p>
              <div className="otp-inputs-container">
                {otpCode.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={el => otpRefs.current[idx] = el}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleOtpChange(e.target.value, idx)}
                    onKeyDown={e => handleOtpKeyDown(e, idx)}
                    onPaste={handleOtpPaste}
                    className="otp-input-box"
                    disabled={loading}
                  />
                ))}
              </div>
              
              {otpTimer > 0 ? (
                <p className="otp-timer-text">
                  Запросить повторно через <strong style={{ color: 'var(--gold)' }}>{formatTimer(otpTimer)}</strong>
                </p>
              ) : (
                <p className="otp-timer-text">
                  <button type="button" className="otp-resend-btn" onClick={handleSendOtp} disabled={loading}>
                    Отправить код повторно
                  </button>
                </p>
              )}

              <p className="otp-change-email" style={{ marginTop: '20px', cursor: 'pointer', display: 'inline-block' }} onClick={() => switchMode('otp_request')}>
                ← Изменить email
              </p>
            </div>
          </>
        ) : (
          <>

            <div className="login-divider"><span>{mode === 'otp_request' ? 'код на email' : mode === 'reset' ? 'сброс пароля' : 'вход по email'}</span></div>

            <form onSubmit={handleEmail} className="email-form">
              <input type="email" className="login-input" placeholder="Email"
                value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />

              {mode !== 'reset' && mode !== 'otp_request' && (
                <div className="password-field">
                  <input type={showPassword ? 'text' : 'password'} className="login-input"
                    placeholder="Пароль" value={password} onChange={e => setPassword(e.target.value)}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
                  <button type="button" className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)} tabIndex={-1}
                    aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}>
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              )}

              <button type="submit" className="email-btn" disabled={loading}>
                {loading ? '⏳ Загрузка...'
                  : mode === 'otp_request' ? '📧 Получить код'
                  : mode === 'reset' ? 'Отправить письмо для сброса'
                  : mode === 'signup' ? 'Зарегистрироваться'
                  : 'Войти'}
              </button>
            </form>

            <div className="login-links">
              {mode === 'otp_request' && (
                <>
                  <p className="login-toggle" onClick={() => switchMode('login')}>
                    Войти с <strong>паролем</strong>
                  </p>
                </>
              )}
              {mode === 'login' && (
                <>
                  <p className="login-toggle" onClick={() => switchMode('otp_request')}>
                    Войти <strong>без пароля</strong> (по коду на email)
                  </p>
                  <p className="login-toggle" onClick={() => switchMode('signup')}>
                    Нет аккаунта? <strong>Зарегистрироваться</strong>
                  </p>
                  <p className="login-toggle login-toggle-secondary" onClick={() => switchMode('reset')}>
                    Забыли пароль?
                  </p>
                </>
              )}
              {mode === 'signup' && (
                <p className="login-toggle" onClick={() => switchMode('otp_request')}>
                  Уже есть аккаунт? <strong>Войти по коду</strong>
                </p>
              )}
              {mode === 'reset' && (
                <p className="login-toggle" onClick={() => switchMode('otp_request')}>← Вернуться ко входу</p>
              )}
            </div>
          </>
        )}

        {/* ═══ MESSAGES ═══ */}
        <AnimatePresence>
          {error && (
            <motion.p className="login-error"
              initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {error}
            </motion.p>
          )}
          {success && (
            <motion.p className="login-success"
              initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              ✅ {success}
            </motion.p>
          )}
        </AnimatePresence>

        {/* ═══ GUEST MODE ═══ */}
        <div className="guest-section">
          <div className="login-divider"><span>или</span></div>
          <button className="guest-btn" onClick={handleGuest} disabled={loading}>
            Попробовать без регистрации
          </button>
          <p className="guest-hint">Гостевой режим — ограниченный функционал</p>
        </div>

        <footer className="login-footer">
          <a href="/offer" target="_blank" rel="noreferrer">Публичная оферта</a>
        </footer>
      </motion.div>
    </div>
  );
}
