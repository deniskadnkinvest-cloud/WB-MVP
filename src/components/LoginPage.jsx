import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth, firebaseErrorToRussian } from '../contexts/AuthContext';
import { FaVk, FaTelegramPlane, FaYandex, FaApple } from 'react-icons/fa';
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
        {/* Logo Icon */}
        <div className="login-header">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="login-logo-svg">
            <path d="M12 2L2 7l10 5 10-5-10-5z" fill="url(#gTop)"/>
            <path d="M12 17l-10-5 1.5-.75 8.5 4.25 8.5-4.25 1.5.75-10 5z" fill="url(#gMid)"/>
            <path d="M12 22l-10-5 1.5-.75 8.5 4.25 8.5-4.25 1.5.75-10 5z" fill="url(#gBot)"/>
            <defs>
              <linearGradient id="gTop" x1="2" y1="2" x2="22" y2="12" gradientUnits="userSpaceOnUse">
                <stop stopColor="#E8D5A3"/>
                <stop offset="0.5" stopColor="#C9A84C"/>
                <stop offset="1" stopColor="#A68B3C"/>
              </linearGradient>
              <linearGradient id="gMid" x1="2" y1="12" x2="22" y2="17" gradientUnits="userSpaceOnUse">
                <stop stopColor="#C9A84C"/>
                <stop offset="1" stopColor="#8B7332"/>
              </linearGradient>
              <linearGradient id="gBot" x1="2" y1="17" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                <stop stopColor="#A68B3C"/>
                <stop offset="1" stopColor="#6B5520"/>
              </linearGradient>
            </defs>
          </svg>
        </div>
        
        {/* Title */}
        <h1 className="login-logo">Селлер-Студия</h1>
        <span className="login-diamond">◇</span>
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
              <FaTelegramPlane size={20} />
              {loading ? '⏳ Подключаемся...' : `Войти как ${tgDisplayName || 'Telegram'}`}
            </button>
            <p className="login-toggle" style={{ marginTop: '20px', color: '#D4A843', opacity: 0.9 }} onClick={() => window.Telegram.WebApp.close()}>
              Закрыть
            </p>
          </div>
        ) : mode === 'otp_request' ? (
          <form onSubmit={handleSendOtp} className="email-form">
            {/* Email Input with mail icon */}
            <div className="input-group">
              <span className="input-mail-icon">✉</span>
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

            {/* Submit */}
            <button type="submit" className="email-btn" disabled={loading || !email}>
              {loading ? '⏳ Отправка...' : 'Получить код'}
            </button>
            
            <button type="button" className="guest-text-btn" onClick={handleGuest}>
               Продолжить без регистрации
            </button>

            <div className="login-divider">
              <div className="divider-line"></div>
              <span className="divider-diamond">◇</span>
              <span className="divider-text">Войти с помощью</span>
              <span className="divider-diamond">◇</span>
              <div className="divider-line"></div>
            </div>

            {/* Social Icons — using react-icons for pixel-perfect rendering */}
            <div className="social-row">
              <button type="button" className="social-circle-btn" onClick={() => handleMockSocial('VK')} title="Вконтакте">
                <FaVk size={28} />
              </button>
              <button type="button" className="social-circle-btn" onClick={() => handleMockSocial('Telegram')} title="Telegram">
                <FaTelegramPlane size={26} />
              </button>
              <button type="button" className="social-circle-btn" onClick={() => handleMockSocial('Яндекс')} title="Яндекс">
                <FaYandex size={26} />
              </button>
              <button type="button" className="social-circle-btn" onClick={() => handleMockSocial('Apple')} title="Apple">
                <FaApple size={28} />
              </button>
            </div>
            
            {/* Telegram Widget */}
            <div className="telegram-widget-wrapper">
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
