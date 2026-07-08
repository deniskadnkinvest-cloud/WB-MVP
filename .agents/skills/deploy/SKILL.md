---
name: deploy
description: Полная инструкция по инфраструктуре, деплою и архитектуре серверов проекта VTON-MVP (Seller Studio). Активируй перед любым деплоем, настройкой серверов, работой с БД, хранилищем или AI-провайдерами.
---

# Deploy — Инфраструктура и деплой Seller Studio (VTON-MVP)

> **КРИТИЧНО:** Проект полностью ушёл с Vercel/Firebase/Supabase на собственные VPS-серверы (Timeweb Cloud).  
> **НИКОГДА** не упоминай Firebase, Supabase, Vercel как текущую инфраструктуру. Они НЕ ИСПОЛЬЗУЮТСЯ.  
> `vercel.json` — легаси-файл, может присутствовать в репо, но **игнорируется**.

---

## 1. Серверная топология

> **⚠️ ВНИМАНИЕ:** Сервер `nl-app-komunalka` (72.56.20.222) **ВЫВЕДЕН ИЗ ЭКСПЛУАТАЦИИ**.  
> Всё работает на одном сервере `rf-db-komunalka` (186.246.29.31).

| Сервер | Хостинг | Локация | IP | Спеки | Роль |
|--------|---------|---------|-----|-------|------|
| `rf-db-komunalka` | Timeweb Cloud | 🇷🇺 Россия | `186.246.29.31` | **4 CPU, 8 GB RAM, 80 GB NVMe** | **ALL-IN-ONE: App + DB + Storage** |

### Сетевая схема

```
Браузер / Telegram Mini App
  → HTTPS → seller-studio-ai.ru (186.246.29.31)
      → Traefik (SSL/LB, Let's Encrypt)
          → Docker-контейнер vton-mvp (port 3001)
              → PostgreSQL :5432 (localhost / same server)
              → MinIO :9000 (localhost / same server)

Внешние API:
├── KIE.ai (api.kie.ai) — AI генерация изображений
├── ЮKassa (api.yookassa.ru) — платежи
├── Telegram Bot API — авторизация + рассылки
└── Resend / SMTP — email OTP
```

### Подключение к серверу

```bash
ssh root@186.246.29.31
```

> ℹ️ WireGuard VPN больше не нужен — БД на том же сервере.  
> DATABASE_URL указывает на `localhost` или `127.0.0.1:5432`.

---

## 2. Стек и архитектура

| Компонент | Технология |
|-----------|-----------|
| Фронтенд | React (Vite) → собирается в `dist/` |
| Бэкенд | Node.js 20 + Express |
| Reverse Proxy | Traefik (Docker labels, Let's Encrypt) |
| БД | PostgreSQL (на rf-db-komunalka через WireGuard) |
| Хранилище файлов | MinIO (S3-совместимое, на rf-db-komunalka) |
| AI генерация | KIE.ai API (единственный провайдер) |
| Платежи | ЮKassa |
| Email OTP | Resend / SMTP |
| Авторизация | JWT (Telegram Mini App + Telegram Web Widget + Email OTP) |
| Контейнеризация | Docker + docker-compose |
| Event-driven | Inngest (Auto-Catalog, рассылки, авто-продление) |

---

## 3. Процесс деплоя

### ⚠️ Деплой РУЧНОЙ — нет CI/CD

**Пошаговый процесс:**

```bash
# 1. Локально: проверка lint (ОБЯЗАТЕЛЬНО)
npm run lint
# 0 errors = OK, warnings допустимы

# 2. SSH на сервер
ssh root@186.246.29.31

# 3. Перейти в директорию проекта
cd /path/to/vton-mvp

# 4. Подтянуть изменения (если через git)
git pull

# 5. Пересобрать и перезапустить контейнер
docker compose build && docker compose up -d

# 6. Проверить логи
docker logs vton-mvp --tail 50

# 7. Проверить здоровье
curl -s https://seller-studio-ai.ru/api/auth-ping
```

### Альтернативный быстрый деплой (без пересборки)

```bash
# Обновить только файлы внутри контейнера
docker cp ./api/. vton-mvp:/app/api/
docker cp ./dist/. vton-mvp:/app/dist/
docker restart vton-mvp
```

---

## 4. База данных

### Подключение (`api/_db.js`)

```javascript
// Локально на том же сервере — SSL НЕ нужен
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Fallback: postgresql://vton_user:***@localhost:5432/vton_mvp
  ssl: false,
  max: 30,
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 15000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 5000, // пинг для WireGuard
});
```

### Таблицы

| Таблица | Назначение |
|---------|-----------|
| `users` | id, telegram_id, email, role |
| `subscriptions` | plan_name, credits, status, expires_at, yookassa_payment_method_id |
| `payments` | yookassa_payment_id, amount, credits_amount, metadata JSONB |
| `generations` | type, status, duration_ms, credits_used, prompt, model, result_url |
| `otps` | email, code, expires_at, attempts |
| `temp_auth_sessions` | id, status, user_data JSONB |
| `stats_kv` | key-value глобальные счётчики |
| `daily_stats` | ежедневная статистика |
| `models` | сохранённые модели пользователя |
| `locations` | сохранённые локации |

### Миграции

```bash
node migrations/migrate-local.mjs
# Подключается напрямую к 186.246.29.31:5432 (без VPN)
```

---

## 5. Хранилище файлов — MinIO

| Параметр | Значение |
|----------|---------|
| Протокол | S3-compatible (`@aws-sdk/client-s3`) |
| Контейнер | `vton_minio` на rf-db-komunalka |
| Endpoint | `http://<S3_ENDPOINT>:9000` (через env) |
| Бакет | `vton-uploads` |
| Путь файлов | `users/{uid}/{folder}/{filename}` |

### API операции (`api/upload.js`)

- **POST** `/api/upload` — загрузка (base64 → MinIO)
- **GET** `/api/upload?key=...` — скачивание (MinIO → base64)
- **DELETE** `/api/upload?key=...` — удаление
- Авторизация: JWT Bearer token

---

## 6. AI-провайдеры

### KIE.ai — единственный провайдер генерации

| Параметр | Значение |
|----------|---------|
| API Create Task | `https://api.kie.ai/api/v1/jobs/createTask` |
| File Upload | `https://kieai.redpandaai.co/api/file-base64-upload` |
| Polling | `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=` |
| Модель | `gpt-image-2-image-to-image` |
| Макс. параллельных | 5 (`MAX_CONCURRENT_KIE_TASKS`) |
| Idempotency | in-memory Map, TTL 30 мин |

### Другие API ключи в .env (НЕ используются в коде)

- `GEMINI_API_KEY` — не используется ни в одном API файле
- `REVE_API_KEY` — не используется в коде

---

## 7. Платежи — ЮKassa

| Параметр | Значение |
|----------|---------|
| Webhook | `api/payment-webhook-yookassa.js` |
| IP whitelist | `185.71.76.*`, `185.71.77.*`, `77.75.153.*`, `77.75.154.*` |
| Env | `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY` |

**⚠️ НЕ трогай whitelist IP без явного указания** — это уже ломалось дважды.

---

## 8. Авторизация

| Метод | Эндпоинт | Описание |
|-------|----------|---------|
| Email OTP | `/api/send-otp` + `/api/verify-otp` | Код на почту, основной метод |
| Telegram Mini App | `/api/auth-telegram` | initData + HMAC-SHA256 |
| Telegram Web Widget | `/api/auth-telegram-widget` | Браузерный виджет, HMAC-SHA256 |
| Guest | Клиентский | Ограниченный режим |

Все методы → единый JWT → `users` таблица → UID формат `tg_{telegramId}`.

---

## 9. Бэкапы

| Что | Частота | Где |
|-----|---------|-----|
| PostgreSQL dumps | Daily | `/root/vton-backups/daily` на rf-db-komunalka |
| MinIO data archives | Daily | `/root/vton-backups/daily` на rf-db-komunalka |
| Зеркало бэкапов | Daily | `/root/vton-backups-db-mirror` на nl-app-komunalka |

---

## 10. Docker-файлы

### Dockerfile (multi-stage)

```dockerfile
# Build Stage: Vite фронтенд
FROM public.ecr.aws/docker/library/node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Production Stage
FROM public.ecr.aws/docker/library/node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY server.js .
COPY server-autocatalog.js .
COPY api ./api
COPY --from=build /app/dist ./dist
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
CMD ["node", "server.js"]
```

### .dockerignore

```
.git, node_modules, dist, .vercel, .antigravity, .claude
.env, .env.* (кроме .env.local.example)
npm-debug.log*, scratch, test-results, coverage
```

---

## 11. Переменные окружения (.env)

```bash
# БД (localhost — всё на одном сервере rf-db-komunalka)
DATABASE_URL=postgresql://vton_user:***@localhost:5432/vton_mvp

# Хранилище MinIO
S3_ENDPOINT=http://host:9000
S3_ACCESS_KEY=***
S3_SECRET_KEY=***
S3_BUCKET=vton-uploads

# AI
KIE_API_KEY=***
# GEMINI_API_KEY=*** (не используется)

# Авторизация
JWT_SECRET=***
TELEGRAM_BOT_TOKEN=***
TELEGRAM_ADMIN_CHAT_ID=***

# Платежи
YOOKASSA_SHOP_ID=***
YOOKASSA_SECRET_KEY=***

# Email
RESEND_API_KEY=***
# или SMTP конфиг

# Админка
ADMIN_ACCESS_KEY=***
ADMIN_TELEGRAM_IDS=***
```

---

## 12. Inngest — Event-Driven

| Функция | Назначение |
|---------|-----------|
| `catalog-started` | Master worker Auto-Catalog, fan-out SKU |
| `process-single-sku` | Classify → Map → Generate → QA → Save (concurrency: 5) |
| `broadcast-send` | Telegram рассылка (30 юзеров/batch) |
| `subscription-auto-renew` | Cron `0 3 * * *`, авто-продление через ЮKassa |

---

## 13. Чеклист перед деплоем

```
1. [ ] npm run lint → 0 errors
2. [ ] Проверить template literals в api/ файлах (особенно generate-image.js)
3. [ ] Проверить незакрытые скобки
4. [ ] export default function handler — присутствует и закрыт
5. [ ] node --check api/<изменённый-файл>.js → OK
6. [ ] docker compose build && docker compose up -d
7. [ ] curl https://seller-studio-ai.ru/api/auth-ping → 200
8. [ ] docker logs vton-mvp --tail 30 → нет ошибок
```

---

## ⛔ ЗАПРЕЩЕНО

- Упоминать Firebase, Supabase, Vercel как текущую инфраструктуру
- Трогать whitelist IP ЮKassa без явного указания
- Хардкодить API-ключи в коде (только `process.env`)
- Вызывать AI API в циклах без `await` между итерациями
- Деплоить без `npm run lint`
