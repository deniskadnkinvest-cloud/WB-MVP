import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import generateImageHandler from './api/generate-image.js';
import verifyPanxTokenHandler from './api/verify-panx-token.js';
import createPaymentHandler from './api/create-payment.js';
import paymentWebhookYookassaHandler from './api/payment-webhook-yookassa.js';
import paymentWebhookHandler from './api/payment-webhook.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.post('/api/generate-image', async (req, res) => {
  return generateImageHandler(req, res);
});

app.post('/api/verify-panx-token', async (req, res) => {
  return verifyPanxTokenHandler(req, res);
});

app.post('/api/create-payment', async (req, res) => {
  return createPaymentHandler(req, res);
});

app.post('/api/payment-webhook-yookassa', async (req, res) => {
  return paymentWebhookYookassaHandler(req, res);
});

app.post('/api/payment-webhook', async (req, res) => {
  return paymentWebhookHandler(req, res);
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`\n🔥 PAN.X VTON Backend (KIE.ai) → http://localhost:${PORT}`);
  console.log('   Подключена ЮKassa: /api/create-payment & /api/payment-webhook-yookassa');
  console.log('   Ожидаю запросы от фронтенда...\n');
});
