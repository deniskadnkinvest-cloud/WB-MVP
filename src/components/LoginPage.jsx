import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth, firebaseErrorToRussian } from '../contexts/AuthContext';
import './LoginPage.css';

const TelegramWidget = ({ botName, onAuth }) => {
  const containerRef = useRef(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
    }

    window.onTelegramAuthWidget = (user) => {
      onAuth(user);
    };

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', botName);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '20');
    script.setAttribute('data-onauth', 'onTelegramAuthWidget(user)');
    script.setAttribute('data-request-access', 'write');
    script.async = true;

    if (containerRef.current) {
      containerRef.current.appendChild(script);
    }
  }, [botName, onAuth]);

  return (
    <div 
      ref={containerRef} 
      className="telegram-widget-container"
    ></div>
  );
};

export default function LoginPage() {
  const {
    sendOtpCode,
    verifyOtpCode,
    signInAsGuest,
    signInWithTelegramAccount,
    signInWithTelegramWidget,
    isInAppBrowser,
    isTelegram,
    telegramUser,
    isPrivate,
  } = useAuth();

  const [mode, setMode] = useState('otp_request'); // 'otp_request' | 'otp_verify'
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [captchaVerified, setCaptchaVerified] = useState(false);

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

    if (index < 5 && cleaned) {
      otpRefs.current[index + 1]?.focus();
    }

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
    if (!email) { setError('Введите эл. почту'); return; }
    if (!captchaVerified) { setError('Пожалуйста, подтвердите, что вы не робот'); return; }
    
    setError(''); setSuccess(''); setLoading(true);
    try {
      const data = await sendOtpCode(email);
      setMode('otp_verify');
      setError('');
      if (data && data.telegramFallback) {
        setSuccess('Код отправлен в ваш Telegram.');
      } else if (data && data.supportFallback) {
        setSuccess('Почта временно недоступна. Код передан в резервный канал.');
      } else {
        setSuccess('Код отправлен на почту ' + email);
      }
      setOtpCode(['', '', '', '', '', '']);
      setOtpTimer(60); 
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

  const handleTelegramLogin = async () => {
    setError(''); setLoading(true);
    try { await signInWithTelegramAccount(); }
    catch (err) { setError(firebaseErrorToRussian(err)); }
    finally { setLoading(false); }
  };

  const handleTelegramWidgetAuth = async (user) => {
    setError(''); setLoading(true);
    try { 
      await signInWithTelegramWidget(user); 
      setSuccess('Успешный вход!');
    }
    catch (err) { setError(firebaseErrorToRussian(err)); }
    finally { setLoading(false); }
  };

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

  const handleMockSocial = (provider) => {
    alert(`Вход через ${provider} будет доступен после регистрации приложения в кабинете разработчика и настройки ключей OAuth.`);
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
        <div className="login-header">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="login-logo-svg">
            <path d="M12 2L2 7l10 5 10-5-10-5z" fill="url(#goldGrad)"/>
            <path d="M12 17l-10-5 1.5-.75 8.5 4.25 8.5-4.25 1.5.75-10 5z" fill="url(#goldGrad)"/>
            <path d="M12 22l-10-5 1.5-.75 8.5 4.25 8.5-4.25 1.5.75-10 5z" fill="url(#goldGrad)"/>
            <defs>
              <linearGradient id="goldGrad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                <stop stopColor="#FFD700" />
                <stop offset="0.5" stopColor="#D4A843" />
                <stop offset="1" stopColor="#8B6914" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        
        <h1 className="login-logo">Селлер-Студия</h1>
        <p className="login-subtitle">Виртуальная примерочная</p>

        {isPrivate && (
          <div className="inapp-banner" style={{ borderColor: 'rgba(255,165,0,0.4)' }}>
            <span className="inapp-banner-icon">🕶️</span>
            <div className="inapp-banner-text">
              <strong>Приватный режим браузера</strong>
              <p>В приватном режиме авторизация может работать нестабильно.</p>
            </div>
          </div>
        )}

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

        {isTelegram ? (
          <div className="telegram-native-auth">
            <button className="auth-social-btn" onClick={handleTelegramLogin} disabled={loading}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.28-.02-.12.02-2.02 1.28-5.7 3.77-.54.37-1.03.55-1.47.54-.48-.01-1.4-.27-2.09-.49-.84-.28-1.51-.42-1.45-.89.03-.25.38-.5 1.04-.76 4.09-1.78 6.82-2.96 8.19-3.52 3.9-1.62 4.71-1.9 5.24-1.91.12 0 .37.03.54.17.14.12.18.28.2.47-.01.06.01.24 0 .37z" fill="#29B6F6"/>
              </svg>
              {loading ? '⏳ Подключаемся...' : `Войти как ${tgDisplayName || 'Telegram'}`}
            </button>
            <p className="login-toggle" style={{ marginTop: '20px' }} onClick={() => window.Telegram.WebApp.close()}>
              Закрыть
            </p>
          </div>
        ) : mode === 'otp_request' ? (
          <form onSubmit={handleSendOtp} className="email-form">
            <div className="input-group">
              <input
                type="email"
                className="login-input"
                value={email}
                placeholder="Эл. почта"
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                required
                disabled={loading}
              />
            </div>

            {/* SmartCaptcha Mock */}
            <div 
              className={`smart-captcha-mock ${captchaVerified ? 'verified' : ''}`} 
              onClick={() => setCaptchaVerified(!captchaVerified)}
            >
              <div className="captcha-checkbox">
                {captchaVerified && (
                  <svg width="14" height="10" viewBox="0 0 14 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 4.5L5 8.5L13 1" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <div className="captcha-text">
                <span className="captcha-title">Я не робот</span>
              </div>
              <div className="captcha-brand">
                <span className="captcha-logo-y">Я</span>
                <span>SmartCaptcha</span>
              </div>
            </div>

            <button type="submit" className="email-btn" disabled={loading || !captchaVerified || !email}>
              {loading ? '⏳ Отправка...' : 'Получить код'}
            </button>
            
            <button type="button" className="guest-text-btn" onClick={handleGuest}>
               Продолжить без регистрации
            </button>

            <div className="login-divider"><span>Войти с помощью</span></div>

            <div className="social-row">
              <button type="button" className="social-circle-btn vk-btn" onClick={() => handleMockSocial('VK')} title="Вконтакте">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.28 2.01c.75-.17 1.42.06 1.72.64.3.58.11 1.45-.51 2.37-1.27 1.9-3.9 5.25-5.25 7.11-1.35 1.86-1.1 2.45-.1 3.45 1.01 1.01 2.43 2.5 3.25 3.75.82 1.25.5 1.9-.3 2h-3c-.85 0-1.5-.4-2.1-1.1-.6-.7-1.5-1.9-2.1-2.4-.6-.5-1-.6-1.4-.1V19c0 .65-.35 1-1 1h-2c-2.3 0-5.85-2.2-7.85-5.2C1.38 11.8.38 8.1.38 5c0-.65.35-1 1-1h3c.65 0 1 .35 1.2 1 .3 1.05 1.05 3.05 1.8 4.2.75 1.15 1.1 1.5 1.5 1.2.4-.3.5-1.35.5-2.25V5c0-.65.35-1 1-1h4c.65 0 .8.25.95.8.15.55.15 2.15.15 3.1 0 1-.2 2.2.3 2.5s.8-.3 1.6-1.5C18.18 7.2 18.78 5.6 18.78 5c0-.65.35-1 1-1h3c.1-.01.2-.01.3-.01v.02z" fill="#fff"/>
                </svg>
              </button>
              <button type="button" className="social-circle-btn tg-btn" onClick={() => document.getElementById('tg-widget-trigger').click()} title="Telegram">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.28-.02-.12.02-2.02 1.28-5.7 3.77-.54.37-1.03.55-1.47.54-.48-.01-1.4-.27-2.09-.49-.84-.28-1.51-.42-1.45-.89.03-.25.38-.5 1.04-.76 4.09-1.78 6.82-2.96 8.19-3.52 3.9-1.62 4.71-1.9 5.24-1.91.12 0 .37.03.54.17.14.12.18.28.2.47-.01.06.01.24 0 .37z" fill="#fff"/>
                </svg>
              </button>
              <button type="button" className="social-circle-btn yandex-btn" onClick={() => handleMockSocial('Яндекс')} title="Яндекс">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path fillRule="evenodd" clipRule="evenodd" d="M14.07 20.898V12.9H12.783C10.016 12.9 8.324 11.161 8.324 8.271V7.95C8.324 5.034 10.04 3.294 12.879 3.294H15.654C16.143 3.294 16.52 3.659 16.52 4.148V13.882L19.261 20.407C19.467 20.897 19.167 21.464 18.665 21.464H16.483C16.185 21.464 15.932 21.282 15.82 20.999L14.407 17.653L14.07 17.7V20.898C14.07 21.378 13.681 21.767 13.201 21.767H11.235C10.755 21.767 10.366 21.378 10.366 20.898V16.326C10.366 16.326 13.128 16.326 13.618 16.326C14.108 16.326 14.14 15.892 14.14 15.402V13.862C14.14 13.372 14.108 12.9 13.618 12.9H12.783C11.536 12.9 10.793 12.062 10.793 10.704V7.925C10.793 6.568 11.536 5.73 12.783 5.73H13.618C14.108 5.73 14.14 6.164 14.14 6.654V10.704C14.14 11.194 14.108 11.628 13.618 11.628H14.07Z" fill="#fff"/>
                </svg>
              </button>
              <button type="button" className="social-circle-btn apple-btn" onClick={() => handleMockSocial('Apple')} title="Apple">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M16.51 9.47C16.48 7.37 18.22 6.32 18.31 6.27C17.33 4.84 15.77 4.6 15.22 4.58C13.88 4.45 12.57 5.37 11.88 5.37C11.19 5.37 10.12 4.59 8.99 4.6C7.53 4.62 6.18 5.45 5.43 6.77C3.9 9.43 5.04 13.38 6.53 15.54C7.26 16.59 8.12 17.77 9.25 17.73C10.35 17.68 10.77 17.02 12.08 17.02C13.38 17.02 13.76 17.73 14.9 17.71C16.06 17.68 16.8 16.62 17.53 15.55C18.38 14.32 18.73 13.12 18.75 13.06C18.72 13.05 16.54 12.22 16.51 9.47ZM14.49 3.12C15.09 2.39 15.5 1.41 15.39 0.43C14.54 0.46 13.49 1 12.87 1.74C12.31 2.38 11.83 3.38 11.97 4.34C12.92 4.41 13.88 3.86 14.49 3.12Z" fill="#fff"/>
                </svg>
              </button>
            </div>
            
            {/* Telegram Widget hidden visually but functional if we want to show it, or we can just render it */}
            <div className="telegram-widget-wrapper" style={{ marginTop: '20px', display: 'flex', justifyContent: 'center' }}>
              <TelegramWidget botName="seller_sstudio_bot" onAuth={handleTelegramWidgetAuth} />
            </div>

          </form>
        ) : (
          <div className="otp-verify-section">
            <h2 className="otp-verify-title">Проверьте почту</h2>
            <p className="otp-verify-subtitle">Мы отправили код на <strong>{email}</strong></p>
            
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
                Запросить повторно через <strong style={{ color: '#E4A536' }}>{formatTimer(otpTimer)}</strong>
              </p>
            ) : (
              <p className="otp-timer-text">
                <button type="button" className="otp-resend-btn" onClick={handleSendOtp} disabled={loading}>
                  Отправить код повторно
                </button>
              </p>
            )}

            <p className="otp-change-email" onClick={() => setMode('otp_request')}>
              ← Изменить эл. почту
            </p>
          </div>
        )}

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
        
        <footer className="login-footer">
          <a href="/offer" target="_blank" rel="noreferrer">Публичная оферта</a>
        </footer>
      </motion.div>
    </div>
  );
}
