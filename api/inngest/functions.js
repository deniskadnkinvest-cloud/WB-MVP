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
export const functions = [catalogStarted, processSku, broadcastSend];

// ─────────────────────────────────────────────────────────────
//  3. BROADCAST WORKER — Telegram рассылка по всей аудитории
//     Батчами по 30 юзеров с паузой 1сек (обход 429 Telegram)
// ─────────────────────────────────────────────────────────────
import { getFirestore, FieldValue as FV } from 'firebase-admin/firestore';

export const broadcastSend = inngest.createFunction(
  {
    id: 'broadcast-send',
    name: 'Telegram Broadcast Sender',
    triggers: [{ event: 'broadcast/send' }],
    concurrency: { limit: 1 }, // Только 1 рассылка одновременно
    retries: 1,
  },
  async ({ event, step }) => {
    const { broadcastId, text, imageUrl, buttonText, buttonUrl, userIds } = event.data;
    const db = getFirestore();
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const BATCH_SIZE = 30; // Telegram лимит: 30 сообщений/сек

    console.log(`📢 [broadcast] Старт: ${broadcastId}, юзеров: ${userIds.length}`);

    // Обновляем статус на "running"
    await step.run('mark-running', async () => {
      await db.collection('broadcasts').doc(broadcastId).update({
        status: 'running',
        startedAt: new Date().toISOString(),
      });
    });

    // Создаём клавиатуру если задана кнопка
    const replyMarkup = buttonText && buttonUrl
      ? JSON.stringify({ inline_keyboard: [[{ text: buttonText, url: buttonUrl }]] })
      : undefined;

    let sentCount = 0;
    let failedCount = 0;

    // Отправка батчами
    const batches = [];
    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
      batches.push(userIds.slice(i, i + BATCH_SIZE));
    }

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];

      const batchResult = await step.run(`send-batch-${batchIdx}`, async () => {
        let batchSent = 0;
        let batchFailed = 0;

        for (const chatId of batch) {
          try {
            let url, body;

            if (imageUrl) {
              // Отправляем фото с подписью
              url = `https://api.telegram.org/bot${botToken}/sendPhoto`;
              body = {
                chat_id: chatId,
                photo: imageUrl,
                caption: text,
                parse_mode: 'HTML',
                ...(replyMarkup && { reply_markup: replyMarkup }),
              };
            } else {
              // Только текст
              url = `https://api.telegram.org/bot${botToken}/sendMessage`;
              body = {
                chat_id: chatId,
                text,
                parse_mode: 'HTML',
                ...(replyMarkup && { reply_markup: replyMarkup }),
              };
            }

            const resp = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });

            if (resp.ok) {
              batchSent++;
            } else {
              const err = await resp.json().catch(() => ({}));
              console.warn(`[broadcast] Ошибка chatId=${chatId}: ${err.description || resp.status}`);
              batchFailed++;
            }
          } catch (e) {
            console.error(`[broadcast] Exception chatId=${chatId}:`, e.message);
            batchFailed++;
          }

          // 33мс пауза между сообщениями (≈30 msg/сек max)
          await new Promise(r => setTimeout(r, 33));
        }

        return { batchSent, batchFailed };
      });

      sentCount += batchResult.batchSent;
      failedCount += batchResult.batchFailed;

      // Обновляем прогресс в Firestore
      await step.run(`update-progress-${batchIdx}`, async () => {
        await db.collection('broadcasts').doc(broadcastId).update({
          sentCount,
          failedCount,
        });
      });

      // Пауза 1 сек между батчами
      if (batchIdx < batches.length - 1) {
        await step.sleep(`batch-cooldown-${batchIdx}`, '1s');
      }
    }

    // Завершаем рассылку
    await step.run('mark-completed', async () => {
      await db.collection('broadcasts').doc(broadcastId).update({
        status: failedCount === userIds.length ? 'failed' : 'completed',
        sentCount,
        failedCount,
        completedAt: new Date().toISOString(),
      });
    });

    console.log(`✅ [broadcast] ${broadcastId} завершён: отправлено ${sentCount}, ошибок ${failedCount}`);
    return { broadcastId, sentCount, failedCount };
  }
);

