import React, { createContext, useContext, useState, useEffect } from 'react';
import { getToken, setToken, removeToken, getSavedUser, setSavedUser, removeSavedUser, apiFetch } from '../lib/api';

const AuthContext = createContext(null);

// ═══════════════════════════════════════════
//  ENVIRONMENT DETECTION
// ═══════════════════════════════════════════

// ═══ TELEGRAM MINI APP DETECTION ═══
// Two detection methods:
// 1. SDK check — mobile Telegram injects window.Telegram.WebApp natively
// 2. User-Agent check — Telegram Desktop WebView has "TDesktop" or "Telegram" in UA
const isTelegram = (() => {
  try {
    // Method 1: SDK injected by Telegram mobile
    if (window.Telegram?.WebApp?.initData && window.Telegram.WebApp.initData.length > 0) {
      return true;
    }
    // Method 2: User-Agent contains Telegram identifier
    const ua = navigator.userAgent || '';
    if (/Telegram/i.test(ua)) {
      return true;
    }
    // Method 3: URL has tgWebAppData parameter (Telegram passes data via URL)
    if (window.location.search.includes('tgWebAppData') || window.location.hash.includes('tgWebAppData')) {
      return true;
    }
    return false;
  } catch { return false; }
})();

// Extract Telegram user data (available immediately from SDK)
const telegramUser = (() => {
  try {
    if (!isTelegram) return null;
    const tg = window.Telegram?.WebApp;
    const user = tg?.initDataUnsafe?.user || (() => {
      const initData = tg?.initData || new URLSearchParams(window.location.search).get('tgWebAppData') || '';
      const rawUser = new URLSearchParams(initData).get('user');
      return rawUser ? JSON.parse(rawUser) : null;
    })();
    if (!user) return null;
    return {
      id: user.id,
      firstName: user.first_name || '',
      lastName: user.last_name || '',
      username: user.username || '',
      languageCode: user.language_code || 'ru',
      photoUrl: user.photo_url || null,
    };
  } catch { return null; }
})();

// Initialize Telegram WebApp features
if (isTelegram) {
  try {
    const tg = window.Telegram.WebApp;
    // Expand to full screen (removes bottom bar gap)
    tg.expand();
    // Enable closing confirmation to prevent accidental close
    tg.enableClosingConfirmation();
    // Set header color to match our dark theme
    tg.setHeaderColor('#0a0e1a');
    tg.setBackgroundColor('#0a0e1a');
    console.log('📱 Telegram Mini App detected:', telegramUser?.firstName || 'unknown user');
  } catch (e) {
    console.warn('Telegram WebApp init error:', e.message);
  }
}

// Detect if running inside an iframe (embedded in PANX marketplace)
// Telegram is also an iframe, but handled separately above
const isEmbedded = (() => {
  if (isTelegram) return false; // Telegram has its own flow
  try { return window.self !== window.top; } catch { return true; }
})();

// Detect in-app browsers (Telegram, Instagram, Facebook, etc.)
// These browsers block popups and partition sessionStorage,
// causing auth errors
// NOTE: Telegram Mini App is NOT treated as in-app browser — it has its own auth flow
const isInAppBrowser = (() => {
  if (isTelegram) return false; // Telegram Mini App has dedicated auth
  try {
    const ua = navigator.userAgent || '';
    return /Telegram|TelegramBot|Instagram|FBAN|FBAV|Twitter|Line\/|Snapchat|WeChat|MicroMessenger|QQBrowser|DuckDuckGo/i.test(ua);
  } catch { return false; }
})();

// Detect mobile device
const isMobile = (() => {
  try {
    return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  } catch { return false; }
})();

// Detect if private/incognito browsing (best-effort detection)
const checkPrivateBrowsing = async () => {
  try {
    // Try writing to localStorage — fails in some private modes
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);

    // Check storage quota (Safari private mode gives ~0 quota)
    if (navigator.storage && navigator.storage.estimate) {
      const { quota } = await navigator.storage.estimate();
      if (quota && quota < 120000000) return true; // Less than ~120MB = likely private
    }
    return false;
  } catch {
    return true;
  }
};

// ═══════════════════════════════════════════
//  HUMAN-FRIENDLY ERROR MESSAGES (Russian)
// ═══════════════════════════════════════════
export const firebaseErrorToRussian = (error) => {
  const code = error?.code || '';
  const msg = error?.message || '';

  const errorMap = {
    'auth/invalid-credential': 'Неверный email или пароль',
    'auth/invalid-email': 'Некорректный формат email',
    'auth/user-disabled': 'Этот аккаунт заблокирован',
    'auth/user-not-found': 'Пользователь с таким email не найден',
    'auth/wrong-password': 'Неверный пароль',
    'auth/email-already-in-use': 'Этот email уже зарегистрирован. Попробуйте войти',
    'auth/weak-password': 'Пароль слишком короткий (минимум 6 символов)',
    'auth/too-many-requests': 'Слишком много попыток. Подождите пару минут и попробуйте снова',
    'auth/network-request-failed': 'Нет подключения к интернету. Проверьте сеть',
    'auth/popup-blocked': 'Всплывающее окно заблокировано. Разрешите pop-up или используйте email',
    'auth/popup-closed-by-user': 'Окно авторизации было закрыто. Попробуйте ещё раз',
    'auth/cancelled-popup-request': 'Предыдущий запрос ещё выполняется',
    'auth/account-exists-with-different-credential': 'Аккаунт с этим email уже существует с другим способом входа',
    'auth/requires-recent-login': 'Для этого действия нужно перезайти в аккаунт',
    'auth/credential-already-in-use': 'Эти данные уже привязаны к другому аккаунту',
    'auth/operation-not-allowed': 'Этот способ входа отключён. Используйте email или Telegram.',
    'auth/internal-error': 'Внутренняя ошибка сервера. Попробуйте позже',
    'auth/missing-email': 'Введите email адрес',
    'auth/missing-password': 'Введите пароль',
    'auth/invalid-api-key': 'Ошибка конфигурации приложения. Обратитесь в поддержку',
    'auth/app-deleted': 'Приложение было удалено. Обратитесь в поддержку',
    'auth/unauthorized-domain': 'Этот домен не авторизован для входа. Обратитесь в поддержку',
  };

  if (errorMap[code]) return errorMap[code];

  // Fallback patterns
  if (msg.includes('missing initial state')) return 'Ошибка браузера. Попробуйте открыть ссылку в Safari или Chrome';
  if (msg.includes('popup')) return 'Проблема с всплывающим окном. Используйте вход по email';
  if (msg.includes('network')) return 'Проблема с сетью. Проверьте интернет';

  return msg || 'Произошла ошибка. Попробуйте ещё раз или используйте другой способ входа';
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

const otpErrorToRussian = (errorData = {}) => {
  const message = String(errorData.error || errorData.message || errorData.details || '');
  if (
    errorData.code === 'otp_email_send_failed' ||
    errorData.code === 'resend_domain_not_verified' ||
    message.includes('Failed to send OTP email') ||
    message.includes('Resend API error') ||
    message.includes('No email providers')
  ) {
    return 'Не удалось отправить код на email. Попробуйте ещё раз или войдите с паролем.';
  }
  if (message.includes('Invalid email')) return 'Некорректный формат email';
  if (message.includes('Email is required')) return 'Введите email';
  return message || 'Не удалось отправить код подтверждения';
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isPrivate, setIsPrivate] = useState(false);

  useEffect(() => {
    // Check for private browsing
    checkPrivateBrowsing().then(setIsPrivate);

    // ═══ RESTORE SESSION FROM localStorage ═══
    const savedToken = getToken();
    const savedUser = getSavedUser();

    if (savedToken && savedUser) {
      // Восстанавливаем сессию из localStorage
      if (telegramUser) {
        savedUser.telegramId = telegramUser.id;
        savedUser.telegramUsername = telegramUser.username;
        savedUser.isTelegramUser = true;
      }
      // Добавляем getIdToken для совместимости с кодом, который вызывает user.getIdToken()
      savedUser.getIdToken = async () => getToken();
      setUser(savedUser);
      setLoading(false);
    } else if (isTelegram && telegramUser) {
      // Автоматический вход через Telegram при первом открытии
      signInWithTelegramAccountInternal()
        .then(() => setLoading(false))
        .catch(() => {
          setUser(null);
          setLoading(false);
        });
    } else {
      setUser(null);
      setLoading(false);
    }

    // ═══ PANX EMBEDDED SUPPORT ═══
    if (isEmbedded) {
      const handleMessage = async (event) => {
        if (event.data?.type !== 'PANX_AUTH') return;
        const { token, user: panxUser } = event.data;
        if (token) {
          setToken(token);
          const userData = {
            uid: panxUser?.uid || 'panx-guest',
            displayName: panxUser?.displayName || 'PANX User',
            email: panxUser?.email,
            photoURL: panxUser?.photoURL,
            isPanxAuth: true,
            getIdToken: async () => token,
          };
          setSavedUser(userData);
          setUser(userData);
          setLoading(false);
        }
      };
      window.addEventListener('message', handleMessage);
      try {
        window.parent.postMessage({ type: 'PANX_AUTH_REQUEST' }, '*');
      } catch (e) { /* parent blocked */ }

      const fallbackTimer = setTimeout(() => {
        setUser((prev) => {
          if (prev) return prev;
          return {
            uid: 'panx-guest',
            displayName: 'PANX Guest',
            email: 'guest@panx.ai',
            isGuest: true,
            getIdToken: async () => null,
          };
        });
        setLoading(false);
      }, 5000);

      return () => {
        window.removeEventListener('message', handleMessage);
        clearTimeout(fallbackTimer);
      };
    }
  }, []);

  // ═══ Internal Telegram login (no dependency on Firebase) ═══
  const signInWithTelegramAccountInternal = async () => {
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) {
      throw new Error('Telegram initData не доступна. Откройте приложение через Telegram.');
    }

    const resp = await fetch('/api/auth-telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || 'Ошибка авторизации через Telegram');
    }

    const { customToken, uid, telegramId } = await resp.json();

    // Сохраняем JWT токен
    setToken(customToken);

    const tgUser = telegramUser;
    const displayName = tgUser
      ? [tgUser.firstName, tgUser.lastName].filter(Boolean).join(' ')
      : 'Telegram User';

    const userData = {
      uid,
      displayName,
      email: tgUser?.username ? `@${tgUser.username}` : null,
      photoURL: tgUser?.photoUrl || null,
      isAnonymous: false,
      isTelegramUser: true,
      telegramId: tgUser?.id || telegramId,
      telegramUsername: tgUser?.username,
      getIdToken: async () => getToken(),
    };

    setSavedUser(userData);
    setUser(userData);
    return { user: userData };
  };

  // Google Auth удалён (ФЗ № 406 — запрет иностранных OAuth на РФ-ресурсах)
  // Используйте Email OTP или Telegram Login

  // ═══════════════════════════════════════════
  //  EMAIL SIGN-IN / SIGN-UP (through OTP API)
  // ═══════════════════════════════════════════
  const signInWithEmail = async (email, password) => {
    // В новой системе email+password работает через OTP
    // Для обратной совместимости можно вызвать sendOtpCode
    throw new Error('Используйте вход по коду (OTP). Email+пароль больше не поддерживается.');
  };

  const signUpWithEmail = async (email, password) => {
    throw new Error('Используйте вход по коду (OTP). Регистрация с паролем больше не поддерживается.');
  };

  // ═══════════════════════════════════════════
  //  PASSWORD RESET (disabled — no Firebase Auth)
  // ═══════════════════════════════════════════
  const resetPassword = async (email) => {
    throw new Error('Сброс пароля больше не поддерживается. Используйте вход по коду (OTP).');
  };

  // ═══════════════════════════════════════════
  //  GUEST MODE
  // ═══════════════════════════════════════════
  const signInAsGuest = async () => {
    const guestUid = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const userData = {
      uid: guestUid,
      displayName: 'Гость',
      email: null,
      isAnonymous: true,
      isGuest: true,
      getIdToken: async () => null,
    };
    // Не сохраняем токен для гостя — он не имеет доступа к API
    setSavedUser(userData);
    setUser(userData);
    return { user: userData };
  };

  // ═══════════════════════════════════════════
  //  OTP (One-Time Password) Email Auth
  //  Премиальная бесшовная авторизация для Telegram Mini App
  // ═══════════════════════════════════════════
  const sendOtpCode = async (email) => {
    const tgInitData = window.Telegram?.WebApp?.initData || '';
    const resp = await fetch('/api/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, tgInitData }),
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(otpErrorToRussian(errData));
    }
    const data = await resp.json();
    if (import.meta.env.DEV && data.debug && data.code) {
      console.log('🔑 [DEBUG CODE]:', data.code);
      window.localStorage.setItem('debugOtpCode', data.code);
    } else {
      window.localStorage.removeItem('debugOtpCode');
    }
    return data;
  };

  const verifyOtpCode = async (email, code) => {
    const resp = await fetch('/api/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    });
    if (!resp.ok) {
      const errData = await resp.json();
      throw new Error(errData.error || 'Неверный код или ошибка сервера');
    }
    const { customToken, uid } = await resp.json();

    // Сохраняем JWT токен
    setToken(customToken);

    const userData = {
      uid,
      displayName: email,
      email,
      isAnonymous: false,
      getIdToken: async () => getToken(),
    };

    if (telegramUser) {
      userData.telegramId = telegramUser.id;
      userData.telegramUsername = telegramUser.username;
      userData.isTelegramUser = true;
    }

    setSavedUser(userData);
    setUser(userData);
    return { user: userData };
  };

  const sendMagicLink = async (email) => {
    // Magic links are deprecated in the new system — redirect to OTP
    return sendOtpCode(email);
  };

  // ═══════════════════════════════════════════
  //  SIGN IN WITH TELEGRAM ACCOUNT
  //  Uses JWT with deterministic UID: tg_{telegramId}
  // ═══════════════════════════════════════════
  const signInWithTelegramAccount = async () => {
    if (!isTelegram && !telegramUser) {
      throw new Error('Доступно только в Telegram');
    }
    return signInWithTelegramAccountInternal();
  };

  // Upgrade anonymous user to email account (disabled without Firebase)
  const upgradeGuestToEmail = async (email, password) => {
    // В новой системе гость просто вводит OTP код
    throw new Error('Используйте вход по коду (OTP) для создания аккаунта.');
  };

  // ═══════════════════════════════════════════
  //  SIGN OUT
  // ═══════════════════════════════════════════
  const handleSignOut = () => {
    if (isEmbedded) return;
    removeToken();
    removeSavedUser();
    setUser(null);
  };

  const value = {
    user,
    loading,
    isEmbedded,
    isTelegram,
    telegramUser,
    isInAppBrowser,
    isMobile,
    isPrivate,

    signInWithEmail,
    signUpWithEmail,
    resetPassword,
    sendMagicLink,
    sendOtpCode,
    verifyOtpCode,
    signInAsGuest,
    signInWithTelegramAccount,
    upgradeGuestToEmail,
    signOut: handleSignOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
