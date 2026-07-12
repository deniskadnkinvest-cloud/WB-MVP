# AGENTS.md — Конституция проекта Seller Studio (VTON-MVP)

> **ЭТОТ ДОКУМЕНТ — ЗАКОН.** Любой AI-агент, работающий с этим проектом, ОБЯЗАН прочитать его ПОЛНОСТЬЮ перед любыми изменениями. Нарушение правил этого документа приравнивается к критической ошибке.

---

## 🏢 Что это за проект

**Seller Studio** (кодовое имя VTON-MVP) — SaaS-платформа для продавцов маркетплейсов (Wildberries, Ozon, Instagram). Генерирует фотореалистичные карточки товаров с AI-моделями, предметную съёмку, UGC-фото и дизайн карточек. Работает как Telegram Mini App и Web App.

**Домен:** `seller-studio-ai.ru`
**Бренд:** PAN.X / Seller Studio

---

## ⛔ ИНФРАСТРУКТУРА (VPS, НЕ Vercel)

> **КРИТИЧЕСКОЕ ПРАВИЛО:** Проект полностью ушёл с Vercel/Firebase/Supabase на собственные VPS-серверы. НИКОГДА не упоминай Firebase, Supabase, Vercel как текущую инфраструктуру.

| Параметр | Значение |
|----------|----------|
| **Сервер** | `rf-db-komunalka` — Timeweb Cloud 🇷🇺 |
| **IP** | `186.246.29.31` |
| **Спеки** | 4 CPU, 8 GB RAM, 80 GB NVMe |
| **SSH** | `root@186.246.29.31`, ключ: `C:\Users\LORD-KSON\Desktop\ТРЕКОПЁС\sanya_trekopes` |
| **Стек** | Node.js 20 + Express, React (Vite), Docker, Traefik (SSL), PostgreSQL, MinIO |
| **AI-провайдер** | **KIE.ai** (единственный для генерации изображений) |
| **AI-анализ** | Gemini 2.5 Flash (только для detect-elements, identify-element, generate-card-text) |
| **Платежи** | ЮKassa |
| **Auth** | JWT (Telegram Mini App + Widget + Email OTP + VK OAuth + Яндекс OAuth) |
| **Event-driven** | Inngest (автокаталог, автопродление подписок) |

### Сетевая схема
```
Браузер/Telegram → HTTPS → seller-studio-ai.ru (186.246.29.31)
  → Traefik (SSL/LB) → Docker vton-mvp (port 3001)
    → PostgreSQL :5432
    → MinIO :9000
    → KIE.ai API (внешний)
    → ЮKassa API (внешний)
    → Gemini API (внешний, только анализ)
```

---

## 🚨 ЖЕЛЕЗНЫЙ ПРОТОКОЛ ДЕПЛОЯ

**НИКОГДА не говори "задеплоено" без выполнения ВСЕХ 4 шагов:**

```bash
# ШАГ 1 — Загрузка файла
scp -i "путь_к_ключу" -o StrictHostKeyChecking=no "<файл>" root@186.246.29.31:/root/vton-mvp-app/...

# ШАГ 2 — Верификация файла на сервере
ssh ... "grep -n '<изменённый_текст>' /root/vton-mvp-app/..."

# ШАГ 3 — Пересборка с --no-cache
ssh ... "cd /root/vton-mvp-app && docker compose build --no-cache vton-mvp && docker compose up -d vton-mvp"

# ШАГ 4 — Верификация бандла
ssh ... "docker exec vton-mvp grep -ro '<изменённый_текст>' /app/dist/assets/"

# ШАГ 5 — Синхронизация с GitHub (ОБЯЗАТЕЛЬНО)
git add "<файл>" && git commit -m "deploy: update <файл>" && git push
```

> **ЖЕЛЕЗНОЕ ПРАВИЛО:** Каждый раз, когда происходит деплой на сервер через scp, в том же шаге ОБЯЗАТЕЛЬНО выполняется `git commit` + `git push` без исключений. Так GitHub физически не сможет отстать от продакшена.

> **Исключение:** файл `api/_prompts.js` НЕ требует `docker build` — достаточно `scp` + `docker restart vton-mvp` (и, конечно, обязательный `git commit` + `git push`).

---

## 📐 АРХИТЕКТУРА ПРИЛОЖЕНИЯ

### Структура проекта
```
src/
├── App.jsx                    — 5500 строк, МОНОЛИТ фронтенда (ВСЯ бизнес-логика)
├── App.css                    — глобальные стили
├── components/
│   ├── PersonaWizard.jsx      — 680 строк, создание AI-персонажа (4-frame comp card)
│   ├── ModelCalibrationWizard.jsx — 996 строк, пошаговая калибровка модели
│   ├── LoraModal.jsx          — 375 строк, добавление своей модели по фото (4 ракурса)
│   ├── PricingModal.jsx       — 244 строки, выбор тарифа
│   ├── PricingModal.css       — стили тарифов + анимации
│   ├── SubscriptionBadge.jsx  — 90 строк, бейдж подписки в header
│   ├── TerminalOfMagic.jsx    — 166 строк, прогрессбар генерации
│   ├── SmartCardEditor.jsx    — редактор карточек (crop, text overlay)
│   ├── LoginPage.jsx          — 550 строк, авторизация (Email OTP, Telegram, VK, Яндекс)
│   ├── MyHistoryPage.jsx      — 600 строк, история генераций
│   ├── TelegramInit.jsx       — инициализация Telegram Mini App (disableVerticalSwipes, expand)
│   ├── DetailPanel.jsx        — панель детальных настроек модели
│   └── GenderToggle.jsx       — переключатель пола
├── data/
│   └── presets.js             — ВСЕ пресеты (модели, позы, фоны, форматы, предметка)
├── lib/
│   ├── subscriptionService.js — PLANS, getSubscription, consumeCredit
│   ├── userDataService.js     — сохранение/загрузка моделей и локаций
│   └── api.js                 — apiFetch wrapper
api/
├── generate-image.js          — 3537 строк, ЯДРО генерации (ВСЯ AI-логика)
├── _prompts.js                — 137KB, ВСЕ промпты (RU/EN), 15 категорий
├── _db.js                     — PostgreSQL connection pool
├── _s3.js                     — MinIO S3 client
├── _admin-alerts.js           — Telegram-уведомления админу
├── create-payment.js          — создание платежа ЮKassa
├── payment-webhook-yookassa.js — webhook обработка платежей
├── subscription.js            — GET/POST подписки
├── consume-credit.js          — legacy endpoint списания (deprecated)
├── cancel-subscription.js     — отмена автопродления
├── send-otp.js / verify-otp.js — Email OTP авторизация
├── auth-telegram.js           — Telegram Mini App авторизация
├── auth-telegram-widget.js    — Telegram Widget авторизация
├── auth-vk.js / auth-vk-callback.js — VK OAuth
├── auth-yandex.js / auth-yandex-callback.js — Яндекс OAuth
├── upload.js                  — MinIO upload/download/delete
├── user-data.js               — CRUD моделей и локаций
├── admin.js                   — Admin panel API router
└── _inngest/                  — Inngest event functions
server.js                      — Express сервер (маршрутизация)
Dockerfile                     — Multi-stage (Vite build → Node.js production)
```

---

## 🔥 СВЯЩЕННЫЕ ФАЙЛЫ (DO NOT BREAK)

### 1. `api/generate-image.js` — ЯДРО ГЕНЕРАЦИИ (3537 строк)

> ⚠️ **МАКСИМАЛЬНО ОПАСНЫЙ ФАЙЛ.** Любое редактирование требует `npm run lint` после сохранения. Нарушение логики = сломанная генерация = потеря денег.

#### Режимы генерации (15 штук):

| Режим | Флаг | Кредиты | Описание |
|-------|------|---------|----------|
| Fashion VTON | default | 1 | Виртуальная примерка одежды |
| Calibration | `isCalibration` | 1 | Калибровка модели (4 ракурса) |
| Quick Card | `isQuickCard` | 2 (1 photo-only) | Быстрая карточка маркетплейса |
| Model Card | `isModelCard` | 2 (1 photo-only) | Карточка с моделью |
| UGC | `isUgcMode` | 1 | Фото "от покупателя" |
| Product | `isProductMode` | 1 | Предметная съёмка |
| Card Design | `isCardDesign` | 1 | Дизайн карточки |
| Photo Edit | `isPhotoEdit` | 1 | Редактирование фото по тексту |
| Create Persona | `action='create-persona'` | **3** | Создание персонажа (4-frame comp card) |
| Generate Missing Angle | `action='generate-missing-angle'` | 1 | Догенерация недостающего ракурса |
| Edit Card | `action='edit-card'` | 1 | Редактирование карточки текстом |
| Detect Elements | `action='detect-elements'` | 0 | Gemini Vision: поиск элементов |
| Identify Element | `action='identify-element'` | 0 | Gemini Vision: идентификация |
| Generate Card Text | `action='generate-card-text'` | 0 | Gemini Vision: текст для карточки |
| Photoshoot | `isPhotoshoot` (VTON variant) | 1 | Фотосессия (3-5 ракурсов) |

#### Критичные подсистемы внутри generate-image.js:

1. **Reserve-Commit-Refund Pattern** — кредиты резервируются ДО генерации, возвращаются при ошибке, коммитятся при успехе. Атомарный SQL: `UPDATE subscriptions SET credits = credits - N WHERE credits >= N RETURNING credits`.

2. **Idempotency** — дублирующие запросы с одинаковым ключом возвращают кэшированный ответ. TTL 30 мин, max 200 записей.

3. **Gender Detection** (`detectGender`) — regex-парсер для определения пола модели. Поддерживает: `male, man, boy, мужчина, парень, дед, мальчик, дедушка, славянин, азиат, европеец, африканец, латиноамериканец`. Default: `female`.

4. **Biometric Noise** — 18 микро-признаков (асимметрия челюсти, родинки, веснушки) для уникальности лиц.

5. **KIE.ai Concurrency Limiter** — max 5 параллельных задач. Polling: до 100 попыток с адаптивным интервалом (2s → 12s).

6. **Adaptive Fashion** — специальные директивы для моделей с инвалидностью (ампутация, протезы, инвалидные кресла).

### 2. `api/_prompts.js` — ВСЕ ПРОМПТЫ (137KB)

> ⚠️ **НЕЛЬЗЯ МЕНЯТЬ БЕЗ ТЕСТИРОВАНИЯ.** Каждый промпт — результат десятков итераций с GPT Image 2. Изменение одного слова может кардинально изменить качество генерации.

#### Карта промптов (15 категорий):

| # | Фича | Ключ в `PROMPTS_RU` | Папка на рабочем столе |
|---|------|---------------------|------------------------|
| 01 | Создание персонажа | `CREATE_PERSONA_PROMPT` | `01 - Создание персонажа` |
| 02 | Генерация ракурса | `GENERATE_ANGLE_PROMPT` | `02 - Генерация ракурса` |
| 03 | Редактирование карточки | `EDIT_CARD_PROMPT` | `03-Редактирование-карточки` |
| 04 | Текст для карточки | `GENERATE_CARD_TEXT_PROMPT` | `04-Текст-для-карточки` |
| 05 | Редактирование фото | `PHOTO_EDIT_PROMPT` | `05-Редактирование-фото` |
| 06 | Калибровка модели | `SKIN_REALISM_PROMPT` / `SKIN_BEAUTY_PROMPT` | `06-Калибровка-модели` |
| 07 | Карточка с моделью | `MODEL_CARD_PROMPT_NATURAL` / `_EPIC` | `07-Карточка-с-моделью` |
| 08 | UGC фото | `UGC_PROMPT` | `08-UGC-фото` |
| 09 | Быстрая карточка | `QUICK_CARD_PROMPT_NATURAL` / `_EPIC` | `09-Быстрая-карточка` |
| 10 | Дизайн карточки | `EPIC_CARD_DESIGN_PROMPT` / `NATURAL_CARD_DESIGN_PROMPT` | `10-Дизайн-карточки` |
| 11 | Предметная съёмка | `PRODUCT_PHOTO_PROMPT` | `11-Предметная-съёмка` |
| 12 | Виртуальная примерка | `VTON_PROMPT` | `12-Виртуальная-примерка-VTON` |
| 13 | Определение элементов | `DETECT_ELEMENTS_PROMPT` | `13-Определение-элементов` |
| 14 | Идентификация элемента | `IDENTIFY_ELEMENT_PROMPT` | `14-Идентификация-элемента` |
| 15 | Автокаталог (Inngest) | `AUTOCATALOG_PROMPT` | `15-Автокаталог-Inngest` |

**Путь к папке с промптами:** `C:\Users\LORD-KSON\Desktop\IIapoJlu и DaHHble\Seller-Studio\Промты RUS\`

#### Процесс обновления промптов:
1. Пользователь тестирует промпт в ChatGPT (GPT Image 2)
2. Присылает улучшенный текст
3. Агент вставляет в `api/_prompts.js` → блок `PROMPTS_RU`
4. Деплой: `scp` + `docker restart vton-mvp` (без build!)

### 3. `src/App.jsx` — МОНОЛИТ ФРОНТЕНДА (5500 строк)

> ⚠️ **САМЫЙ БОЛЬШОЙ ФАЙЛ.** Содержит ВСЮ бизнес-логику фронтенда: 100+ useState, 30+ handler-функций, 3 режима работы.

#### 3 режима приложения (`appMode`):

| Режим | Описание |
|-------|----------|
| `'fashion'` | **Классический VTON** — полный конфигуратор: модели × позы × камеры × фоны × форматы × варианты. Параллельная генерация через `Promise.allSettled`. Фотосессия (3-5 ракурсов). |
| `'quick'` | **Быстрый VTON** — 4 подрежима: Photo, Card (2 кредита), UGC, Model. "Upsell Dashboard" после генерации: Gallery (4 слайда), A/B Test, UGC. |
| `'product'` | **Предметная съёмка** — 10 категорий товаров, 5 композиций, 5 фонов, 7 эффектов. Опциональная модель-человек. |

#### 3-уровневая система моделей:

| Уровень | Описание | Где хранятся |
|---------|----------|--------------|
| **Пресеты** | 10 этнических типажей (Славянка, Азиатка, Европейка...) | `src/data/presets.js` |
| **Quick Picks** | 8 маркетинговых типажей (Спортивная девушка, Огненно-рыжая, Альбинос...) | `PersonaWizard.jsx` |
| **Сохранённые модели** | Persona (comp card) / LoRA (4 фото) / Generated / Calibrated | PostgreSQL + MinIO |

#### Ключевые handler-функции (НЕ ЛОМАТЬ):

| Функция | Что делает |
|---------|-----------|
| `handleGenerate` | Главная генерация: строит flat task list, параллельный `Promise.allSettled`, batch confirm ≥6 |
| `handleQuickGenerate` | Быстрый режим: маршрутизация по 4 подрежимам (photo/card/ugc/model) |
| `handlePhotoshoot` | Фотосессия: 3-5 параллельных ракурсов |
| `handleRegenerate` | Stateless перегенерация с `shotModifier` (НИКОГДА не отправляет сгенерированное фото назад) |
| `handleCardEdit` | Текстовое редактирование карточки |
| `handleGenerateGallery` | 4-слайдовая галерея: обложка + макро + инфографика + лайфстайл |
| `handleGenerateABTest` | A/B тест: Natural vs Epic варианты |
| `savePersonaModel` | Сохранение персонажа из PersonaWizard |
| `saveLoraModel` / `updateLoraModel` | Сохранение/обновление LoRA-модели |
| `handleSelectPlan` | Оплата через ЮKassa: create-payment → redirect |
| `handlePreviewModel` | Превью модели с текстовым модификатором |

#### Редактирование моделей (ТЩАТЕЛЬНО ПРОРАБОТАНО):

1. **Persona (сгенерированная модель):** Кнопка «✏️ Изменить модель» → открывает `PersonaWizard` в режиме `editModel`. Единственная кнопка «Сохранить». При конфликте имён → модальное окно «Заменить» / «Сохранить как копию» (автоинкремент: "Старье 3").
2. **LoRA (своя модель по фото):** Кнопка «✏️ Изменить модель» → открывает `LoraModal` с предзаполненными ракурсами. Можно удалить ракурс (✕) и перегенерировать.
3. **Модификатор (все типы):** Текстовый инпут «✏️ Внести изменения» → превью → «Сохранить как новую модель».
4. **Кнопки-карандашики (✏️):** Удалены с аватарок в сетке. Редактирование — ТОЛЬКО через главную кнопку «✏️ Изменить модель» при выделении.
5. **В Предметке:** Тот же функционал редактирования полностью продублирован.
6. **Кнопка «Еще вариант»:** Убрана из режима редактирования (нет логики).

### 4. `src/data/presets.js` — ПРЕСЕТЫ (400 строк)

| Категория | Количество | Примеры |
|-----------|-----------|---------|
| Модели (`MODEL_PRESETS`) | 10 (5 жен + 5 муж) | Славянка, Азиатка, Европейка, Африканка, Латина + мужские |
| Детали (`getModelDetails`) | 6 параметров | Телосложение, Цвет/Длина волос, Эмоция, Пирсинг, Тату |
| Позы (`POSE_PRESETS`) | 6 | Прямо, Вполоборота, В движении, Сидя, Облокотившись, Руки на бёдрах |
| Фоны (`BACKGROUND_PRESETS`) | 7 | Белая/Серая студия, Улица, Москва, Милан, Лакшери интерьер, Природа |
| Форматы (`ASPECT_RATIOS`) | 5 | 3:4 (WB/Ozon), 1:1 (Instagram), 9:16 (Stories), 4:3, 16:9 |
| Камеры (`CAMERA_ANGLES`) | 3 | Полный рост, По пояс, Крупно |
| Категории товаров (`PRODUCT_CATEGORIES`) | 10 | Косметика, БАДы, Декор, Электроника, Зоотовары, Парфюм... |
| Композиции товаров (`PRODUCT_COMPOSITIONS`) | 5 | Натюрморт, Flat Lay, Макро, Диагональ, В руке |
| Фоны товаров (`PRODUCT_BACKGROUNDS`) | 5 | Чистая эстетика, Эко-органика, Сканди, Урбан-тех, Рабочий стол |
| Эффекты товаров (`PRODUCT_EFFECTS`) | 7 | Брызги воды, Мазок крема, Пламя, Лепестки, Капсулы, Свой |

### 5. `src/components/PersonaWizard.jsx` — QUICK PICKS

**8 маркетинговых типажей** (тщательно подобранные промпты для маркетплейсов):

| Кнопка | Промпт (ключевые слова) |
|--------|------------------------|
| 🏃‍♀️ Спортивная девушка | Athletic fitness model, toned body, 25yo, DSLR, 8k |
| 👱‍♀️ Милая блондинка | Cute blonde, 22yo, blue eyes, fresh face, freckles |
| 👔 Деловой мужчина | Corporate male, 35yo, clean-shaven, studio softbox |
| ✨ Plus-size модель | Plus-size female, curvy, 28yo, confident, editorial |
| 🦊 Огненно-рыжая | Redhead, 23yo, freckles, copper hair, emerald eyes |
| ❄️ Девушка-альбинос | Albino female, 22yo, white hair, porcelain skin |
| 🛹 Неформалка (Гранж) | Alternative, 20yo, wolf cut, piercings, tattoos, 35mm |
| 🐺 Седовласый (45+) | Mature male, 48yo, silver hair, grey beard, blue eyes |

---

## 💰 СИСТЕМА БИЛЛИНГА (НЕ ЛОМАТЬ)

### Тарифные планы:

| Plan | Кредиты | Цена | Период | AutoRenew |
|------|---------|------|--------|-----------|
| `none` | 0 | — | — | — |
| `trial` (Тест-драйв 🎯) | 10 | 500₽ | разово | нет |
| `base` (Про ⚡) | 100 | 5 000₽ | /мес | да |
| `pro` (Gold Seller 👑) | 350 | 14 990₽ | /мес | да |

### Top-Up пакеты (определены в `create-payment.js`):

| Пакет | Кредиты | Цена |
|-------|---------|------|
| `topup_5` | 5 | 249₽ |
| `topup_10_trial` | 10 | 449₽ |
| `topup_10` | 10 | 390₽ |
| `topup_30` | 30 | 1 090₽ |
| `topup_50` | 50 | 1 790₽ |
| `topup_100` | 100 | 3 490₽ |
| `topup_150` | 150 | 4 490₽ |
| `topup_350` | 350 | 8 990₽ |

> ⚠️ **НЕДОСТРОЕННАЯ ФИЧА:** Top-Up пакеты определены на бэкенде, но **НЕТ UI** для их покупки (нет TopUpModal). `SubscriptionBadge` имеет кнопку «Пополнить генерации», но `onTopUp` callback не подключен в App.jsx.

### Полный billing flow:

```
Клик "Подключить тариф" → PricingModal → handleSelectPlan(planId)
  → POST /api/create-payment (ЮKassa API, capture=true)
  → Редирект на ЮKassa (Telegram: WebApp.openLink)
  → Пользователь платит
  → ЮKassa → POST /api/payment-webhook-yookassa
    → IP whitelist: 185.71.76.*, 185.71.77.*, 77.75.153.*, 77.75.154.*
    → PostgreSQL транзакция: UPSERT users → UPSERT subscriptions → INSERT payments
    → topup: ADD credits к существующим
    → plan: REPLACE план + credits + expires_at (+1 month)
  → Return URL → App.jsx polling (8 × 1.5s) → "✅ Тариф активирован!"
```

### Фичи по планам:

| Feature | none | trial | base | pro |
|---------|------|-------|------|-----|
| Сохранение моделей | ❌ | ❌ | ✅ | ✅ |
| Свои локации | ❌ | ❌ | ✅ | ✅ |
| Фотосессия | ❌ | ❌ | ✅ | ✅ |
| Пресеты | ❌ | ✅ | ✅ | ✅ |
| Свои промпты | ❌ | ✅ | ✅ | ✅ |
| Fast Track | ❌ | ❌ | ❌ | ✅ |

### UID Architecture:
- Все идентификаторы через `tg_{id}`, `vk_{id}`, `ya_{id}`
- Fallback поиск: telegram_id → stripped telegram_id → email
- НИКОГДА не менять формат UID

---

## 🗄️ БАЗА ДАННЫХ (PostgreSQL)

| Таблица | Назначение |
|---------|-----------|
| `users` | Пользователи (telegram_id unique, email, role) |
| `subscriptions` | Подписки (plan_name, credits, expires_at, auto_renew) |
| `payments` | Платежи (yookassa_payment_id unique для idempotency) |
| `generations` | Лог генераций (type, duration, user_id, image_url) |
| `models` | Сохранённые модели (persona/lora/generated/calibrated) |
| `locations` | Сохранённые локации |
| `otps` | OTP-коды для email авторизации |
| `temp_auth_sessions` | Временные сессии OAuth |
| `stats_kv` | Глобальная статистика |
| `daily_stats` | Дневная статистика |
| `settings` | Настройки (prompt_lang и др.) |

---

## 🎨 ДИЗАЙН-СИСТЕМА

- **Вайб:** Premium Dark Mode, глубокий чёрный фон (`#0a0a0f`)
- **Акцент:** Фиолетовый (`#a855f7`) с dimmed вариантом (`rgba(168,85,247,0.15)`)
- **Glassmorphism:** `bg-white/[0.03] backdrop-blur border-white/[0.08]`
- **Анимации:** Framer Motion, пружинная физика: `{ type: 'spring', stiffness: 400, damping: 25, mass: 0.5 }`
- **Шрифт:** Системный (Inter, -apple-system)
- **Telegram:** `disableVerticalSwipes()` + `expand()` при инициализации

---

## ⚠️ АБСОЛЮТНЫЕ ЗАПРЕТЫ

1. **НИКОГДА** не хардкодить API-ключи, токены, секреты. Только `process.env.VAR_NAME`.
2. **НИКОГДА** не менять IP whitelist ЮKassa без явного указания.
3. **НИКОГДА** не вызывать AI API в циклах без `await` между итерациями.
4. **НИКОГДА** не менять формат UID (`tg_{id}`, `vk_{id}`, `ya_{id}`).
5. **НИКОГДА** не отправлять сгенерированное изображение обратно как input (Visual Attention Sink).
6. **НИКОГДА** не ломать Reserve-Commit-Refund паттерн в generate-image.js.
7. **НИКОГДА** не менять промпты в `_prompts.js` без согласования с пользователем.
8. **НИКОГДА** не удалять QUICK_PICKS в PersonaWizard.jsx.
9. **НИКОГДА** не менять цены/кредиты в PLANS без согласования.
10. **НИКОГДА** не трогать `detectGender()` regex — он работает.
11. **НИКОГДА** не деплоить без `npm run lint` → 0 errors.
12. **НИКОГДА** не упоминать Firebase, Supabase, Vercel как текущую инфраструктуру.

---

## 🐛 Известные проблемы и решения

| Проблема | Причина | Решение |
|----------|---------|---------|
| `500 SyntaxError` на `/api/generate-image` | Незакрытый template literal | `npm run lint`, найди строку, исправь |
| Подписка не активируется после оплаты | Webhook ЮKassa отклонён (IP) | Проверь whitelist в `payment-webhook-yookassa.js` |
| Изменения фронтенда не видны | Docker кэш | Всегда `--no-cache` + grep бандла |
| Модель не открывается на редактирование | Неверный `modelType` | Проверить: persona → PersonaWizard, lora/own_model → LoraModal |
| Top-Up кнопка не работает | `onTopUp` не подключен | Недостроенная фича (нужен TopUpModal) |

## 🤖 АВТОНОМНЫЙ АУДИТ UX И ЛОГИКИ (ux-flow-audit-auto)

В проект внедрен навык автономного аудита UX: `ux-flow-audit-auto`. 
- **Цель:** Искать нелогичности в интерфейсе, мёртвые кнопки, плохие воронки и ошибки монетизации.
- **Права агента:** Разрешено локально переписывать UX/UI логику (Категория B — вкус, раскладка, монетизация) и коммитить без спроса пользователя.
- **ЖЕЛЕЗНОЕ ПРАВИЛО:** Никакого деплоя на прод-сервер без явной команды пользователя «Билдим». Все правки живут и тестируются исключительно на `localhost`. Агент обязан делать скриншоты «ДО» и «ПОСЛЕ» и оценивать результат визуально.

---

## 📋 ЧЕКЛИСТ ДЛЯ АГЕНТА ПЕРЕД ЛЮБЫМ ИЗМЕНЕНИЕМ

- [ ] Прочитал этот AGENTS.md полностью
- [ ] Понял какой файл меняю и какие подсистемы затрагиваю
- [ ] НЕ трогаю промпты без явного указания
- [ ] НЕ трогаю billing логику без явного указания
- [ ] НЕ трогаю detectGender, QUICK_PICKS, PLANS
- [ ] После изменения: `npm run lint` → 0 errors
- [ ] Деплой: 4-шаговый протокол (scp → grep → build --no-cache → grep бандла)
