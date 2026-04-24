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
  onAuthStateChanged,
  browserLocalPersistence,
  setPersistence,
} from 'firebase/auth';
import { auth } from '../lib/firebase';

const AuthContext = createContext(null);

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
    return /Telegram|TelegramBot|Instagram|FBAN|FBAV|Twitter|Line\//i.test(ua);
  } catch { return false; }
})();

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set localStorage persistence for in-app browsers (avoids sessionStorage issues)
    if (isInAppBrowser) {
      setPersistence(auth, browserLocalPersistence).catch(() => {});
    }

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

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    if (isInAppBrowser) {
      // In-app browsers (Telegram, Instagram, etc.) block popups and break sessionStorage.
      // Instead of Google popup, open the app URL in the system browser.
      // This gives the user a proper browser where auth works normally.
      const currentUrl = window.location.href;
      window.open(currentUrl, '_system') || window.open(currentUrl, '_blank');
      throw new Error('OPEN_IN_BROWSER');
    }
    return signInWithPopup(auth, provider);
  };

  const signInWithEmail = (email, password) =>
    signInWithEmailAndPassword(auth, email, password);

  const signUpWithEmail = (email, password) =>
    createUserWithEmailAndPassword(auth, email, password);

  const handleSignOut = () => {
    if (isEmbedded) return;
    return firebaseSignOut(auth);
  };

  const value = { user, loading, signInWithGoogle, signInWithEmail, signUpWithEmail, signOut: handleSignOut, isEmbedded, isInAppBrowser };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
