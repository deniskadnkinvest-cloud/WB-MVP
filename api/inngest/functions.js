// ═══════════════════════════════════════════════════════════════
//  AUTO-CATALOG FUNCTIONS — Inngest Step-функции
//  Паттерн: Fan-Out (Master → N Child Workers)
// ═══════════════════════════════════════════════════════════════
import { inngest } from './client.js';
import { classifyGarment } from './steps/classify.js';
import { mapParameters } from './steps/mapper.js';
import { generateWithKie } from './steps/generate.js';
import { scoreQuality } from './steps/quality.js';

// ─────────────────────────────────────────────────────────────
//  1. MASTER WORKER — запускает Fan-Out
// ─────────────────────────────────────────────────────────────
export const catalogStarted = inngest.createFunction(
  { 
    id: 'catalog-started',
    name: 'Auto-Catalog Master Worker',
    triggers: [{ event: 'catalog/started' }]
  },
  async ({ event, step }) => {
    const { batchId, items, sellerId, vibe } = event.data;
    
    console.log(`\n🏭 [MASTER] Auto-Catalog started!`);
    console.log(`   Batch: ${batchId}`);
    console.log(`   Items: ${items.length} SKU`);
    console.log(`   Vibe: ${vibe}`);
    console.log(`   Seller: ${sellerId}\n`);

    // Fan-Out: генерируем событие для каждого SKU
    const events = items.map((item, idx) => ({
      name: 'sku/process',
      data: {
        batchId,
        sellerId,
        vibe,
        item, // { skuId, imageUrl, name }
        index: idx,
        totalItems: items.length
      }
    }));

    // Отправляем все события в очередь Inngest
    await step.sendEvent('fan-out-skus', events);

    console.log(`   📤 Dispatched ${events.length} sku/process events`);
    return { dispatched: events.length, batchId };
  }
);

// ─────────────────────────────────────────────────────────────
//  2. CHILD WORKER — обрабатывает 1 SKU (вся магия здесь!)
// ─────────────────────────────────────────────────────────────
export const processSku = inngest.createFunction(
  {
    id: 'process-single-sku',
    name: 'Process Single SKU',
    triggers: [{ event: 'sku/process' }],
    concurrency: {
      limit: 5 // Лимит параллельных генераций (защита от Rate Limit Kie.ai)
    },
    retries: 2 // Авто-ретрай при сбоях
  },
  async ({ event, step }) => {
    const { batchId, item, vibe, index, totalItems } = event.data;
    const { skuId, imageUrl, name } = item;

    console.log(`\n🔧 [SKU ${index + 1}/${totalItems}] Processing: ${name || skuId}`);

    // ── Step 1: AI Классификация (Gemini 2.5 Flash) ──────────
    const classification = await step.run('classify-garment', async () => {
      console.log(`   🧠 Step 1: Classifying garment...`);
      return await classifyGarment(imageUrl);
    });

    console.log(`   ✅ Classification:`, JSON.stringify(classification));

    // ── Step 2: Core Brain (маппинг параметров) ──────────────
    const params = await step.run('map-parameters', async () => {
      console.log(`   🎯 Step 2: Mapping parameters (pose, bg, model)...`);
      return mapParameters(classification, skuId, vibe);
    });

    console.log(`   ✅ Params: model=${params.model}, pose=${params.pose}, bg=${params.background.substring(0, 40)}...`);

    // ── Step 3: Генерация фото (Kie.ai / Nano Banana 2) ─────
    // "Generate-Until-Success": генерируем по 1, копим до targetCount
    // Включен режим экономии денег: 1 идеальное фото, макс 3 попытки
    const targetCount = 1; // Сколько идеальных фото нужно
    const maxAttempts = 3; // Максимум попыток
    const acceptedPhotos = [];
    let attempts = 0;

    while (acceptedPhotos.length < targetCount && attempts < maxAttempts) {
      const attemptNum = attempts;
      
      // Генерация 1 фото
      const generatedUrl = await step.run(`generate-attempt-${attemptNum}`, async () => {
        console.log(`   🎨 Step 3: Generating photo (attempt ${attemptNum + 1}/${maxAttempts})...`);
        return await generateWithKie(imageUrl, params, classification);
      });

      // Пауза между генерациями (обход Rate Limit)
      if (generatedUrl) {
        await step.sleep(`cooldown-${attemptNum}`, '5s');

        // AI Quality Score (Gemini Flash Vision)
        const qaResult = await step.run(`qa-score-${attemptNum}`, async () => {
          console.log(`   🔍 Step 4: AI Quality Check (attempt ${attemptNum + 1})...`);
          return await scoreQuality(imageUrl, generatedUrl);
        });

        if (qaResult.accepted) {
          acceptedPhotos.push({
            url: generatedUrl,
            score: qaResult.score,
            reason: qaResult.reason
          });
          console.log(`   ✅ ACCEPTED! Score: ${qaResult.score}/10 — "${qaResult.reason}"`);
        } else {
          console.log(`   ❌ REJECTED! Score: ${qaResult.score}/10 — "${qaResult.reason}"`);
          // TODO: В проде — удалить бракованное фото из Storage
        }
      }
      
      attempts++;
    }

    // ── Step 5: Сохранение результата ────────────────────────
    const result = await step.run('save-results', async () => {
      console.log(`   💾 Step 5: Saving results...`);
      console.log(`   📊 Result: ${acceptedPhotos.length}/${targetCount} accepted photos after ${attempts} attempts`);
      
      // TODO: Сохранить в Firestore BatchItems/{batchId}/items/{skuId}
      return {
        skuId,
        name,
        status: acceptedPhotos.length >= targetCount ? 'completed' : 'partial',
        photos: acceptedPhotos,
        attempts,
        classification,
        params: {
          model: params.model,
          pose: params.pose,
          background: params.background
        }
      };
    });

    console.log(`\n✨ [SKU ${index + 1}/${totalItems}] DONE: ${result.status} (${acceptedPhotos.length} photos)\n`);
    return result;
  }
);

// Экспортируем все функции для регистрации в Inngest
export const functions = [catalogStarted, processSku];
