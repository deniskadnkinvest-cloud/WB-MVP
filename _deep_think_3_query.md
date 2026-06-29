# Deep Think запрос — Анализ ситуации и поиск решения

Ты — сверхмощный аналитический интеллект и эксперт высокого уровня в Node.js, PostgreSQL, Docker-networking и Telegram Mini Apps. Твоя задача — глубоко проанализировать текущую ситуацию и дать исчерпывающий, мудрый и применимый на практике ответ.

**⏱️ TEMPORAL GROUND TRUTH:** Сегодняшняя дата — **28 июня 2026**. Это не опциональный факт — это жёсткая точка отсчёта. Все подходы, технологии, решения и лучшие практики оценивай по их состоянию на эту дату. Используй ТОЛЬКО актуальные данные 2025–2026 года.

---

## 📌 Контекст ситуации

**Проект:** Селлер-Студия — Telegram Mini App (виртуальная примерочная для маркетплейсов).

**Стек:**
- **Фронтенд:** React (Vite) — собирается в `dist/`, отдаётся Express как статика
- **Бэкенд:** Node.js 20 + Express, запущен в Docker-контейнере на VPS `72.56.20.222`
- **База данных:** PostgreSQL на **ОТДЕЛЬНОМ** сервере `186.246.29.31`, доступна через WireGuard VPN-туннель как `10.8.0.1:5432`
- **Reverse Proxy:** Traefik (Docker-сеть `traefik_traefik`), SSL/HTTPS
- **Домен:** `seller-studio-ai.ru` → `72.56.20.222`
- **Деплой:** Docker Compose, image build из Dockerfile (node:20-alpine)

**Сетевая топология:**
```
Telegram Mini App (клиент, iOS/Android)
    → HTTPS → seller-studio-ai.ru (72.56.20.222)
        → Traefik → Docker-контейнер vton-mvp (172.18.0.15:3001)
            → WireGuard VPN (wg0) → 10.8.0.1:5432 (PostgreSQL на 186.246.29.31)
```

**Docker-контейнер vton-mvp:**
- Сеть: `traefik_traefik` (bridge, 172.18.0.0/16)
- WireGuard VPN настроен на **хосте** (не внутри контейнера)
- Контейнер обращается к `10.8.0.1` — это IP WireGuard-интерфейса хоста
- Ping из контейнера до `10.8.0.1`: **100-103ms**, 0% packet loss
- Прямой тест `SELECT 1` из контейнера (новый `pg.Pool`): **530-544ms**, стабильно 5/5 успешных

**WireGuard на хосте:**
```
interface: wg0
  listening port: 53784
peer: 7OJMStybwpuGmZ2hhSF1B7vLPpg7bpCSbwrmi5L1XHE=
  endpoint: 186.246.29.31:51820
  allowed ips: 10.8.0.1/32
  latest handshake: ~1 minute ago
  transfer: 5.95 GiB received, 163.86 MiB sent
  persistent keepalive: every 25 seconds
```

**Важный факт:** Другие приложения на том же хосте (Трекопёс — PHP бот) используют ту же WireGuard-связку к `10.8.0.1:5432` и работают **без единой ошибки**. Разница: PHP не держит persistent connections (каждый запрос — новое соединение), Node.js `pg.Pool` держит.

---

## 🔴 В чём заключается проблема / вопрос

**Ошибка:** `Connection terminated due to connection timeout`

**Поведение:**
1. Пользователь открывает Telegram Mini App → приложение загружается → **автоматически авторизуется** (первый раз работает!)
2. Пользователь **закрывает** Telegram полностью → открывает снова
3. При повторном открытии → ошибка `Connection terminated due to connection timeout` на экране входа
4. Иногда (не всегда) после нескольких попыток ошибка пропадает

**Критический факт:** Ошибка на скриншоте показывает текст **"Connection terminated due to connection timeout"** — это **английский** текст. Мы уже заменили сообщение об ошибке на русское ("Сервис временно недоступен"), но пользователь ВСЁ РАВНО видит английский текст. Это значит одно из двух:
- a) Фронтенд закэширован и показывает старую версию с прямым `err.message`
- b) Ошибка приходит не от нашего `auth-telegram` endpoint, а от **другого** API-вызова

**Что мы уже пробовали (и не помогло):**
1. ✅ Добавили keepalive ping каждые 20 секунд в `_db.js` — база отвечает стабильно
2. ✅ Уменьшили `connectionTimeoutMillis` с 15с до 8с
3. ✅ Увеличили ретраи до 3
4. ✅ Добавили warm-up pool при старте — `[_db] Pool warmed up successfully` в логах
5. ✅ `docker cp` обновлённых файлов внутрь контейнера + restart
6. ✅ Проверили: внутри контейнера `grep 'временно'` находит русский текст
7. ❌ **Ошибка всё равно появляется** — и текст ошибки по-прежнему на английском!

---

## 📊 Дополнительные данные

### Код авторизации (фронтенд) — AuthContext.jsx:

**Автоматический логин при первом открытии (строки 279-305):**
```javascript
useEffect(() => {
  const savedToken = getToken();     // localStorage
  const savedUser = getSavedUser();  // localStorage

  if (savedToken && savedUser) {
    // Есть сохранённая сессия — просто восстанавливаем
    savedUser.getIdToken = async () => getToken();
    setUser(savedUser);
    setLoading(false);
  } else if (isTelegram && telegramUser) {
    // Нет сессии, но мы в Telegram — автологин
    signInWithTelegramAccountInternal()
      .then(() => setLoading(false))
      .catch(() => {
        setUser(null);
        setLoading(false);   // <-- ошибка ГЛОТАЕТСЯ! Пользователь видит LoginPage
      });
  } else {
    setUser(null);
    setLoading(false);
  }
}, []);
```

**Кнопка "Войти как KSON Александр" (LoginPage.jsx строки 181-186):**
```javascript
const handleTelegramLogin = async () => {
  setError(''); setLoading(true);
  try { await signInWithTelegramAccount(); }
  catch (err) { setError(authErrorToRussian(err)); }  // <-- показывает ошибку
  finally { setLoading(false); }
};
```

**signInWithTelegramAccountInternal (AuthContext.jsx строки 354-408):**
```javascript
const signInWithTelegramAccountInternal = async () => {
  const initData = getTelegramInitData();
  if (!initData) throw new Error('Telegram initData не доступна');

  const { customToken, uid, telegramId } = await retryTransient(async () => {
    // Шаг 1: ping (10 сек таймаут)
    const ping = await fetchWithTimeout('/api/auth-ping', {
      method: 'GET', cache: 'no-store',
    }, 10000);
    if (!ping.ok) throw new Error(`API ping failed: ${ping.status}`);

    // Шаг 2: auth-telegram (25 сек таймаут)
    const resp = await fetchWithTimeout('/api/auth-telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ initData }),
    }, 25000);

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || 'Ошибка авторизации через Telegram');
    }
    return await resp.json();
  });

  setToken(customToken);
  // ... сохранение пользователя
};
```

**retryTransient (3 попытки, задержка 1.2с × attempt):**
```javascript
async function retryTransient(fn, { attempts = 3, delayMs = 1200 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { return await fn(); }
    catch (error) {
      if (!isTransientAuthError(error) || attempt >= attempts) throw error;
      await sleep(delayMs * attempt);
    }
  }
}
```

**isTransientAuthError:**
```javascript
function isTransientAuthError(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('api timeout') ||
    message.includes('api network error') ||
    message.includes('connection terminated') ||
    message.includes('connection timeout') ||
    message.includes('temporarily unavailable') ||
    message.includes('auth_db_temporarily_unavailable') ||
    message.includes('failed to fetch') ||
    message.includes('networkerror')
  );
}
```

### Бэкенд auth-telegram.js:
```javascript
export default async function handler(req, res) {
  try {
    // 1. Verify initData (HMAC-SHA256)
    // 2. UPSERT user in PostgreSQL (attempts: 3, retryUnsafe: true)
    // 3. UPSERT subscription
    // 4. Sign JWT (30 days)
    return res.status(200).json({ ok: true, customToken, uid, telegramId });
  } catch (err) {
    if (isRetryableConnectionError(err)) {
      return res.status(503).json({
        error: 'Сервис временно недоступен. Попробуйте ещё раз.',
      });
    }
    return res.status(500).json({
      error: 'Ошибка авторизации. Попробуйте ещё раз.',
    });
  }
}
```

### Бэкенд _db.js (pool config):
```javascript
const pool = new Pool({
  connectionString: 'postgresql://vton_user:VtonStrongPass2026!@10.8.0.1:5432/vton_mvp',
  ssl: false,
  max: 6,
  idleTimeoutMillis: 60_000,
  connectionTimeoutMillis: 8_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 2_000,
});

// Warm up
pool.query('SELECT 1').then(() => console.log('[_db] Pool warmed up'));

// Keepalive every 20s
setInterval(() => { pool.query('SELECT 1').catch(() => {}); }, 20_000);

// Retry logic: up to 3 attempts with 800ms * attempt delay
```

### Серверные логи (последние 10 минут):
```
🔥 PAN.X VTON Backend (KIE.ai) → http://localhost:3001
[_db] Pool warmed up successfully
```
**НЕТ НИ ОДНОЙ СТРОКИ `[auth-telegram]` или `[auth-http]` — значит запросы от фронтенда НЕ ДОХОДЯТ до бэкенда!**

### Ключевое наблюдение:
Сервер НЕ логирует ни одного запроса авторизации от пользователя за последние 10 минут, хотя пользователь пытался войти в 23:06. Это значит:
1. Либо фронтенд **не отправляет** запрос (fetch не вызывается)
2. Либо запрос **не доходит** до Express (проблема с Traefik, SSL, или DNS)
3. Либо ошибка происходит **до** запроса к бэкенду (клиентский таймаут или кэш)

### Факт про "Connection terminated" — ОТКУДА этот текст?
Текст "Connection terminated due to connection timeout" — это raw `err.message` из `node-postgres` (пакет `pg`). Он НЕ может появиться на фронтенде напрямую, если бэкенд работает правильно (бэкенд перехватывает эту ошибку и отдаёт JSON). Значит:
- **Возможно**, фронтенд использует **закэшированный старый JS бандл**, который не имеет наших `authErrorToRussian` и `retryTransient` обёрток
- **Возможно**, ошибка пробрасывается не через API-ответ, а из **другого** места (localStorage corruption, JWT decode error, или другой endpoint)

---

## 🎯 Наша цель

**Полностью устранить ошибку "Connection terminated due to connection timeout" раз и навсегда.** Приложение должно работать как WhatsApp/Telegram — открыл, сразу работает, всегда, без исключений. Тысячи пользователей не должны видеть никаких ошибок.

---

## 📋 Задание для тебя (Deep Think)

Включи режим глубокого обдумывания и выполни:

1. **Разбор ситуации:** Проведи глубокий анализ. Обрати особое внимание на то, что **серверные логи пусты** (запросы не доходят). Это критический ключ. Почему фронтенд показывает ошибку, а сервер не видит запроса?

2. **Корневая причина:** Определи, откуда ТОЧНО берётся текст "Connection terminated due to connection timeout" на экране пользователя. Это:
   - Ответ от API (JSON error)?
   - Клиентский fetch timeout?
   - Закэшированный старый JS?
   - Что-то третье?

3. **Анализ цепочки:** Разбери полную цепочку от нажатия кнопки до показа ошибки:
   - Telegram WebView кэширование
   - DNS resolution (seller-studio-ai.ru)
   - Traefik → container routing
   - Express middleware → handler
   - pg.Pool → WireGuard → PostgreSQL
   - Response → фронтенд → UI

4. **Почему PHP (Трекопёс) работает, а Node.js нет?** При одинаковой WireGuard-инфраструктуре. Что конкретно отличается на сетевом уровне?

5. **Финальное решение:** Дай конкретный, исчерпывающий план действий. Не "попробуйте keepalive" — мы уже пробовали. Нужно решение, которое гарантированно устраняет проблему. Рассмотри варианты:
   - Перенос PostgreSQL на тот же сервер (устранение VPN)
   - Замена `pg.Pool` на одноразовые соединения (как PHP)
   - Прокси-слой на хосте (pgbouncer)
   - Полная пересборка Docker-образа (текущий docker build падает из-за rate limit)
   - Проблема с Telegram WebView кэшированием JS-бандла

*Примечание: Твоя главная задача — найти НАСТОЯЩУЮ корневую причину, а не очередной "патч". Мы уже 20 дней патчим — и ничего не помогает.*
