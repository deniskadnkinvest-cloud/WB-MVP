# docs/PROJECT_STATE.md — Текущее состояние VTON MVP

## Что сделано
- Настроен холст примерки и клиентская загрузка/удаление фона у фотографий пользователей.
- Написана интеграция с Google GenAI для процессинга изображений.
- Развернут Inngest для очередей задач (каталогизация, процессинг).
- Подключен Firebase Admin SDK на сервере.
- Подключена YooKassa-оплата тарифов: `trial` 500 ₽ разово, `base` 5 000 ₽/мес, `pro` 14 990 ₽/мес.
- Опубликована публичная оферта на `/offer`; маршрут изолирован от Auth/Firebase и проходит smoke-тест.
- Генерация и создание платежей требуют Firebase Bearer token на сервере.
- OTP-вход усилен: проверка Telegram initData, лимит неверных попыток, debug-код только в DEV.
- Frontend route splitting уменьшил initial route payload: `/offer`, admin и app/Auth грузятся отдельно.

## Что в разработке
- Тонкая настройка промптов генерации одежды для повышения качества примерки.
- Автоматический парсинг карточек Wildberries для наполнения каталога товаров (в `server-autocatalog.js`).
- Полировка production auth/env: локальные `VITE_FIREBASE_*` сейчас пустые, поэтому `/` показывает понятный fallback до заполнения Firebase web config.

## Известные проблемы
- Inngest требует запущенного локально dev-сервера Inngest для локального тестирования (`npm run catalog:inngest`).
- Нет атомарного серверного резервирования кредитов с возвратом при failed generation.
- Нет production rate limiting на OTP/generation endpoints.
- Нужна верификация YooKassa webhook на уровне подписи/IP allowlist и идемпотентности.
