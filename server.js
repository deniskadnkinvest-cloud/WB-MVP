import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { serve } from 'inngest/express';
import { inngest } from './api/_inngest/client.js';
import { functions } from './api/_inngest/functions.js';

import generateImageHandler from './api/generate-image.js';
import createPaymentHandler from './api/create-payment.js';
import paymentWebhookYookassaHandler from './api/payment-webhook-yookassa.js';
import cancelSubscriptionHandler from './api/cancel-subscription.js';
import subscriptionHandler from './api/subscription.js';
import consumeCreditHandler from './api/consume-credit.js';
import adminHandler from './api/admin.js';
import sendOtpHandler from './api/send-otp.js';
import verifyOtpHandler from './api/verify-otp.js';
import createTgSessionHandler from './api/_create-tg-session.js';
import completeTgAuthHandler from './api/_complete-tg-auth.js';
import authTelegramHandler from './api/auth-telegram.js';
import uploadHandler from './api/upload.js';
import userDataHandler from './api/user-data.js';


import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors({ optionsSuccessStatus: 200 }));

// Global Request Logger
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    const start = Date.now();
    console.log(`[REQ] ${req.method} ${req.url}`);
    res.on('finish', () => {
      console.log(`[RES] ${req.method} ${req.url} - ${res.statusCode} (${Date.now() - start}ms)`);
    });
  }
  next();
});

// Универсальный парсер тела запроса.
// express.raw() читает тело как Buffer для любого Content-Type,
// затем вручную парсим JSON. Это необходимо потому что Telegram initData
// содержит URL-encoded символы (%3D, %26 и т.д.), которые ломают
// стандартный body-parser с ошибкой "Bad escaped character in JSON".
app.use(express.raw({ type: '*/*', limit: '50mb' }));
app.use((req, res, next) => {
  if (Buffer.isBuffer(req.body)) {
    const raw = req.body.toString('utf8');
    try {
      req.body = JSON.parse(raw);
    } catch {
      try {
        req.body = JSON.parse(decodeURIComponent(raw));
      } catch {
        req.body = raw;
      }
    }
  }
  next();
});
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Inngest Dev Server Bridge
app.use('/api/inngest', serve({ client: inngest, functions }));

// Раздача статики (React-фронтенд)
app.use(express.static(path.join(__dirname, 'dist')));

app.get('/api/auth-ping', (req, res) => {
  res.json({ ok: true });
});

import { getPoolStats } from './api/_db.js';
app.get('/api/pool-stats', (req, res) => {
  res.json(getPoolStats());
});

app.post('/api/generate-image', async (req, res) => {
  return generateImageHandler(req, res);
});

app.post('/api/create-payment', async (req, res) => {
  return createPaymentHandler(req, res);
});

app.post('/api/cancel-subscription', async (req, res) => {
  return cancelSubscriptionHandler(req, res);
});

// ═══ ПОДПИСКИ (PostgreSQL — источник истины) ═══
app.get('/api/subscription', async (req, res) => {
  return subscriptionHandler(req, res);
});

app.post('/api/subscription', async (req, res) => {
  return subscriptionHandler(req, res);
});

app.post('/api/consume-credit', async (req, res) => {
  return consumeCreditHandler(req, res);
});

app.post('/api/payment-webhook-yookassa', async (req, res) => {
  return paymentWebhookYookassaHandler(req, res);
});
app.post('/api/payment-webhook', async (req, res) => {
  return paymentWebhookYookassaHandler(req, res);
});

app.post('/api/send-otp', async (req, res) => {
  return sendOtpHandler(req, res);
});

app.post('/api/verify-otp', async (req, res) => {
  return verifyOtpHandler(req, res);
});

app.post('/api/create-tg-session', async (req, res) => {
  return createTgSessionHandler(req, res);
});

app.post('/api/complete-tg-auth', async (req, res) => {
  return completeTgAuthHandler(req, res);
});

app.post('/api/auth-telegram', async (req, res) => {
  return authTelegramHandler(req, res);
});

app.post('/api/upload', async (req, res) => {
  return uploadHandler(req, res);
});

app.delete('/api/upload', async (req, res) => {
  return uploadHandler(req, res);
});

app.get('/api/upload', async (req, res) => {
  return uploadHandler(req, res);
});

app.get('/api/user-data', async (req, res) => {
  return userDataHandler(req, res);
});

app.post('/api/user-data', async (req, res) => {
  return userDataHandler(req, res);
});

app.delete('/api/user-data', async (req, res) => {
  return userDataHandler(req, res);
});

// Dynamic Admin API Routing using unified router matching all paths starting with /api/admin
app.all(/^\/api\/admin(.*)/, async (req, res) => {
  return adminHandler(req, res);
});

// React SPA fallback
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Глобальный перехватчик ошибок
app.use((err, req, res, next) => {
  console.error(`[Global Error] ${req.method} ${req.url}:`, err.message);
  
  const msg = String(err.message || '').toLowerCase();
  if (msg.includes('connection') || msg.includes('timeout') || msg.includes('terminat')) {
    return res.status(503).json({ error: 'Сервис временно недоступен. Повторите попытку.' });
  }
  
  res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
});

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🔥 PAN.X VTON Backend (KIE.ai) → http://localhost:${PORT}`);
  console.log(`   Inngest Endpoint: http://localhost:${PORT}/api/inngest`);
  console.log(`   Admin Panel APIs: http://localhost:${PORT}/api/admin/*`);
  console.log('   Подключена ЮKassa: /api/create-payment & /api/payment-webhook-yookassa');
  console.log('   Ожидаю запросы от фронтенда...\n');
});

// KIE.ai может обрабатывать задачи до 4-5 минут — ставим таймаут 10 минут
server.setTimeout(10 * 60 * 1000); // 10 минут

