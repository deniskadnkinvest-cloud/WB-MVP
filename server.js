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


import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Inngest Dev Server Bridge
app.use('/api/inngest', serve({ client: inngest, functions }));

// Раздача статики (React-фронтенд)
app.use(express.static(path.join(__dirname, 'dist')));

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
// Dynamic Admin API Routing using unified router matching all paths starting with /api/admin
app.all(/^\/api\/admin(.*)/, async (req, res) => {
  return adminHandler(req, res);
});

// React SPA fallback
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🔥 PAN.X VTON Backend (KIE.ai) → http://localhost:${PORT}`);
  console.log(`   Inngest Endpoint: http://localhost:${PORT}/api/inngest`);
  console.log(`   Admin Panel APIs: http://localhost:${PORT}/api/admin/*`);
  console.log('   Подключена ЮKassa: /api/create-payment & /api/payment-webhook-yookassa');
  console.log('   Ожидаю запросы от фронтенда...\n');
});
