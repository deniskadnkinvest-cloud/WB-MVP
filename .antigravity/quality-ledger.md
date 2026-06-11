# Quality Ledger — Seller Studio (VTON-MVP)

## Последний аудит: 2026-06-10 (Deep Audit v2.1, Level 3)

## Baseline метрики:
- **Build:** ✅ Проходит (Vite 8.0.8)
- **Lint:** ✅ 0 errors, 0 warnings
- **Route split:** ✅ `/offer`, admin, app/Auth грузятся отдельными чанками
- **Largest JS chunk:** AuthContext/Firebase ~458 KB (изолирован от `/offer`)
- **App JS chunk:** ~148 KB
- **CSS size:** App.css ~93.6 KB (возможен dead CSS)
- **useState count (App.jsx):** 73 (🚨 критический монолит)
- **console.log в продакшене:** 11 файлов (фронтенд) + 14 файлов (бэкенд)
- **Serverless Functions:** 12/12 (лимит Hobby Plan)
- **Rate Limiting:** частично отсутствует (нужно вводить лимиты на auth/generation/admin)
- **Error Boundaries:** ОТСУТСТВУЮТ
- **a11y (focus-visible):** ✅ глобальный в index.css
- **OTP Security:** 🟡 улучшено: Telegram initData HMAC, попытки ограничены, debug-код только DEV; нужен production rate limit
- **Public offer smoke:** ✅ `/offer` рендерится без Firebase/Auth и без console errors

## Зафиксированные решения (дизайн):
- [2026-06-10] Dark theme #050508 (bg-void) — намеренный дизайн
- [2026-06-10] Gold accent #D4A843 — фирменный цвет
- [2026-06-10] Glassmorphism rgba(255,255,255,0.03) — OK
- [2026-06-10] Fonts: Syne + Space Grotesk + JetBrains Mono — OK
- [2026-06-10] Focus ring: 2px solid gold, offset 3px — OK

## Регрессии (FATAL):
- Локальный `/` не может войти без заполненных `VITE_FIREBASE_*` значений в `.env.local`; добавлен понятный bootstrap fallback.

## Критические долги:
1. Атомарное серверное списание/резервирование кредитов с refund-on-failure.
2. Webhook верификация ЮKassa: подпись/IP allowlist/идемпотентная обработка.
3. Rate limiting на `/api/send-otp`, `/api/verify-otp`, `/api/generate-image`, admin endpoints.
4. Заполнить Firebase web env (`VITE_FIREBASE_*`) в локальной и production среде.
5. Декомпозиция App.jsx (монолит → feature modules).
6. Декомпозиция generate-image.js (монолит prompt/API logic → модули).

## Исправлено в Deep Audit v2.1:
- `/api/generate-image` требует Firebase Bearer token и проверяет активный тариф/баланс до генерации.
- `/api/create-payment` требует Firebase Bearer token и сверяет `uid` с токеном.
- Все frontend POST-запросы генерации идут через `authorizedFetch`.
- Фотосессия и редактирование кадра проверяют/списывают кредиты по факту успешного результата.
- Удалён hardcoded demo-блок подписки в PricingModal.
- OTP: Telegram chat id доверяется только после проверки Telegram Mini App initData.
- OTP: неверные попытки ограничены, debug-код не сохраняется вне DEV.
- `/offer` изолирован от Auth/Firebase и Telegram SDK.
- Telegram SDK больше не грузится статически на публичной оферте.
