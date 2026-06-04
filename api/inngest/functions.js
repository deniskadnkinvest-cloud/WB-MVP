// ═══════════════════════════════════════════════════════════════
//  AUTO-CATALOG FUNCTIONS — Inngest Step-функции
//  Паттерн: Fan-Out (Master → N Child Workers)
// ═══════════════════════════════════════════════════════════════
import { inngest } from './client.js';
import { classifyGarment } from './steps/classify.js';
import { mapParameters } from './steps/mapper.js';
import { generateWithKie } from './steps/generate.js';
import { scoreQuality } from './steps/quality.js';
import crypto from 'crypto';

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
      
      const db = getFirestore();
      
      // Сохраняем элемент батча
      const batchItemDoc = {
        skuId,
        name,
        status: acceptedPhotos.length >= targetCount ? 'completed' : 'partial',
        photos: acceptedPhotos,
        attempts,
        classification,
        vibe,
        batchId,
        sellerId: event.data.sellerId || 'seller_bot',
        updatedAt: new Date().toISOString()
      };
      
      await db.collection('batches').doc(batchId).collection('items').doc(skuId).set(batchItemDoc, { merge: true });
      
      // Сохраняем каждую принятую фотографию в общую коллекцию generations
      for (let i = 0; i < acceptedPhotos.length; i++) {
        const photo = acceptedPhotos[i];
        const genId = `gen_${batchId}_${skuId}_${i}`;
        const genDoc = {
          id: genId,
          userId: event.data.sellerId || 'seller_bot',
          batchId,
          skuId,
          success: true,
          imageUrl: photo.url,
          score: photo.score,
          reason: photo.reason,
          createdAt: new Date().toISOString(),
          type: 'autocatalog',
          aspectRatio: '3:4',
          garmentUrls: [imageUrl],
          modelPreset: params.model || vibe,
          posePreset: params.pose || '',
          backgroundPreset: params.background || ''
        };
        await db.collection('generations').doc(genId).set(genDoc);
      }
      
      // Инкрементируем глобальные счетчики
      const today = new Date().toISOString().slice(0, 10);
      await db.doc('_stats/global').set({
        generationsTotal: FV.increment(acceptedPhotos.length),
        generationsProduct: FV.increment(acceptedPhotos.length),
      }, { merge: true });
      await db.doc(`_stats/daily/${today}/counts`).set({
        generationsTotal: FV.increment(acceptedPhotos.length),
        generationsProduct: FV.increment(acceptedPhotos.length),
      }, { merge: true });

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

// ─────────────────────────────────────────────────────────────
//  4. SUBSCRIPTION AUTO RENEW — ежедневное автопродление
// ─────────────────────────────────────────────────────────────
const PLAN_PRICES = {
  base: 5000,
  pro: 14990,
};

const PLAN_TITLES = {
  base: '⚡ Селлер-Студия: Тариф «Про» — 100 кадров/мес',
  pro: '🚀 Селлер-Студия: Тариф «Бизнес» — Безлимит/мес',
};

export const subscriptionAutoRenew = inngest.createFunction(
  {
    id: 'subscription-auto-renew',
    name: 'Subscription Auto Renew Checker',
    triggers: [{ cron: '0 3 * * *' }],
  },
  async ({ step }) => {
    const db = getFirestore();
    const shopId = process.env.YOOKASSA_SHOP_ID || '1373290';
    const secretKey = process.env.YOOKASSA_SECRET_KEY;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!secretKey) {
      console.error('[Auto Renew] YOOKASSA_SECRET_KEY not configured');
      return { status: 'error', error: 'Secret key not configured' };
    }

    const activeSubscriptions = await step.run('fetch-active-subscriptions', async () => {
      const snapshot = await db.collectionGroup('subscription')
        .where('autoRenew', '==', true)
        .where('subscriptionStatus', '==', 'active')
        .get();

      const list = [];
      const now = new Date();

      snapshot.forEach(doc => {
        const data = doc.data();
        if (!data.planExpiresAt || !data.yookassaPaymentMethodId) return;

        const expiresDate = data.planExpiresAt.toDate();
        const diffMs = expiresDate.getTime() - now.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);

        if (diffHours <= 24) {
          const uid = doc.ref.parent.parent.id;
          list.push({
            uid,
            plan: data.plan,
            paymentMethodId: data.yookassaPaymentMethodId,
            expiresAt: expiresDate.toISOString(),
          });
        }
      });

      return list;
    });

    console.log(`[Auto Renew] Found ${activeSubscriptions.length} subscriptions to renew.`);

    const results = [];

    for (let i = 0; i < activeSubscriptions.length; i++) {
      const sub = activeSubscriptions[i];
      const planPrice = PLAN_PRICES[sub.plan];
      const planTitle = PLAN_TITLES[sub.plan];

      if (!planPrice) {
        console.warn(`[Auto Renew] Unknown price for plan ${sub.plan} for user ${sub.uid}`);
        continue;
      }

      const renewResult = await step.run(`renew-${sub.uid}-${sub.plan}`, async () => {
        console.log(`[Auto Renew] Trying to charge user ${sub.uid} for ${sub.plan} (${planPrice} RUB)`);

        try {
          const authHeader = 'Basic ' + Buffer.from(`${shopId}:${secretKey}`).toString('base64');
          const response = await fetch('https://api.yookassa.ru/v3/payments', {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              'Idempotency-Key': crypto.randomUUID(),
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              amount: {
                value: planPrice.toFixed(2),
                currency: 'RUB',
              },
              capture: true,
              payment_method_id: sub.paymentMethodId,
              description: `Автопродление тарифа: ${planTitle}`,
              metadata: {
                uid: sub.uid,
                planId: sub.plan,
                isAutoRenew: true,
              },
            }),
          });

          const data = await response.json();

          if (!response.ok) {
            console.error(`[Auto Renew] Failed to charge user ${sub.uid}:`, data);
            throw new Error(data.description || 'Yookassa payment request failed');
          }

          if (data.status !== 'succeeded') {
            console.warn(`[Auto Renew] Payment status is ${data.status} for user ${sub.uid}`);
            throw new Error(`Payment status is ${data.status}`);
          }

          console.log(`[Auto Renew] Charge successful for user ${sub.uid}`);
          return { uid: sub.uid, plan: sub.plan, success: true, paymentId: data.id };
        } catch (err) {
          console.error(`[Auto Renew] Error renewing user ${sub.uid}:`, err.message);

          const ref = db.doc(`users/${sub.uid}/subscription/current`);
          await ref.set({
            subscriptionStatus: 'past_due',
            autoRenew: false,
          }, { merge: true });

          if (botToken) {
            try {
              await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: sub.uid,
                  text: `⚠️ <b>Ошибка автопродления подписки</b>\n\nНе удалось списать оплату за тариф <b>"${sub.plan === 'base' ? 'Про' : 'Бизнес'}"</b> (${planPrice} ₽) с вашей привязанной карты.\n\nПожалуйста, проверьте баланс карты или оплатите тариф заново. Подписка временно приостановлена.`,
                  parse_mode: 'HTML',
                }),
              });
            } catch (tgErr) {
              console.error(`[Auto Renew] Failed to send Telegram alert to ${sub.uid}:`, tgErr.message);
            }
          }

          return { uid: sub.uid, plan: sub.plan, success: false, error: err.message };
        }
      });

      results.push(renewResult);
    }

    return { processed: activeSubscriptions.length, results };
  }
);

// Экспортируем все функции для регистрации в Inngest
export const functions = [catalogStarted, processSku, broadcastSend, subscriptionAutoRenew];

