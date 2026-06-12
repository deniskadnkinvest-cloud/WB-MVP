# Quality Ledger — Seller Studio (VTON-MVP)

## Последний аудит: 2026-06-12 (Quick Mode Product Craftsmanship pass)

## Baseline метрики:
- **Build:** ✅ Проходит (Vite 8.0.8, 195ms)
- **Bundle App.js:** ~146 KB (без изменений)
- **Bundle AuthContext:** ~456 KB (Firebase, изолирован)
- **console.log в продакшене:** 24 (api/generate-image.js) + 10+ (App.jsx) — не исправлено
- **isCardDesign handler:** ✅ Добавлен и работает
- **refreshCreditsFromResponse:** ✅ Добавлена (Firestore re-fetch)
- **Quick Mode ("В два клика"):** ✅ Исправлен (был сломан ReferenceError)
- **Quick Mode Smart Canvas:** ✅ 1 кредит за студийное фото + 1 кредит только на экспорт PNG-карточки

## Зафиксированные решения (дизайн):
- [2026-06-10] Dark theme #050508 (bg-void) — намеренный дизайн
- [2026-06-10] Gold accent #D4A843 — фирменный цвет
- [2026-06-10] Glassmorphism rgba(255,255,255,0.03) — OK
- [2026-06-10] Fonts: Syne + Space Grotesk + JetBrains Mono — OK
- [2026-06-10] Focus ring: 2px solid gold, offset 3px — OK
- [2026-06-11] window.__humanModelPrompt/RefImages — намеренный паттерн (MVP, не трогать)

## Исправлено в Deep Audit v2.0 (2026-06-11):
1. **isCardDesign backend handler** — добавлен полный handler с 2 стилями (Natural/Epic)
2. **generateImageRequest undefined** → заменено на прямой fetch()
3. **refreshCreditsFromResponse undefined** → добавлена как Firestore re-fetch функция
4. **data ReferenceError** на строке 656 → заменено на results.find()
5. **base64 vs URL auto-detection** в startCardGeneration

## Исправлено 2026-06-12 — Quick Mode Smart Canvas:
1. **Удалён blind step 2 в quick mode** — больше нет автоматического `isCardDesign` AI-запроса с выдуманной ценой/текстом.
2. **Magic Input** — одна опциональная строка фактов; без ввода используются плейсхолдеры, а не галлюцинации.
3. **Editable card layers** — карточка собирается DOM-слоями поверх чистого фото, поля редактируются до экспорта.
4. **Pay-to-export** — 1 кредит списывается за студийное фото, второй только при скачивании PNG-карточки.
5. **Prompt guard для старого `isCardDesign`** — запрещены выдуманные цены, скидки, рейтинги, точные материалы/размеры/бренды.
6. **Verification** — `npm run lint` ✅, `npm run build` ✅. Browser smoke app UI заблокирован локальным `auth/invalid-api-key` из-за пустых Firebase web env.

## Регрессии (FATAL):
- ❌ [2026-06-11] Quick Mode снова был сломан (ReferenceError) — причина: при рефакторинге handleQuickGenerate был добавлен вызов несуществующей `generateImageRequest`. ЗАКРЫТО.

## Критические долги (актуальные):
1. SSRF: `sourceImageUrl` без URL whitelist на бэкенде (api/generate-image.js #888, #999)
2. Rate limiting отсутствует на /api/send-otp (DDoS риск на Resend quota)
3. Хардкод `localhost:3002` в handleAutoCatalog — Auto-Catalog сломан в продакшне
4. X-Frame-Options: ALLOWALL → нужен конкретный домен t.me/web.telegram.org
5. 73 useState в App.jsx — монолит (перенесено из предыдущего аудита)
6. Error Boundaries отсутствуют (перенесено)
