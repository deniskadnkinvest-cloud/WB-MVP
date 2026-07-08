import { useEffect } from "react";

// Fixes the Telegram Mini App to full height and disables the swipe-down-to-close gesture.
// Must be mounted ONCE at the app root. Safe no-op outside Telegram.
// Note: disableVerticalSwipes() needs Bot API 7.7+; on older clients it's a no-op and the
// CSS overscroll-behavior backstop (index.css) takes over.
export default function TelegramInit() {
  useEffect(() => {
    let cancelled = false;

    const lock = (tg) => {
      try { tg.expand?.(); } catch { /* ignore */ }
      try { tg.disableVerticalSwipes?.(); } catch { /* ignore */ }
    };

    let attempts = 0;
    const interval = setInterval(() => {
      const tg = window.Telegram?.WebApp;
      if (!tg) {
        if (++attempts > 80) clearInterval(interval);
        return;
      }
      clearInterval(interval);
      if (cancelled) return;

      try { tg.ready(); } catch { /* ignore */ }
      lock(tg);

      try {
        tg.setHeaderColor("#050508");
        tg.setBackgroundColor("#050508");
      } catch (e) {
        console.warn("Failed to set TG colors:", e);
      }

      // Telegram can silently re-enable vertical swipes after the viewport settles or the
      // app is expanded — re-assert the lock a few times and on every viewport change.
      [120, 400, 1000, 2500].forEach((d) =>
        setTimeout(() => { if (!cancelled) lock(tg); }, d)
      );
      try { tg.onEvent?.("viewportChanged", () => lock(tg)); } catch { /* ignore */ }
    }, 50);

    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return null;
}
