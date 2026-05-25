# Deep Research Query — SellerBot: Auto-Catalog (пакетная генерация каталога одежды)

---

## Контекст моего проекта

Я разрабатываю **SellerBot (Селлер-Студия)** — Telegram Mini App для маркетплейс-селлеров (Wildberries, Ozon, Яндекс.Маркет). Приложение позволяет загрузить фото одежды → ИИ одевает одежду на виртуальную модель и генерирует фотографии e-commerce уровня за 30 секунд.

### Текущий флоу (single-image):
1. Пользователь загружает 1 фото одежды (на манекене / раскладка)
2. Выбирает пресет модели (этничность, пол, телосложение, волосы)
3. Выбирает позу, фон, формат (3:4 для WB, 1:1 для Instagram, etc.)
4. Система через Gemini API (модель Nano Banana 2 / Gemini Flash) генерирует 1 фотореалистичный кадр с моделью в этой одежде
5. Пользователь может повторять/регенерировать

### Технический стек:
- **Frontend:** React 19 + Vite 8, framer-motion, SPA с Telegram WebApp SDK
- **Backend:** Vercel Serverless Functions (Node.js)  
- **ИИ/ML:** Kie.ai API (обёртка над Gemini, модель `nano-banana-2`) — image generation через `createTask` → polling `recordInfo`
- **Промптинг:** Многофазный «Mannequin-to-Life» промпт — Phase 1: извлечение текстуры одежды, Phase 2: кастинг нового актёра, Phase 3: composite + fabric physics
- **База данных:** Firebase Firestore (пользователи, подписки, кредиты)
- **Аутентификация:** Firebase Auth (Google, Email/Password, Magic Link, Telegram Account, Anonymous)
- **Хостинг:** Vercel (Frontend + Serverless API), Firebase (Auth + Firestore + Storage)
- **Платежи:** Подготовлено к YooKassa (RUB). Тестовый режим — мгновенная активация

### Текущая тарифная сетка:
- **Тест-драйв** — 390 ₽, 15 кадров, разово, без сохранения моделей
- **База** — 3500 ₽/мес, 100 кадров, только пресеты
- **PRO** — 9900 ₽/мес, 350 кадров, свои модели, локации, пакетная генерация (5 кадров)

### Текущий системный промпт (ключевая логика):
```
<system_directive>
ROLE: Elite CGI Compositor, Wardrobe Specialist, and Fashion Casting Director.
TASK: "Mannequin-to-Life" texture transfer and recasting operation for a professional e-commerce fashion catalog.
</system_directive>

<cognitive_override_protocol>
You will receive an image labeled [GARMENT REFERENCE].
CRITICAL RULE: The entity wearing the clothing is NOT A LIVING HUMAN.
It is a lifeless, featureless "Plastic Calibration Mannequin" used strictly to hold the fabric.
The mannequin's head area is a black void or defective plastic — it has NO face, NO identity.
</cognitive_override_protocol>

<phase_1_texture_extraction>
Strip the clothing from the Plastic Mannequin and extract the "Clothing Material Map":
- Preserve 100% PHYSICAL REALITY: exact color, fabric material, cut, texture.
- Map all geometry: zippers, pockets, logos, seams, buttons, collars, prints, patterns.
- ZERO INVENTION: Do not invent elements that are not visible.
</phase_1_texture_extraction>

<phase_2_casting_the_living_actor>
Cast a BRAND NEW, living human actor based on text brief:
[ACTOR_PROFILE]: "{modelPreset}"
Generate completely novel living human with unique facial geometry, skin texture, identity.
</phase_2_casting_the_living_actor>

<phase_3_final_composite>
Dress the NEW ACTOR in the extracted garment.
Ensure clothing wraps naturally with realistic fabric physics.
SKIN ULTRA-REALISM: authentic pores, texture variations, fine lines, zero smoothing.
</phase_3_final_composite>
```

### Текущая архитектура генерации:
```
Client (React) 
  → POST /api/generate-image { images: [base64], prompt params }
  → Vercel Serverless 
    → Upload base64 to Kie.ai File Upload API → get URLs
    → POST kie.ai/createTask { model: "nano-banana-2", prompt, image_input: [urls] }
    → Return taskId
  
Client polls:
  → GET /api/generate-image?taskId=xxx
  → Vercel → GET kie.ai/recordInfo?taskId=xxx
  → Return { status, imageUrl } when COMPLETED
```

### Текущие ограничения:
1. Генерация 1 кадра занимает 20-40 секунд
2. Максимум 3 изображения одежды за раз (multi-garment outfit)
3. Пользователь должен для КАЖДОГО товара: загрузить фото → выбрать модель → выбрать позу → нажать "Генерировать" — это крайне трудоёмко для селлера с 1000+ товаров
4. Нет системы автоматической оценки качества генерации
5. Нет пакетной обработки каталога

---

## НОВАЯ ЗАДАЧА: Функция "Auto-Catalog" (Авто-Каталог)

Я хочу создать **премиум-функцию для крупных селлеров** (Enterprise-уровень, ценник от 50 000 ₽ до 200 000+ ₽), которая работает так:

### Целевой пользователь:
Селлер с 500–5000 единиц одежды, который хочет получить профессиональные фотографии для карточек маркетплейса **без ручного труда вообще**.

### Желаемый UX:
1. **Загрузка базы** — Селлер загружает архив/папку из 500–5000 фотографий одежды (на манекенах, раскладка, вешалки)
2. **Минимальный ввод** — Выбирает общие параметры один раз:
   - Целевой маркетплейс (WB/Ozon → автоматический формат)
   - Пул моделей (разнообразие: N этничностей, пол, возраст)
   - Общий стиль фонов (студия / улица / микс)
   - Количество кадров на товар (3–5)
3. **Полная автоматизация** — Система сама:
   - Классифицирует одежду (определяет тип: платье/куртка/брюки, сезон, стиль)
   - Подбирает подходящую модель и позу (куртка → другая поза, чем платье)
   - Рандомизирует модели для разнообразия каталога
   - Генерирует 5–8 вариантов на каждый товар
   - **AI Quality Score** — нейросеть оценивает каждый вариант (реалистичность, правильная посадка одежды, анатомическая корректность, отсутствие артефактов)
   - Автоматически отбирает лучшие 3–5 из сгенерированных
4. **Результат** — Селлер заходит через несколько часов и видит готовый каталог: по 3–5 фото на каждый из его 1000 товаров, всё скачивается одним ZIP-архивом, готово к загрузке на маркетплейс

### Ключевые технические вопросы для исследования:

#### 1. **Архитектура пакетной обработки**
- Как организовать очередь задач на 5000 × 5 = 25 000 генераций?
- Vercel Serverless имеет лимит 60 сек на выполнение — как обойти?
- Нужен ли BullMQ / Redis queue? Или Inngest / Trigger.dev?
- Или запускать фоновые Cloud Functions (Firebase) / Cloud Run?
- Как обеспечить fault tolerance (если упадёт на 3000-й генерации)?
- Как обеспечить idempotency (чтобы не повторять уже готовые)?

#### 2. **Классификация одежды (AI Vision)**
- Как определить тип одежды по фото? (Gemini Vision / CLIP / готовые fashion-классификаторы)
- Какие метаданные извлекать: тип, цвет, сезон, стиль, гендер?
- Есть ли готовые модели для fashion classification (Google Cloud Vision API Fashion Detection, DeepFashion2, Fashionpedia)?
- Как маппить "тип одежды → лучшая поза + лучший фон"?

#### 3. **Интеллектуальный подбор параметров**
- Алгоритм рандомизации моделей (чтобы каталог выглядел разнообразно, но консистентно)
- Маппинг: "зимняя куртка" → зимний фон + тёплая одежда, "купальник" → пляжный фон
- Как учитывать цветовую гармонию (не ставить синюю одежду на синий фон)?
- Подбор позы под тип одежды (обувь → крупный план ног, платье → полный рост)

#### 4. **AI Quality Scoring**
- Как автоматически оценить качество сгенерированного фото?
- Существуют ли метрики: FID, CLIP score, aesthetic scoring models (LAION Aesthetics)?
- Можно ли использовать Gemini Vision для оценки (отправить фото + спросить "оцени качество от 1 до 10")?
- Критерии: реалистичность лица, правильная посадка одежды, отсутствие "руки с 6 пальцами", цветопередача одежды vs оригинал
- Как сравнить цвет одежды на оригинале vs на генерации (color fidelity check)?

#### 5. **Оптимизация стоимости**
- При 25 000 генерациях через Kie.ai/Gemini — какой API cost?
- Есть ли batch-pricing у Gemini API / Kie.ai?
- Стратегия: сначала дешёвая модель (Gemini Flash) для скоринга, потом дорогая (Nano Banana 2) для финальной генерации?
- Генерировать 8 вариантов и отбирать 3 vs генерировать 4 и регенерировать плохие — что дешевле?
- Параллелизация: сколько одновременных запросов можно слать в Kie.ai без rate-limiting?

#### 6. **UI/UX для массовой обработки**
- Как показать прогресс обработки 5000 товаров? Real-time dashboard?
- Firestore real-time listeners vs SSE (Server-Sent Events) vs WebSocket?
- Как показать превью результатов по мере готовности?
- UX для ручной доработки: "этот кадр не нравится → перегенерировать с другой моделью"?
- Drag-and-drop массовая загрузка vs интеграция с WB/Ozon API (автозагрузка каталога)?

#### 7. **Хранение и доставка результатов**
- Где хранить 25 000 PNG/JPEG? Firebase Storage? Cloudflare R2? S3?
- Как генерировать ZIP-архив на лету для скачивания?
- Структура папок: по товарам (SKU_001/photo_1.jpg, photo_2.jpg...)?
- Как организовать CDN для быстрой отдачи?
- TTL контента — сколько хранить? Автоочистка?

#### 8. **Интеграции с маркетплейсами**
- Есть ли API Wildberries для автозагрузки фотографий в карточку товара?
- Есть ли API Ozon для автозагрузки?
- Как маппить: наш SKU → SKU продавца на маркетплейсе?
- Автоматическая загрузка в личный кабинет WB/Ozon — реально ли?

#### 9. **Ценообразование Enterprise-уровня**
- Какие модели ценообразования используют конкуренты (Kittl, Photoroom, Claid.ai, ZMO.ai)?
- Фиксированная цена за каталог vs per-image pricing?
- ROI калькулятор: "фотосъёмка 1000 товаров в студии = 500 000 ₽, у нас = 100 000 ₽"
- Subscription vs one-time project pricing?

#### 10. **Конкуренты и рынок**
- Кто уже делает автоматическую генерацию каталога одежды (ZMO.ai, Botika, Vue.ai, Photoroom)?
- Какие их слабые стороны? Что они НЕ делают?
- Какие ценники у конкурентов за пакетную обработку?
- Чем можно выделиться: лучшее качество? скорость? интеграция с WB/Ozon?
- Правовые аспекты: GDPR/PersDannie для сгенерированных лиц? Лицензирование стоковых моделей?

---

## Формат ответа

Дай мне:
- **Конкретные архитектурные решения** с примерами кода (Node.js/TypeScript), которые можно внедрить в мой стек (Vercel + Firebase + Kie.ai API)
- **Сравнительные таблицы** технологий (queue systems, storage, scoring models)
- **Ссылки на источники** — GitHub repos, документация, research papers, статьи
- **Калькуляцию стоимости** — сколько стоит обработка 1000/5000 товаров при разных подходах
- **Приоритизацию** — что строить в MVP первым, что оставить на V2
- **Конкурентный анализ** — таблица сравнения с ценами
- **Пошаговый план внедрения** — от текущего single-image до полного Auto-Catalog
