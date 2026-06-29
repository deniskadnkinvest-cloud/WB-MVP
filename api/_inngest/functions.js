import crypto from 'crypto';
import { inngest } from './client.js';
import { classifyGarment } from './steps/classify.js';
import { mapParameters } from './steps/mapper.js';
import { generateWithKie } from './steps/generate.js';
import { scoreQuality } from './steps/quality.js';
import { query } from '../_db.js';

const PLAN_CONFIG = {
  base: {
    priceRub: 5000,
    credits: 100,
    title: 'Seller Studio Pro',
  },
  pro: {
    priceRub: 14990,
    credits: 1000,
    title: 'Seller Studio Business',
  },
};

async function resolveUserId(identifier) {
  if (!identifier) return null;
  const raw = String(identifier).startsWith('tg_') ? String(identifier).slice(3) : String(identifier);
  const prefixed = raw.startsWith('tg_') ? raw : `tg_${raw}`;
  const { rows } = await query(
    `SELECT id
     FROM users
     WHERE telegram_id = $1 OR telegram_id = $2 OR telegram_id = $3 OR email = $1
     LIMIT 1`,
    [String(identifier), raw, prefixed]
  );
  return rows[0]?.id || null;
}

async function recordGeneration({ sellerId, type, resultUrl, prompt, model, creditsUsed, metadata }) {
  const userId = await resolveUserId(sellerId);
  await query(
    `INSERT INTO generations (user_id, type, status, duration_ms, credits_used, prompt, model, result_url, metadata)
     VALUES ($1, $2, 'success', 0, $3, $4, $5, $6, $7)`,
    [
      userId,
      String(type || 'autocatalog').slice(0, 50),
      Number(creditsUsed || 0),
      prompt || null,
      String(model || '').slice(0, 50),
      resultUrl || null,
      JSON.stringify(metadata || {}),
    ]
  );
}

async function bumpStat(key, amount = 1) {
  await query(
    `INSERT INTO stats_kv (key, value)
     VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = stats_kv.value + EXCLUDED.value`,
    [key, amount]
  );
  await query(
    `INSERT INTO daily_stats (date, key, value)
     VALUES (CURRENT_DATE, $1, $2)
     ON CONFLICT (date, key) DO UPDATE SET value = daily_stats.value + EXCLUDED.value`,
    [key, amount]
  );
}

export const catalogStarted = inngest.createFunction(
  {
    id: 'catalog-started',
    name: 'Auto-Catalog Master Worker',
    triggers: [{ event: 'catalog/started' }],
  },
  async ({ event, step }) => {
    const { batchId, items = [], sellerId, vibe } = event.data || {};
    const events = items.map((item, index) => ({
      name: 'sku/process',
      data: {
        batchId,
        sellerId,
        vibe,
        item,
        index,
        totalItems: items.length,
      },
    }));

    if (events.length > 0) {
      await step.sendEvent('fan-out-skus', events);
    }

    return { dispatched: events.length, batchId };
  }
);

export const processSku = inngest.createFunction(
  {
    id: 'process-single-sku',
    name: 'Process Single SKU',
    triggers: [{ event: 'sku/process' }],
    concurrency: { limit: 5 },
    retries: 2,
  },
  async ({ event, step }) => {
    const { batchId, item = {}, vibe, index = 0, totalItems = 1, sellerId } = event.data || {};
    const { skuId, imageUrl, name } = item;

    const classification = await step.run('classify-garment', async () => classifyGarment(imageUrl));
    const params = await step.run('map-parameters', async () => mapParameters(classification, skuId, vibe));

    const acceptedPhotos = [];
    const targetCount = 1;
    const maxAttempts = 3;
    let attempts = 0;

    while (acceptedPhotos.length < targetCount && attempts < maxAttempts) {
      const attemptNum = attempts;
      const generatedUrl = await step.run(`generate-attempt-${attemptNum}`, async () =>
        generateWithKie(imageUrl, params, classification)
      );

      if (generatedUrl) {
        await step.sleep(`cooldown-${attemptNum}`, '5s');
        const qaResult = await step.run(`qa-score-${attemptNum}`, async () =>
          scoreQuality(imageUrl, generatedUrl)
        );

        if (qaResult.accepted) {
          acceptedPhotos.push({
            url: generatedUrl,
            score: qaResult.score,
            reason: qaResult.reason,
          });
        }
      }

      attempts += 1;
    }

    await step.run('save-results', async () => {
      for (let i = 0; i < acceptedPhotos.length; i += 1) {
        const photo = acceptedPhotos[i];
        await recordGeneration({
          sellerId,
          type: 'autocatalog',
          resultUrl: photo.url,
          prompt: name || skuId || '',
          model: params.model || vibe || '',
          creditsUsed: 1,
          metadata: {
            source: 'autocatalog',
            batchId,
            skuId,
            skuName: name,
            index,
            totalItems,
            photoIndex: i,
            score: photo.score,
            reason: photo.reason,
            attempts,
            classification,
            params,
            originalImageUrl: imageUrl,
          },
        });
      }

      if (acceptedPhotos.length > 0) {
        await bumpStat('generationsTotal', acceptedPhotos.length);
        await bumpStat('generationsProduct', acceptedPhotos.length);
      }
    });

    return {
      skuId,
      name,
      status: acceptedPhotos.length >= targetCount ? 'completed' : 'partial',
      photos: acceptedPhotos,
      attempts,
      params,
    };
  }
);

export const broadcastSend = inngest.createFunction(
  {
    id: 'broadcast-send',
    name: 'Telegram Broadcast Sender',
    triggers: [{ event: 'broadcast/send' }],
    concurrency: { limit: 1 },
    retries: 1,
  },
  async ({ event, step }) => {
    const { broadcastId, text, imageUrl, buttonText, buttonUrl, userIds = [] } = event.data || {};
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const replyMarkup = buttonText && buttonUrl
      ? JSON.stringify({ inline_keyboard: [[{ text: buttonText, url: buttonUrl }]] })
      : undefined;

    if (!botToken) {
      return { broadcastId, sentCount: 0, failedCount: userIds.length, error: 'TELEGRAM_BOT_TOKEN is not configured' };
    }

    let sentCount = 0;
    let failedCount = 0;
    const batches = [];
    for (let i = 0; i < userIds.length; i += 30) batches.push(userIds.slice(i, i + 30));

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx += 1) {
      const batchResult = await step.run(`send-batch-${batchIdx}`, async () => {
        let batchSent = 0;
        let batchFailed = 0;

        for (const chatId of batches[batchIdx]) {
          try {
            const endpoint = imageUrl ? 'sendPhoto' : 'sendMessage';
            const body = imageUrl
              ? { chat_id: chatId, photo: imageUrl, caption: text, parse_mode: 'HTML', ...(replyMarkup && { reply_markup: replyMarkup }) }
              : { chat_id: chatId, text, parse_mode: 'HTML', ...(replyMarkup && { reply_markup: replyMarkup }) };

            const resp = await fetch(`https://api.telegram.org/bot${botToken}/${endpoint}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });

            if (resp.ok) batchSent += 1;
            else batchFailed += 1;
          } catch {
            batchFailed += 1;
          }

          await new Promise(resolve => setTimeout(resolve, 33));
        }

        return { batchSent, batchFailed };
      });

      sentCount += batchResult.batchSent;
      failedCount += batchResult.batchFailed;
      if (batchIdx < batches.length - 1) await step.sleep(`batch-cooldown-${batchIdx}`, '1s');
    }

    await query(
      `INSERT INTO stats_kv (key, value)
       VALUES ($1, $2), ($3, $4)
       ON CONFLICT (key) DO UPDATE SET value = stats_kv.value + EXCLUDED.value`,
      ['broadcastSent', sentCount, 'broadcastFailed', failedCount]
    );

    return { broadcastId, sentCount, failedCount };
  }
);

export const subscriptionAutoRenew = inngest.createFunction(
  {
    id: 'subscription-auto-renew',
    name: 'Subscription Auto Renew Checker',
    triggers: [{ cron: '0 3 * * *' }],
  },
  async ({ step }) => {
    const shopId = process.env.YOOKASSA_SHOP_ID || '1373290';
    const secretKey = process.env.YOOKASSA_SECRET_KEY;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!secretKey) return { status: 'error', error: 'YOOKASSA_SECRET_KEY is not configured' };

    const activeSubscriptions = await step.run('fetch-active-subscriptions', async () =>
      query(
        `SELECT s.id, s.user_id, s.plan_name, s.yookassa_payment_method_id, u.telegram_id
         FROM subscriptions s
         JOIN users u ON u.id = s.user_id
         WHERE s.auto_renew = true
           AND COALESCE(s.status, 'inactive') = 'active'
           AND s.yookassa_payment_method_id IS NOT NULL
           AND s.expires_at IS NOT NULL
           AND s.expires_at <= NOW() + INTERVAL '24 hours'`
      ).then(result => result.rows)
    );

    const results = [];
    for (const sub of activeSubscriptions) {
      const plan = PLAN_CONFIG[sub.plan_name];
      if (!plan) continue;

      const renewResult = await step.run(`renew-${sub.user_id}-${sub.plan_name}`, async () => {
        try {
          const authHeader = `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString('base64')}`;
          const response = await fetch('https://api.yookassa.ru/v3/payments', {
            method: 'POST',
            headers: {
              Authorization: authHeader,
              'Idempotency-Key': crypto.randomUUID(),
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              amount: { value: plan.priceRub.toFixed(2), currency: 'RUB' },
              capture: true,
              payment_method_id: sub.yookassa_payment_method_id,
              description: `Subscription renewal: ${plan.title}`,
              metadata: {
                userId: sub.user_id,
                telegramId: sub.telegram_id,
                planId: sub.plan_name,
                isAutoRenew: true,
              },
            }),
          });

          const data = await response.json();
          if (!response.ok || data.status !== 'succeeded') {
            throw new Error(data.description || `Payment status ${data.status || response.status}`);
          }

          const expiresAt = new Date();
          expiresAt.setMonth(expiresAt.getMonth() + 1);

          await query(
            `UPDATE subscriptions
             SET credits = $2,
                 credits_total = $2,
                 expires_at = $3,
                 status = 'active',
                 updated_at = NOW()
             WHERE id = $1`,
            [sub.id, plan.credits, expiresAt]
          );
          await query(
            `INSERT INTO payments (user_id, plan_id, method, yookassa_payment_id, amount, credits_amount, currency, paid_at, metadata)
             VALUES ($1, $2, 'auto_renew', $3, $4, $5, 'RUB', NOW(), $6)`,
            [
              sub.user_id,
              sub.plan_name,
              data.id,
              plan.priceRub,
              plan.credits,
              JSON.stringify({ provider: 'yookassa', payment: data }),
            ]
          );

          return { userId: sub.user_id, plan: sub.plan_name, success: true, paymentId: data.id };
        } catch (err) {
          await query(
            `UPDATE subscriptions
             SET status = 'past_due', auto_renew = false, updated_at = NOW()
             WHERE id = $1`,
            [sub.id]
          );

          if (botToken && sub.telegram_id) {
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: sub.telegram_id,
                text: 'Не удалось продлить подписку автоматически. Проверьте способ оплаты или оплатите тариф заново.',
              }),
            }).catch(() => {});
          }

          return { userId: sub.user_id, plan: sub.plan_name, success: false, error: err.message };
        }
      });

      results.push(renewResult);
    }

    return { processed: activeSubscriptions.length, results };
  }
);

export const functions = [catalogStarted, processSku, broadcastSend, subscriptionAutoRenew];
