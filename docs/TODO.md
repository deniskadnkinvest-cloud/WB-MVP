# docs/TODO.md — Список задач VTON MVP

## Critical
- [ ] Заполнить реальные `VITE_FIREBASE_*` значения в локальной и production среде.
- [ ] Добавить атомарное серверное резервирование кредитов перед генерацией и возврат при failed generation.
- [ ] Добавить production rate limiting на `/api/send-otp`, `/api/verify-otp`, `/api/generate-image`.
- [ ] Усилить YooKassa webhook: подпись/IP allowlist, защита от повторной обработки `payment.id`.

## High
- [ ] Декомпозировать `src/App.jsx` на feature modules: upload, generation, product mode, photoshoot, billing.
- [ ] Декомпозировать `api/generate-image.js` на prompt builders, KIE client, auth/subscription guard, response helpers.
- [ ] Перевести обычный card designer на тот же editable DOM/Canvas-подход, что и quick mode, чтобы полностью убрать растровые карточки с запечённым текстом.
- [ ] Оптимизировать скорость загрузки моделей удаления фона `@imgly/background-removal` (кэширование WASM-ресурсов).
- [ ] Покрыть тестами интеграцию с Firebase в `test-autocatalog.js`.

## Medium
- [ ] Добавить Error Boundary для основного приложения и админки.
- [ ] Убрать лишние production `console.log`/PII-логи.
- [ ] Добавить smoke/e2e для `/offer`, login fallback, pricing modal, credit guards.
- [ ] Добавить authenticated smoke/e2e для Quick Mode Smart Canvas с валидными `VITE_FIREBASE_*` и тестовым пользователем/кредитами.

## Later
- [ ] Добавить поддержку примерки нескольких вещей одновременно (слои).
- [ ] Улучшить observability: Sentry/Axiom, алерты по ошибкам генерации и оплат.
