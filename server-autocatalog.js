// ═══════════════════════════════════════════════════════════════
//  AUTO-CATALOG LOCAL DEV SERVER
//  Запускает Express + Inngest Dev Server для тестирования
// ═══════════════════════════════════════════════════════════════
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { serve } from 'inngest/express';
import { inngest } from './api/_inngest/client.js';
import { functions } from './api/_inngest/functions.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Auto-Catalog Dev UI</title>
      <meta charset="utf-8">
      <style>
        body { font-family: system-ui; background: #0f172a; color: white; padding: 40px; }
        .container { max-width: 800px; margin: 0 auto; background: #1e293b; padding: 30px; border-radius: 12px; border: 1px solid #334155; }
        h1 { margin-top: 0; color: #f8fafc; }
        button { background: #3b82f6; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: 600; margin-top: 20px; transition: 0.2s; }
        button:hover { background: #2563eb; }
        button:disabled { background: #475569; cursor: not-allowed; }
        pre { background: #000; padding: 15px; border-radius: 8px; overflow-x: auto; border: 1px solid #334155; }
        a { color: #38bdf8; text-decoration: none; font-weight: 500; }
        a:hover { text-decoration: underline; }
        .step { background: #334155; padding: 10px 15px; border-radius: 8px; margin-bottom: 10px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🚀 Auto-Catalog Тестовая Панель</h1>
        
        <div class="step">
          <p>1. Убедись, что запущен <b>Inngest Dev Server</b>: <a href="http://localhost:8288" target="_blank">http://localhost:8288</a></p>
        </div>
        
        <div class="step">
          <p>2. Нажми кнопку ниже, чтобы запустить пайплайн для 1 товара.</p>
          <button onclick="startTest()">Отправить в Auto-Catalog</button>
        </div>
        
        <div id="result" style="margin-top: 20px;"></div>
      </div>

      <script>
        async function startTest() {
          const btn = document.querySelector('button');
          const resDiv = document.getElementById('result');
          btn.disabled = true;
          btn.innerText = 'Отправка... ⏳';
          
          try {
            const resp = await fetch('/api/auto-catalog/start', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                items: [{ skuId: 'ART-001', name: 'Чёрная куртка-бомбер', imageUrl: 'https://picsum.photos/seed/jacket1/400/600' }],
                sellerId: 'test_seller_001',
                vibe: 'y2k_streetwear'
              })
            });
            const data = await resp.json();
            resDiv.innerHTML = '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
            resDiv.innerHTML += '<p style="color: #4ade80">✅ Успешно! Открой <a href="http://localhost:8288" target="_blank">Inngest Dashboard</a> чтобы смотреть за магией в реальном времени.</p>';
          } catch (err) {
            resDiv.innerHTML = '<pre style="color: #f87171">❌ Ошибка: ' + err.message + '</pre>';
          } finally {
            btn.disabled = false;
            btn.innerText = 'Отправить в Auto-Catalog';
          }
        }
      </script>
    </body>
    </html>
  `);
});

// ── Inngest endpoint (для Dev Server) ───────────────────────
app.use('/api/inngest', serve({ client: inngest, functions }));

// ── API: Запуск Auto-Catalog ────────────────────────────────
app.post('/api/auto-catalog/start', async (req, res) => {
  try {
    const { items, sellerId, vibe } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array is required' });
    }

    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🚀 AUTO-CATALOG STARTED!`);
    console.log(`   Batch ID: ${batchId}`);
    console.log(`   Items: ${items.length} SKU`);
    console.log(`   Vibe: ${vibe || 'classic_elegant'}`);
    console.log(`   Seller: ${sellerId || 'test_user'}`);
    console.log(`${'═'.repeat(60)}\n`);

    // Отправляем событие в Inngest
    await inngest.send({
      name: 'catalog/started',
      data: {
        batchId,
        items,
        sellerId: sellerId || 'test_user',
        vibe: vibe || 'classic_elegant',
      }
    });

    res.json({
      success: true,
      batchId,
      message: `Auto-Catalog запущен! ${items.length} SKU в обработке.`,
      status: 'processing'
    });
  } catch (err) {
    console.error('❌ Error starting auto-catalog:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── API: Статус батча (пока заглушка) ───────────────────────
app.get('/api/auto-catalog/status/:batchId', async (req, res) => {
  res.json({
    batchId: req.params.batchId,
    status: 'processing',
    message: 'TODO: подключить Firestore для real-time статуса'
  });
});

// ── Healthcheck ─────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'SellerBot Auto-Catalog Dev Server' });
});

const PORT = 3002;
app.listen(PORT, () => {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🏭 SellerBot Auto-Catalog Dev Server`);
  console.log(`   → http://localhost:${PORT}`);
  console.log(`   → Inngest: http://localhost:${PORT}/api/inngest`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`\n📋 Endpoints:`);
  console.log(`   POST /api/auto-catalog/start  — Запуск конвейера`);
  console.log(`   GET  /api/auto-catalog/status/:id — Статус`);
  console.log(`   GET  /api/health — Проверка`);
  console.log(`\n⚡ Inngest Dev Server нужно запустить отдельно:`);
  console.log(`   npx inngest-cli@latest dev -u http://localhost:${PORT}/api/inngest\n`);
});
