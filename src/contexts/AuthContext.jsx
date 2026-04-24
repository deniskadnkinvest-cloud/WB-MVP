import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  signInWithCustomToken,
  signInAnonymously,
  sendPasswordResetEmail,
  onAuthStateChanged,
  browserLocalPersistence,
  setPersistence,
  linkWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';
import { auth } from '../lib/firebase';

const AuthContext = createContext(null);

// ═══════════════════════════════════════════
//  ENVIRONMENT DETECTION
// ═══════════════════════════════════════════

// Detect if running inside an iframe (embedded in PANX marketplace)
const isEmbedded = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();

// Detect in-app browsers (Telegram, Instagram, Facebook, etc.)
// These browsers block popups and partition sessionStorage,
// causing Firebase "missing initial state" errors
const isInAppBrowser = (() => {
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
    'auth/operation-not-allowed': 'Этот способ входа отключён. Используйте email или Google',
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

  return 'Произошла ошибка. Попробуйте ещё раз или используйте другой способ входа';
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isPrivate, setIsPrivate] = useState(false);

  useEffect(() => {
    // Check for private browsing
    checkPrivateBrowsing().then(setIsPrivate);

    // Always set localStorage persistence (most reliable across all browsers)
    setPersistence(auth, browserLocalPersistence).catch(() => {});

    if (isEmbedded) {
      // In embedded mode: listen for PANX_AUTH postMessage
      const handleMessage = async (event) => {
        if (event.data?.type !== 'PANX_AUTH') return;

        const { token, user: panxUser } = event.data;

        if (token) {
          try {
            // Exchange PANX marketplace token for a real Firebase session
            const resp = await fetch('/api/verify-panx-token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ idToken: token }),
            });

            if (resp.ok) {
              const { customToken } = await resp.json();
              // Sign in with custom token → creates REAL Firebase session
              await signInWithCustomToken(auth, customToken);
              // onAuthStateChanged will update the user
              return;
            }
          } catch (err) {
            console.warn('Token exchange failed, falling back to guest:', err.message);
          }
        }

        // Fallback: use user data from postMessage (no Firestore write access)
        if (panxUser) {
          setUser({
            uid: panxUser.uid,
            displayName: panxUser.displayName,
            email: panxUser.email,
            photoURL: panxUser.photoURL,
            isGuest: true,
            isPanxAuth: true,
          });
          setLoading(false);
        }
      };

      // Listen for auth state changes (will fire after signInWithCustomToken)
      const unsub = onAuthStateChanged(auth, (u) => {
        if (u) {
          setUser(u);
          setLoading(false);
        }
      });

      window.addEventListener('message', handleMessage);

      // Set a fallback guest user after 5s if nothing received
      const fallbackTimer = setTimeout(() => {
        setUser((prev) => {
          if (prev) return prev;
          return {
            uid: 'panx-guest',
            displayName: 'PANX Guest',
            email: 'guest@panx.ai',
            isGuest: true,
          };
        });
        setLoading(false);
      }, 5000);

      // Request auth from parent
      try {
        window.parent.postMessage({ type: 'PANX_AUTH_REQUEST' }, '*');
      } catch (e) { /* parent blocked */ }

      return () => {
        window.removeEventListener('message', handleMessage);
        clearTimeout(fallbackTimer);
        unsub();
      };
    } else {
      // Standalone mode: use Firebase Auth normally
      // Check for redirect result first (in case user is returning from Google sign-in via redirect)
      getRedirectResult(auth).catch(() => {});

      const unsub = onAuthStateChanged(auth, (u) => {
        setUser(u);
        setLoading(false);
      });
      return unsub;
    }
  }, []);

  // ═══════════════════════════════════════════
  //  GOOGLE SIGN-IN (with popup → redirect fallback)
  // ═══════════════════════════════════════════
  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();

    if (isInAppBrowser) {
      // In-app browsers block popups entirely.
      // Open in system browser instead.
      const currentUrl = window.location.href;
      window.open(currentUrl, '_system') || window.open(currentUrl, '_blank');
      throw new Error('OPEN_IN_BROWSER');
    }

    // Try popup first (works on desktop and most mobile browsers)
    try {
      return await signInWithPopup(auth, provider);
    } catch (popupError) {
      // If popup was blocked or failed, fallback to redirect
      const code = popupError?.code || '';
      if (
        code === 'auth/popup-blocked' ||
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request' ||
        popupError?.message?.includes('popup')
      ) {
        console.warn('Popup failed, falling back to redirect:', code);
        // signInWithRedirect will navigate away, onAuthStateChanged + getRedirectResult handle return
        return signInWithRedirect(auth, provider);
      }
      // Re-throw other errors
      throw popupError;
    }
  };

  // ═══════════════════════════════════════════
  //  EMAIL SIGN-IN / SIGN-UP
  // ═══════════════════════════════════════════
  const signInWithEmail = (email, password) =>
    signInWithEmailAndPassword(auth, email, password);

  const signUpWithEmail = (email, password) =>
    createUserWithEmailAndPassword(auth, email, password);

  // ═══════════════════════════════════════════
  //  PASSWORD RESET
  // ═══════════════════════════════════════════
  const resetPassword = (email) =>
    sendPasswordResetEmail(auth, email);

  // ═══════════════════════════════════════════
  //  GUEST MODE (anonymous auth)
  // ═══════════════════════════════════════════
  const signInAsGuest = async () => {
    const result = await signInAnonymously(auth);
    return result;
  };

  // Upgrade anonymous user to email account
  const upgradeGuestToEmail = async (email, password) => {
    if (!auth.currentUser?.isAnonymous) {
      throw new Error('Пользователь не является гостем');
    }
    const credential = EmailAuthProvider.credential(email, password);
    return linkWithCredential(auth.currentUser, credential);
  };

  // ═══════════════════════════════════════════
  //  SIGN OUT
  // ═══════════════════════════════════════════
  const handleSignOut = () => {
    if (isEmbedded) return;
    return firebaseSignOut(auth);
  };

  const value = {
    user,
    loading,
    isEmbedded,
    isInAppBrowser,
    isMobile,
    isPrivate,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    resetPassword,
    signInAsGuest,
    upgradeGuestToEmail,
    signOut: handleSignOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
