import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import generateImageHandler from './api/generate-image.js';
import verifyPanxTokenHandler from './api/verify-panx-token.js';

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

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`\n🔥 PAN.X VTON Backend (KIE.ai) → http://localhost:${PORT}`);
  console.log('   Используется production-хендлер из api/generate-image.js');
  console.log('   Ожидаю запросы от фронтенда...\n');
});
