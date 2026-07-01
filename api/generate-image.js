import { alertOnError } from './_admin-alerts.js';
import { query as _dbQuery } from './_db.js';
import jwt from 'jsonwebtoken';

// Safety wrapper: if _db.js fails to load, provide clear error instead of "ReferenceError: _db is not defined"
const query = (...args) => {
  if (typeof _dbQuery !== 'function') {
    throw new Error(`DB module not loaded: query is ${typeof _dbQuery}. Check _db.js and DATABASE_URL env var.`);
  }
  return _dbQuery(...args);
};

const JWT_SECRET = process.env.JWT_SECRET || 'vton-secret-2026';

// РђС‚РѕРјР°СЂРЅРѕ РёРЅРєСЂРµРјРµРЅС‚РёСЂСѓРµС‚ РіР»РѕР±Р°Р»СЊРЅС‹Р№ СЃС‡С‘С‚С‡РёРє РІ PostgreSQL
async function incrementGlobalCounter(field) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    // Global stats
    await query(`
      INSERT INTO stats_kv (key, value) VALUES ($1, 1)
      ON CONFLICT (key) DO UPDATE SET value = stats_kv.value + 1
    `, [field]);
    // Daily stats
    await query(`
      INSERT INTO daily_stats (date, key, value) VALUES ($1, $2, 1)
      ON CONFLICT (date, key) DO UPDATE SET value = daily_stats.value + 1
    `, [today, field]);
  } catch (e) {
    console.warn('[stats counter] Failed:', e.message);
  }
}

// Р—Р°РїРёСЃС‹РІР°РµС‚ РїРѕРґСЂРѕР±РЅС‹Р№ Р»РѕРі РіРµРЅРµСЂР°С†РёРё РІ PostgreSQL
async function saveGenerationLog({ userId, success, imageUrl, error, reqBody, durationMs }) {
  try {
    const generationId = `gen_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const type = reqBody?.isUgcMode ? 'ugc' : reqBody?.isModelCard ? 'model' : reqBody?.isQuickCard ? 'quick' : reqBody?.isProductMode ? 'product' : reqBody?.isCalibration ? 'calibration' : reqBody?.isCardDesign ? 'product' : 'fashion';
    const garmentUrls = reqBody?.garmentImageUrls || [];
    const attributes = reqBody?.attributes || null;
    
    await query(`
      INSERT INTO generations (
        id, user_id, success, duration_ms, type, aspect_ratio, garment_urls, model_preset, pose_preset, background_preset,
        camera_angle, category_id, with_human_model, is_card_design, card_style, is_beauty_mode, is_photo_edit, edit_instruction,
        custom_pose_text, attributes, user_product_info, quick_prompt_name, image_url, error
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
      )
    `, [
      generationId, userId || 'anonymous', success, durationMs || 0, type, reqBody?.aspectRatio || '3:4',
      JSON.stringify(garmentUrls), reqBody?.modelPreset || '', reqBody?.posePreset || '', reqBody?.backgroundPreset || '',
      reqBody?.cameraAngle || '', reqBody?.categoryId || '', reqBody?.withHumanModel || false, reqBody?.isCardDesign || false,
      reqBody?.quickCardStyle || reqBody?.cardStyle || '', reqBody?.isBeautyMode || false, reqBody?.isPhotoEdit || false,
      reqBody?.editInstruction || '', reqBody?.customPoseText || '', attributes ? JSON.stringify(attributes) : null, reqBody?.userProductInfo || '',
      reqBody?.quickPromptName || '', imageUrl || null, error || null
    ]);
    console.log(`рџ“Љ [stats] Logged generation ${generationId} for user ${userId || 'anonymous'} (${success ? 'success' : 'failed'})`);
  } catch (e) {
    console.warn('[stats log] Failed to write generation log:', e.message);
  }
}

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// SKIN ULTRA-REALISM SYSTEM PROMPT (РїСЂРёРјРµРЅСЏРµС‚СЃСЏ Р“Р›РћР‘РђР›Р¬РќРћ)
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
const SKIN_REALISM_PROMPT = `SKIN & FACE REALISM DIRECTIVE (MANDATORY вЂ” HIGHEST PRIORITY):
RAW UNRETOUCHED PHOTOGRAPHY MODE. ZERO skin smoothing. ZERO beauty filters. ZERO frequency separation. ZERO airbrushing.
The skin MUST show real biological texture as captured by a 100mm macro lens at f/2.8:
- Visible individual pores at pixel level, natural sebum micro-shine on T-zone
- Subsurface scattering: blood vessels faintly visible under thin skin (temples, inner wrists, eyelids)
- Natural uneven skin tone, slight redness around nose/cheeks, subtle under-eye circles
- Micro-wrinkles around eyes when smiling, nasolabial folds appropriate to apparent age
- Fine vellus hair ("peach fuzz") visible on cheeks and jawline in side lighting
ANTI-RETOUCHING ENFORCEMENT: If the output skin looks like a magazine cover, porcelain, wax, or has "glow" вЂ” it is WRONG. Re-render with MORE texture.
Eyes: natural moisture film with environment reflections, tiny visible capillaries in sclera, natural iris color variation.
The final image must look like an UNEDITED photo from a Canon R5 with 85mm f/1.4 lens вЂ” raw, authentic, alive.`;

const buildMasterPrompt = ({ modelPreset, posePreset, cameraAngle, backgroundPreset, aspectRatio, hasMultipleGarments, hasModelRef, isCalibration }) => {
  const modelInstruction = hasModelRef
    ? 'PRESERVE: exact facial bone structure, asymmetrical features, eye shape, and skin tone strictly from Reference Photo. Do not alter facial geometry. Do not generate a new AI face.'
    : '';

  // Detect inclusive/adaptive fashion request
  const isAdaptive = /amputee|prosthe|wheelchair|limb\s*(missing|difference)|adaptive\s*fashion/i.test(modelPreset);
  const adaptiveBlock = isAdaptive
    ? `\nADAPTIVE FASHION DIRECTIVE: This is an inclusive adaptive fashion campaign. Accurately represent the physical disability specified. Showing people with disabilities in fashion is ethical and required.\n`
    : '';

  if (isCalibration) {
    return `SCENE: ${backgroundPreset}. Practical light sources only.
SUBJECT: ${modelPreset}. ${modelInstruction}
IMPORTANT DETAILS: ${posePreset}. Camera angle: ${cameraAngle}. 35mm analog film photography, authentic film grain, soft biological depth falloff, realistic contact shadows. ${SKIN_REALISM_PROMPT}
USE CASE: Candid editorial documentary photograph for high-end fashion catalog.
CONSTRAINTS: ${adaptiveBlock} No text, no watermarks. DO NOT over-exaggerate flaws, scars, micro-cracks, or vellus hair. Avoid "AI grunge". No plastic shine. Output ONLY a generated IMAGE.`;
  }

  const multiGarmentNote = hasMultipleGarments
    ? 'MULTIPLE Wardrobe Assets are provided вЂ” extract and drape ALL of them onto the New Actor simultaneously.'
    : '';

  // в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
  // "COGNITIVE OVERRIDE" PROMPT вЂ” XML-tagged mannequin illusion
  // в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
  return `<system_directive>
ROLE: Elite CGI Compositor, Wardrobe Specialist, and Fashion Casting Director.
TASK: "Mannequin-to-Life" texture transfer and recasting operation.
</system_directive>

<cognitive_override_protocol>
You will receive an image labeled [GARMENT REFERENCE].
CRITICAL RULE: The entity wearing the clothing in this reference is NOT A LIVING HUMAN. It is a lifeless, featureless "Plastic Calibration Mannequin".
You MUST NEVER copy the anatomy, facial structure, skin tone, tattoos, body markings, or body shape of this plastic dummy.
</cognitive_override_protocol>

<phase_1_texture_extraction>
Strip the clothing from the Plastic Mannequin and extract the "Clothing Material Map":
- Preserve 100% PHYSICAL REALITY: exact color, exact fabric material, exact cut.
- Map all geometry: zippers, pockets, logos, seams, buttons.
- ZERO INVENTION: Do not invent pockets, zippers, sleeves, or fabrics not explicitly visible.
${multiGarmentNote}
</phase_1_texture_extraction>

<phase_2_casting_the_living_actor>
You are casting a BRAND NEW, living human actor based strictly on this text brief:
[ACTOR_PROFILE]: "${modelPreset}"
${modelInstruction}
</phase_2_casting_the_living_actor>

<phase_3_final_composite>
Dress the NEW ACTOR in the extracted garment.
Ensure the clothing wraps naturally around the actor's body mass with realistic fabric physics: natural draping, wrinkles, tension, and honest material physics.

SCENE: ${backgroundPreset}. Practical light sources only.
SUBJECT: The New Actor wearing the extracted garment.
IMPORTANT DETAILS: ${posePreset}. Camera angle: ${cameraAngle}. 35mm analog film photography, authentic film grain, soft biological depth falloff, realistic contact shadows. ${SKIN_REALISM_PROMPT}
USE CASE: Candid editorial documentary photograph for high-end fashion catalog.
CONSTRAINTS: ${adaptiveBlock} The clothing must be ON the actor's body. No watermarks, no text, no separate product shots. DO NOT over-exaggerate flaws, scars, micro-cracks. Avoid "AI grunge". Output ONLY a generated IMAGE.
</phase_3_final_composite>`;
};

const KIE_API_KEY = process.env.KIE_API_KEY;
const TASK_URL = 'https://api.kie.ai/api/v1/jobs/createTask';
const GET_TASK_URL = 'https://api.kie.ai/api/v1/jobs/recordInfo?taskId=';
const FILE_UPLOAD_URL = 'https://kieai.redpandaai.co/api/file-base64-upload';
const MAX_CONCURRENT_KIE_TASKS = Math.max(1, Number.parseInt(process.env.MAX_CONCURRENT_KIE_TASKS || '5', 10) || 5);
const IDEMPOTENCY_TTL_MS = 30 * 60 * 1000;
const IDEMPOTENCY_MAX_ENTRIES = 200;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class KieConcurrencyLimiter {
  constructor(maxConcurrent) {
    this.maxConcurrent = maxConcurrent;
    this.active = 0;
    this.queue = [];
  }

  acquire(label) {
    const requestedAt = Date.now();
    console.log(`[Task Queued] ${label} active=${this.active}/${this.maxConcurrent} waiting=${this.queue.length}`);

    if (this.active < this.maxConcurrent) {
      this.active += 1;
      return Promise.resolve({ waitedMs: 0 });
    }

    return new Promise(resolve => {
      this.queue.push(() => {
        this.active += 1;
        resolve({ waitedMs: Date.now() - requestedAt });
      });
    });
  }

  release() {
    this.active = Math.max(0, this.active - 1);
    const next = this.queue.shift();
    if (next) next();
  }
}

const kieLimiter = new KieConcurrencyLimiter(MAX_CONCURRENT_KIE_TASKS);
const idempotencyCache = new Map();

async function withKieConcurrency(label, fn) {
  const slot = await kieLimiter.acquire(label);
  console.log(`[Task Started] ${label} active=${kieLimiter.active}/${kieLimiter.maxConcurrent} waitedMs=${slot.waitedMs}`);
  try {
    return await fn();
  } finally {
    console.log(`[Task Completed] ${label} active=${kieLimiter.active}/${kieLimiter.maxConcurrent}`);
    kieLimiter.release();
  }
}

function normalizeIdempotencyKey(rawKey) {
  if (typeof rawKey !== 'string') return null;
  const key = rawKey.trim();
  if (key.length < 8 || key.length > 200) return null;
  if (!/^[A-Za-z0-9._:-]+$/.test(key)) return null;
  return key;
}

function pruneIdempotencyCache() {
  const now = Date.now();
  for (const [key, entry] of idempotencyCache.entries()) {
    if (now - entry.createdAt > IDEMPOTENCY_TTL_MS) {
      idempotencyCache.delete(key);
    }
  }

  while (idempotencyCache.size > IDEMPOTENCY_MAX_ENTRIES) {
    const oldestKey = idempotencyCache.keys().next().value;
    if (!oldestKey) break;
    idempotencyCache.delete(oldestKey);
  }
}

function createIdempotencyEntry(cacheKey) {
  let resolve;
  const promise = new Promise(done => {
    resolve = done;
  });
  const entry = {
    cacheKey,
    createdAt: Date.now(),
    promise,
    resolve,
  };
  idempotencyCache.set(cacheKey, entry);
  pruneIdempotencyCache();
  return entry;
}

function getGenerationCreditCost(body = {}) {
  const action = body?.action;
  if (['deduct-credit', 'refund-credit', 'detect-elements', 'identify-element', 'generate-card-text'].includes(action)) {
    return 0;
  }

  if (['create-persona', 'generate-missing-angle', 'edit-card'].includes(action)) return 1;
  if (body?.isQuickCard || body?.isModelCard) return body?.isPhotoOnly ? 1 : 2;
  if (body?.isUgcMode || body?.isCardDesign || body?.isProductMode || body?.isCalibration || body?.isPhotoEdit || body?.previewMode) {
    return 1;
  }
  if (body?.garmentImageBase64 || body?.garmentImagesBase64?.length || body?.garmentImageUrls?.length) return 1;
  return 0;
}

async function findBillingUser({ uid, email, dbUserId }) {
  if (dbUserId) {
    const byId = await query(
      `SELECT id, telegram_id, email FROM users WHERE id = $1 LIMIT 1`,
      [dbUserId]
    );
    if (byId.rows.length > 0) return byId.rows[0];
  }

  let result = await query(
    `SELECT id, telegram_id, email FROM users WHERE telegram_id = $1 LIMIT 1`,
    [uid]
  );
  if (result.rows.length > 0) return result.rows[0];

  if (uid?.startsWith('tg_')) {
    result = await query(
      `SELECT id, telegram_id, email FROM users WHERE telegram_id = $1 LIMIT 1`,
      [uid.slice(3)]
    );
    if (result.rows.length > 0) return result.rows[0];
  }

  if (email) {
    result = await query(
      `SELECT id, telegram_id, email FROM users WHERE email = $1 LIMIT 1`,
      [email]
    );
    if (result.rows.length > 0) return result.rows[0];
  }

  return null;
}

function billingError(message, code, extra = {}) {
  const err = new Error(message);
  err.code = code;
  Object.assign(err, extra);
  return err;
}

async function reserveGenerationCredits(authContext, amount, requestId) {
  const user = await findBillingUser(authContext);
  if (!user) {
    throw billingError('Р”Р»СЏ РіРµРЅРµСЂР°С†РёРё РЅСѓР¶РµРЅ Р°РєС‚РёРІРЅС‹Р№ С‚Р°СЂРёС„.', 'NO_PLAN', { creditsRemaining: 0 });
  }

  const result = await query(
    `UPDATE subscriptions
     SET credits = credits - $1,
         updated_at = NOW()
     WHERE user_id = $2
       AND credits >= $1
       AND plan_name != 'none'
       AND status = 'active'
     RETURNING credits`,
    [amount, user.id],
    { retryUnsafe: true }
  );

  if (result.rows.length === 0) {
    const subCheck = await query(
      `SELECT plan_name, credits, status FROM subscriptions WHERE user_id = $1 LIMIT 1`,
      [user.id]
    );
    const sub = subCheck.rows[0];
    if (!sub || sub.plan_name === 'none' || sub.status !== 'active') {
      throw billingError('Р”Р»СЏ РіРµРЅРµСЂР°С†РёРё РЅСѓР¶РµРЅ Р°РєС‚РёРІРЅС‹Р№ С‚Р°СЂРёС„.', 'NO_PLAN', { creditsRemaining: sub?.credits || 0 });
    }
    throw billingError(`РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РєСЂРµРґРёС‚РѕРІ: РЅСѓР¶РЅРѕ ${amount}, РґРѕСЃС‚СѓРїРЅРѕ ${sub.credits || 0}.`, 'INSUFFICIENT_CREDITS', { creditsRemaining: sub.credits || 0 });
  }

  const creditsRemaining = result.rows[0].credits || 0;
  console.log(`[Credit Reserved] user=${authContext.uid} dbUser=${user.id} amount=${amount} remaining=${creditsRemaining} request=${requestId}`);

  return {
    userId: user.id,
    uid: authContext.uid,
    amount,
    requestId,
    creditsRemaining,
    refunded: false,
    completed: false,
  };
}

async function refundCreditReservation(reservation, reason) {
  if (!reservation || reservation.refunded || reservation.completed) return null;
  reservation.refunded = true;
  const result = await query(
    `UPDATE subscriptions
     SET credits = credits + $1,
         updated_at = NOW()
     WHERE user_id = $2
     RETURNING credits`,
    [reservation.amount, reservation.userId],
    { retryUnsafe: true }
  );
  const creditsRemaining = result.rows[0]?.credits ?? reservation.creditsRemaining + reservation.amount;
  reservation.creditsRemaining = creditsRemaining;
  console.log(`[Credit Refunded] user=${reservation.uid} dbUser=${reservation.userId} amount=${reservation.amount} remaining=${creditsRemaining} request=${reservation.requestId} reason=${reason}`);
  return { creditsRemaining };
}

async function safeRefundCreditReservation(reservation, reason) {
  try {
    return await refundCreditReservation(reservation, reason);
  } catch (err) {
    console.error(`[Credit Refund Failed] request=${reservation?.requestId || 'unknown'} reason=${reason}:`, err.message);
    return null;
  }
}

async function getCreditsRemainingForReservation(reservation) {
  if (!reservation) return null;
  const result = await query(
    `SELECT credits FROM subscriptions WHERE user_id = $1 LIMIT 1`,
    [reservation.userId]
  );
  const creditsRemaining = result.rows[0]?.credits ?? reservation.creditsRemaining ?? null;
  reservation.creditsRemaining = creditsRemaining;
  return creditsRemaining;
}

function installGenerationFinalizer({ req, res, getReservation, idempotencyEntry }) {
  let statusCode = 200;
  let finalized = false;
  let clientDisconnected = false;
  const originalStatus = res.status.bind(res);
  const originalJson = res.json.bind(res);

  req.on('aborted', () => {
    clientDisconnected = true;
    console.warn('[Client Aborted] generate-image request was aborted by client');
  });
  res.on('close', () => {
    if (!res.writableEnded) {
      clientDisconnected = true;
      console.warn('[Client Aborted] generate-image response closed before completion');
    }
  });

  res.status = (code) => {
    statusCode = code;
    return originalStatus(code);
  };

  res.json = (body) => {
    const finalize = async () => {
      let finalBody = body;
      const reservation = getReservation();
      const isJsonObject = finalBody && typeof finalBody === 'object' && !Buffer.isBuffer(finalBody);

      if (reservation && isJsonObject) {
        if (clientDisconnected && finalBody.success === true) {
          const refund = await safeRefundCreditReservation(reservation, 'client disconnected before response');
          finalBody = {
            success: false,
            error: 'Р“РµРЅРµСЂР°С†РёСЏ Р·Р°РІРµСЂС€РёР»Р°СЃСЊ РїРѕСЃР»Рµ РѕС‚РєР»СЋС‡РµРЅРёСЏ РєР»РёРµРЅС‚Р°. РљСЂРµРґРёС‚ РІРѕР·РІСЂР°С‰С‘РЅ.',
            creditsRemaining: refund?.creditsRemaining,
          };
        } else if (finalBody.success === false) {
          const refund = await safeRefundCreditReservation(reservation, finalBody.error || finalBody.details || 'generation failed');
          if (refund?.creditsRemaining !== undefined) {
            finalBody = { ...finalBody, creditsRemaining: refund.creditsRemaining };
          }
        } else if (finalBody.success === true) {
          reservation.completed = true;
          console.log(`[Credit Committed] user=${reservation.uid} amount=${reservation.amount} remaining=${reservation.creditsRemaining} request=${reservation.requestId}`);
        }
      }

      if (idempotencyEntry && !finalized) {
        finalized = true;
        idempotencyEntry.resolve({ statusCode, body: finalBody });
      }

      if (res.destroyed || res.writableEnded) return finalBody;
      return originalJson(finalBody);
    };

    return finalize();
  };
}

// Upload a base64 image to KIE.ai File Upload API and return the download URL
async function uploadBase64ToKie(base64DataUrl, apiKey, index = 0) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    const resp = await fetch(FILE_UPLOAD_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        base64Data: base64DataUrl,
        uploadPath: 'images/vton',
        fileName: `garment_${index}_${Date.now()}.png`
      }),
      signal: controller.signal
    });
    const data = await resp.json();
    if (data.code === 200 && data.data && data.data.downloadUrl) {
      console.log(`   вњ… Image ${index} uploaded to KIE: ${data.data.downloadUrl.substring(0, 80)}...`);
      return data.data.downloadUrl;
    }
    console.warn(`   вљ пёЏ Image ${index} upload failed: ${data.msg || JSON.stringify(data)}`);
    return null;
  } catch (err) {
    console.warn(`   вљ пёЏ Image ${index} upload error: ${err.message}`);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function executeKieTask(prompt, imageInputs = [], modelName = "nano-banana-2", aspectRatio = "auto", resolution = "1K") {
  const rawKey = process.env.KIE_API_KEY;
  if (!rawKey) throw new Error("API key missing. Set KIE_API_KEY in .env");
  // Strip BOM, zero-width chars, and whitespace that PowerShell/editors inject
  const apiKey = rawKey.replace(/[\uFEFF\u200B\u200C\u200D\uFFFE\r\n]/g, '').trim();

  // Upload base64 images to KIE File Upload API first (KIE.ai requires URLs, not inline base64)
  let uploadedImageUrls = [];
  if (imageInputs.length > 0) {
    console.log(`   рџ“¤ Uploading ${imageInputs.length} image(s) to KIE File Upload API...`);
    for (let idx = 0; idx < imageInputs.length; idx++) {
      const url = await uploadBase64ToKie(imageInputs[idx], apiKey, idx);
      if (url) uploadedImageUrls.push(url);
    }
    console.log(`   рџ“¤ Uploaded ${uploadedImageUrls.length}/${imageInputs.length} images`);
  }

  const reqBody = {
    model: modelName,
    input: {
      prompt: prompt,
      image_input: uploadedImageUrls,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      output_format: "png"
    }
  };

  return withKieConcurrency(`${modelName}:${aspectRatio}:${resolution}`, async () => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 sec timeout for creation
  let response;
  try {
    response = await fetch(TASK_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(reqBody),
      signal: controller.signal
    });
  } catch (err) {
    throw new Error(`KIE.ai API network error: ${err.message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
     const txt = await response.text();
     throw new Error(`KIE.ai API error (${response.status}): ${txt}`);
  }
  
  const data = await response.json();
  if (data.code && data.code !== 200) {
     throw new Error(`KIE.ai API returned code ${data.code}: ${data.msg || 'Unknown error'}`);
  }
  if (!data.data || !data.data.taskId) {
     throw new Error(`KIE.ai failed to return taskId. Result: ${JSON.stringify(data)}`);
  }
  
  const taskId = data.data.taskId;
  console.log(`вЏі KIE.ai Task created. Model: ${modelName}. TaskID: ${taskId}. Polling...`);

  for (let i = 0; i < 100; i++) {
    const pollDelayMs = Math.min(12000, i === 0 ? 2000 : 3000 + Math.floor(i / 8) * 1000);
    await sleep(pollDelayMs);
    
    const pollController = new AbortController();
    const pollTimeout = setTimeout(() => pollController.abort(), 15000);
    let pollResp;
    try {
      pollResp = await fetch(`${GET_TASK_URL}${taskId}`, {
         headers: { 'Authorization': `Bearer ${apiKey}` },
         signal: pollController.signal
      });
    } catch (err) {
      console.warn(`   вљ пёЏ KIE poll network error: ${err.message}`);
      continue;
    } finally {
      clearTimeout(pollTimeout);
    }
    
    if (!pollResp.ok) continue;
    const pollData = await pollResp.json();
    
    if (pollData?.code && pollData.code !== 200) {
      throw new Error(`KIE.ai API error code ${pollData.code}: ${pollData.msg || 'Unknown error'}`);
    }
    if (pollData?.data?.state === 'success') {
       const resultStr = pollData.data.resultJson;
       if (!resultStr) throw new Error("Task success but no resultJson");
       let resultObj;
       try { resultObj = JSON.parse(resultStr); } catch (e) { throw new Error("Failed to parse resultJson: " + resultStr); }
       
       const imageUrls = resultObj.resultUrls || resultObj.images || [];
       if (imageUrls.length > 0) return imageUrls[0];
       throw new Error("No image URLs in result: " + resultStr);
    } else if (pollData?.data?.state === 'failed' || pollData?.data?.failCode) {
       throw new Error(`Task failed: ${pollData.data.failMsg || pollData.data.failCode || 'Unknown error'}`);
    } else {
       console.log(`   ...Task ${taskId} state: ${pollData?.data?.state || 'unknown'} (poll ${i+1}/100, nextDelayMs=${pollDelayMs})`);
    }
  }
  
  throw new Error("Task timed out while polling KIE.ai.");
  });
}

const extractBase64 = (dataUrl) => {
  let mimeType = 'image/jpeg', base64str = dataUrl;
  const match = dataUrl.match(/^data:(image\/\w+);base64,/);
  if (match) { mimeType = match[1]; base64str = dataUrl.replace(/^data:image\/\w+;base64,/, ''); }
  return { mimeType, base64str };
};

// Download image from URL and return base64
const downloadToBase64 = async (url) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 sec timeout
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    const arrBuf = await resp.arrayBuffer();
    const b64 = Buffer.from(arrBuf).toString('base64');
    const contentType = resp.headers.get('content-type') || 'image/jpeg';
    return { mimeType: contentType, base64str: b64 };
  } catch (err) {
    console.warn(`вљ пёЏ Failed to download image from ${url.substring(0, 50)}...:`, err.message);
    return null;
  }
};

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// BODY TYPE METRIC INJECTOR
// Converts vague artistic body descriptions into hard clinical metrics
// that Gemini can't "smooth away" into average proportions.
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// GENDER-ISOLATED ATTRIBUTE DICTIONARIES
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
const DICT_FEMALE = {
  'РҐСѓРґРѕС‰Р°РІРѕРµ': '<BODY_OVERRIDE>TARGET: SLENDER PETITE FEMALE. Very thin feminine frame, delicate narrow shoulders, slender limbs, visible collarbones. Deform clothing to drape over a noticeably thin female body.</BODY_OVERRIDE>',
  'РЎРїРѕСЂС‚РёРІРЅРѕРµ': '<BODY_OVERRIDE>TARGET: FIT FEMALE / YOGA BODY. Toned feminine figure, subtle healthy muscle definition on arms and core. Maintain soft feminine curves and female breast contour. Adjust clothing for an active female fit.</BODY_OVERRIDE>',
  'РЎСЂРµРґРЅРµРµ': '<BODY_OVERRIDE>TARGET: AVERAGE NORMAL FEMALE. Standard healthy feminine proportions, natural female curves, soft body lines.</BODY_OVERRIDE>',
  'РџРѕР»РЅРѕРµ': '<BODY_OVERRIDE>TARGET: OBESE PLUS-SIZE FEMALE. Very heavy-set, visibly fat body, thick heavy neck, prominent double chin, chubby cheeks, round chubby face, wide thick waist, large round belly, heavy arms, thick thighs. Expand all clothing extremely to fit a very heavy plus-size woman (US clothing size 3XL, BMI 35+). Do NOT make her waist slim or face thin. She must look explicitly fat.</BODY_OVERRIDE>',
  'РњСѓСЃРєСѓР»РёСЃС‚РѕРµ': '<BODY_OVERRIDE>TARGET: STRONG FEMALE ATHLETE / CROSSFIT BUILD. Strictly retain FEMININE body structure. Defined abdominal muscles, strong toned female arms. ABSOLUTELY NO masculine chest, NO thick male neck. Deform clothing to fit a very muscular BIOLOGICAL WOMAN.</BODY_OVERRIDE>',
  'Р‘СЂСЋРЅРµС‚РєР°': '<HAIR_COLOR>Deep rich dark brunette brown female hair</HAIR_COLOR>',
  'РЁР°С‚РµРЅРєР°': '<HAIR_COLOR>Warm chestnut brown female hair</HAIR_COLOR>',
  'Р‘Р»РѕРЅРґРёРЅРєР°': '<HAIR_COLOR>Bright golden blonde female hair</HAIR_COLOR>',
  'Р С‹Р¶Р°СЏ': '<HAIR_COLOR>Vibrant copper ginger red female hair</HAIR_COLOR>',
  'Р§С‘СЂРЅС‹Рµ': '<HAIR_COLOR>Jet black female hair, pure dark</HAIR_COLOR>',
  'РЎРµРґС‹Рµ': '<HAIR_COLOR>Elegant silver-gray white mature female hair</HAIR_COLOR>',
  'РљРѕСЂРѕС‚РєРёРµ': '<HAIR_LENGTH>Chic short feminine haircut, pixie cut or short bob framing a female face.</HAIR_LENGTH>',
  'РЎСЂРµРґРЅРёРµ': '<HAIR_LENGTH>Medium-length elegant female hair, reaching the collarbones.</HAIR_LENGTH>',
  'Р”Р»РёРЅРЅС‹Рµ': '<HAIR_LENGTH>Long, beautiful flowing feminine hair cascading well past the chest.</HAIR_LENGTH>',
  'Р‘СЂРёС‚Р°СЏ': '<HAIR_LENGTH>TARGET: COMPLETELY BALD FEMALE / SHAVED HEAD. Bare scalp on a biological woman. CRITICAL: Maintain highly elegant, delicate FEMININE facial bone structure and flawless makeup. Do NOT make her look masculine.</HAIR_LENGTH>',
  'РќРµР№С‚СЂР°Р»СЊРЅР°СЏ': '<EXPRESSION>Calm, relaxed feminine face, soft neutral gaze, relaxed lips.</EXPRESSION>',
  'Р›С‘РіРєР°СЏ СѓР»С‹Р±РєР°': '<EXPRESSION>Gentle, warm, inviting feminine smile, soft friendly eyes.</EXPRESSION>',
  'РЎРµСЂСЊС‘Р·РЅР°СЏ': '<EXPRESSION>Intense high-fashion editorial female look, striking feminine features, slight pout, no smile.</EXPRESSION>',
  'РЈРІРµСЂРµРЅРЅР°СЏ': '<EXPRESSION>Powerful, confident woman, chin slightly raised, commanding gaze.</EXPRESSION>',
  'Р”РµСЂР·РєР°СЏ': '<EXPRESSION>Fierce femme-fatale attitude, seductive or playful smirk, bold confident female energy.</EXPRESSION>',
  'РЈС€Рё': '<PIERCING>MANDATORY RENDER: Shiny metallic earrings clearly visible in the woman\'s earlobes.</PIERCING>',
  'РќРѕСЃ': '<PIERCING>MANDATORY RENDER: Delicate female nose ring/stud piercing clearly visible on her nostril.</PIERCING>',
  'РЈС€Рё + РќРѕСЃ': '<PIERCING>MANDATORY RENDER: Feminine earrings AND a delicate nostril nose ring clearly visible.</PIERCING>',
  'РњРёРЅРёРјР°Р»РёР·Рј': '<TATTOO>MANDATORY RENDER: Elegant minimalist fine-line black ink tattoos visible on exposed female skin.</TATTOO>',
  'Р СѓРєР°РІ': '<TATTOO>MANDATORY RENDER: Detailed artistic tattoo sleeve fully covering one of the woman\'s arms.</TATTOO>',
  'РЁРµСЏ': '<TATTOO>MANDATORY RENDER: Prominent artistic dark ink tattoo strictly located on the woman\'s neck/throat area. Do NOT thicken the neck!</TATTOO>',
};

const DICT_MALE = {
  'РҐСѓРґРѕС‰Р°РІРѕРµ': '<BODY_OVERRIDE>TARGET: LEAN/SLIM MALE. Lanky boyish build, narrow shoulders, thin masculine arms, low body fat. Force clothing to drape loosely on a thin male frame.</BODY_OVERRIDE>',
  'РЎРїРѕСЂС‚РёРІРЅРѕРµ': '<BODY_OVERRIDE>TARGET: FIT ATHLETIC MALE. Gym-goer / swimmer physique, defined masculine chest and arms, flat core, broad shoulders. Reshape clothing to highlight athletic male contours.</BODY_OVERRIDE>',
  'РЎСЂРµРґРЅРµРµ': '<BODY_OVERRIDE>TARGET: AVERAGE MALE. Standard everyday male body, regular build, healthy proportions.</BODY_OVERRIDE>',
  'РџРѕР»РЅРѕРµ': '<BODY_OVERRIDE>TARGET: OBESE HEAVY-SET MALE. Visibly overweight fat man, thick heavy neck, prominent double chin, round chubby face, large portly belly, broad heavy waist, thick arms. Expand all clothing extremely to fit a very heavy male figure (US clothing size 3XL, BMI 35+). He must look explicitly fat.</BODY_OVERRIDE>',
  'РњСѓСЃРєСѓР»РёСЃС‚РѕРµ': '<BODY_OVERRIDE>TARGET: HYPER-MUSCULAR MALE BODYBUILDER. Massive masculine build. Hyper-defined biceps, broad powerful shoulders (V-taper), thick masculine neck, heavy chest muscles. Stretch clothing extremely tightly across massive male muscles.</BODY_OVERRIDE>',
  'Р‘СЂСЋРЅРµС‚': '<HAIR_COLOR>Deep rich dark brunette brown male hair</HAIR_COLOR>',
  'РЁР°С‚РµРЅ': '<HAIR_COLOR>Warm chestnut brown male hair</HAIR_COLOR>',
  'Р‘Р»РѕРЅРґРёРЅ': '<HAIR_COLOR>Bright golden blonde male hair</HAIR_COLOR>',
  'Р С‹Р¶РёР№': '<HAIR_COLOR>Vibrant copper ginger red male hair</HAIR_COLOR>',
  'Р§С‘СЂРЅС‹Рµ': '<HAIR_COLOR>Jet black male hair, pure dark</HAIR_COLOR>',
  'РЎРµРґС‹Рµ': '<HAIR_COLOR>Silver fox, sophisticated silver-gray white mature male hair</HAIR_COLOR>',
  'РљРѕСЂРѕС‚РєРёРµ': '<HAIR_LENGTH>Classic short male haircut, neat fade or styled crop.</HAIR_LENGTH>',
  'РЎСЂРµРґРЅРёРµ': '<HAIR_LENGTH>Medium-length male hair, stylish modern flow or surfer look.</HAIR_LENGTH>',
  'Р”Р»РёРЅРЅС‹Рµ': '<HAIR_LENGTH>Long masculine hair, reaching shoulders, Viking or rockstar aesthetic.</HAIR_LENGTH>',
  'Р‘СЂРёС‚С‹Р№': '<HAIR_LENGTH>TARGET: COMPLETELY BALD MALE. Clean shaved masculine scalp, strong skull shape, sharp male jawline.</HAIR_LENGTH>',
  'РќРµР№С‚СЂР°Р»СЊРЅР°СЏ': '<EXPRESSION>Calm, stoic masculine face, relaxed strong jaw, steady gaze.</EXPRESSION>',
  'Р›С‘РіРєР°СЏ СѓР»С‹Р±РєР°': '<EXPRESSION>Approachable, friendly male smile, warm eyes.</EXPRESSION>',
  'РЎРµСЂСЊС‘Р·РЅС‹Р№': '<EXPRESSION>Intense, sharp masculine gaze, serious focused editorial look, furrowed brow.</EXPRESSION>',
  'РЈРІРµСЂРµРЅРЅС‹Р№': '<EXPRESSION>Strong alpha presence, self-assured male expression, solid eye contact.</EXPRESSION>',
  'Р”РµСЂР·РєРёР№': '<EXPRESSION>Rebellious, edgy masculine attitude, defiant smirk, squinted challenging eyes.</EXPRESSION>',
  'РЈС€Рё': '<PIERCING>MANDATORY RENDER: Shiny metallic stud/hoop earrings clearly visible in the man\'s earlobes.</PIERCING>',
  'РќРѕСЃ': '<PIERCING>MANDATORY RENDER: Masculine nose ring/stud piercing clearly visible on his nostril.</PIERCING>',
  'РЈС€Рё + РќРѕСЃ': '<PIERCING>MANDATORY RENDER: Male earrings AND a nostril nose ring clearly visible.</PIERCING>',
  'РњРёРЅРёРјР°Р»РёР·Рј': '<TATTOO>MANDATORY RENDER: Sharp minimalist fine-line black ink tattoos visible on exposed male skin.</TATTOO>',
  'Р СѓРєР°РІ': '<TATTOO>MANDATORY RENDER: Dense, dark ink FULL TATTOO SLEEVE completely covering ONE ENTIRE ARM.</TATTOO>',
  'РЁРµСЏ': '<TATTOO>MANDATORY RENDER: Prominent artistic dark ink tattoo strictly located on the man\'s neck/throat area.</TATTOO>',
};

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// POSE LIBRARIES (50 female + 50 male)
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
const FEMALE_POSES = [
  "Classic frontal stance, arms relaxed down with slight space between arms and torso to show garment shape.",
  "Weight shifted to one leg, natural soft hip curve, hands resting naturally at sides.",
  "Subtle 3/4 turn towards the camera, looking over the front shoulder, arms loose.",
  "Symmetrical standing, perfect posture, chin parallel to the floor, high fashion catalog look.",
  "Casual straight stance, feet shoulder-width apart, arms hanging with relaxed hands.",
  "One foot slightly forward, natural effortless posture, chest open and facing the lens.",
  "Delicate lean backward, weight on the back heel, front leg extended slightly.",
  "Soft A-frame stance, hands gently clasped behind the back to fully expose the front garment.",
  "Upright posture, slight tilt of the head, hands resting softly on upper thighs.",
  "Elegant simplicity, standing tall, shoulders completely relaxed, soft facial expression.",
  "One hand resting lightly on the waist, opposite arm straight down, confident look.",
  "Both hands placed gently on the hips, elbows pointing outward to create a strong silhouette.",
  "Thumbs hooked casually into front pockets, hands resting low to keep the shirt visible.",
  "One hand touching the lower hip/thigh, slight twist of the torso, dynamic catalog pose.",
  "Right hand on waist, left hand lightly touching the jawline, editorial attitude.",
  "Fingers loosely resting on the belt loops, shoulders dropped, effortless cool.",
  "One hand placed on the lower back to push the chest slightly forward, proud posture.",
  "Asymmetrical hip placement, one hand low on the waist, creating an hourglass shape.",
  "Subtle power pose, hands on waist but pulled back so the front of the garment is unobstructed.",
  "Casual frame, hands touching the side seams of the pants/skirt, looking straight.",
  "Mid-stride forward walk, right foot leading, natural arm swing capturing movement.",
  "Stepping confidently towards the camera, wind-blown aesthetic, fabric in motion.",
  "Dynamic step to the side, shifting weight sharply, creating diagonal energy.",
  "Mid-turn, body twisted sideways but face looking back at the camera over the shoulder.",
  "Striding forward rapidly, shoulders back, chin high, runway walk momentum.",
  "Light stepping motion, one heel lifted, floating and airy sensation.",
  "Stepping heavily on the front foot, leaning slightly into the motion, strong street-style walk.",
  "Walking away from the lens but upper torso completely turned to look back.",
  "Subtle swaying motion, weight shifting from left to right, capturing soft fabric drape.",
  "Action stance, stepping down as if descending a stair, dynamic angles.",
  "Avant-garde geometry, one shoulder raised, sharp collarbones, intense gaze.",
  "Dramatic lean, torso angled 45 degrees, face turned to the camera, arms dropped.",
  "One hand resting behind the neck, elbow pointing up, chest perfectly open and visible.",
  "High-fashion slouch, upper back slightly rounded, chin tucked, intense moody look.",
  "Asymmetrical arm placement, one arm extended slightly outward, creating negative space.",
  "Vogue cover pose, chin lifted high, one hand lightly touching the collarbone.",
  "Subtle torso twist, creating an S-curve, hands kept entirely out of the garment's way.",
  "Architectural stance, sharp angles with the body, leaning sideways into an invisible wall.",
  "Fashion drop, one shoulder aggressively dropped down, neck elongated.",
  "Elegant power, hands crossed but placed extremely low below the hips.",
  "Wide confident stance, feet apart, alpha female energy, intense straight gaze.",
  "Strong athletic ready-stance, slight knee bend, focused powerful presence.",
  "Urban attitude, leaning slightly forward, hands relaxed but body full of tension.",
  "Fists gently clenched by the sides, feet firmly planted, strong aesthetic.",
  "Power pose: chest pushed forward, shoulders rolled back, absolute dominance.",
  "One foot planted heavily forward, strong torso angle, rebellious attitude.",
  "Casual streetwear slouch, hands deep in front pockets, straight unbothered look.",
  "Wide stance, slightly squatting or low-angle lean, edgy urban posture.",
  "Looking directly into the lens with a fierce, challenging smirk, chest out.",
  "Standing perfectly tall, unshakeable confidence, commanding runway presence.",
];

const MALE_POSES = [
  "Strong upright stance, arms relaxed by the sides, shoulders squared to the camera.",
  "Weight shifted slightly to one leg, relaxed masculine posture, natural arms.",
  "Frontal view, feet shoulder-width apart, arms hanging straight down, classic catalog.",
  "Subtle 3/4 angle, face turned to the camera, strong jawline display, relaxed arms.",
  "Symmetrical stance, perfect posture, chest slightly open, professional male model look.",
  "Relaxed straight stand, subtle droop in one shoulder for an unposed feel.",
  "One foot slightly forward, arms detached from torso to clearly show garment fit.",
  "Frontal stance, chest relaxed, hands resting in back pockets, easygoing stance.",
  "Perfect vertical posture, chin parallel to the floor, neutral masculine grounding.",
  "Slight forward lean from the waist, engaging the camera directly, arms loose.",
  "Right hand fully in the pants pocket, left arm relaxed by the side, effortless casual look.",
  "Both hands resting lightly in front pockets, thumbs visible pointing inward.",
  "Left hand in pocket, right arm slightly bent, casual street-style leaning posture.",
  "One hand casually hooked onto the belt loop, weight on one leg, confident relaxed vibe.",
  "Both thumbs resting lightly in the front pockets, hands hanging loose, modern casual.",
  "Hands resting on hips but positioned low near the belt line, strong casual stance.",
  "One hand in pocket, the other hand adjusting the opposite cuff or watch.",
  "Casual slouch, one hand in pocket, shoulders relaxed forward, urban aesthetic.",
  "Both hands deep in pockets, slight lean back, confident and effortlessly stylish.",
  "Hands resting in back pockets, chest pushed forward, extremely relaxed weekend vibe.",
  "Mid-stride confident walk, right foot forward, natural masculine arm swing.",
  "Urban street walk, stepping directly towards the camera, intense focused gaze.",
  "Walking casually, looking off to the side, one hand swinging, dynamic fabric movement.",
  "Stepping heavily forward, strong momentum, wide shoulders, commanding presence.",
  "Looking back over the shoulder while mid-stride away from the camera, dynamic turn.",
  "Fast paced walk, slight lean forward, energetic and modern city vibe.",
  "Walking posture with one hand sliding into a pocket, capturing mid-movement flow.",
  "Slightly elevated step, representing walking up stairs or uneven ground, active look.",
  "Striding with purpose, both arms swinging naturally, chest leading the movement.",
  "Urban motion, stopping mid-step, shifting weight backward, highly dynamic tension.",
  "High fashion male pose, subtle torso twist, strong neck, angular and sharp posture.",
  "One hand touching the back of the neck, elbow raised, highly editorial framing.",
  "Slight lean to the side as if resting on an invisible wall, relaxed but striking.",
  "Shoulder dropped, chin raised slightly, arrogant high-fashion editorial look.",
  "Hands gently clasped in front of the lower waist, highly formal and composed.",
  "Tilted head, intense eye contact, body turned slightly, emphasizing the jaw and shoulders.",
  "Leaning forward slightly, looking up from under the brow, intense moody editorial.",
  "Hands rubbing together slowly, elbows slightly out, sophisticated dynamic tension.",
  "Adjusting the collar or tie, sharp focused look, classic menswear editorial.",
  "One hand resting on the chin/jawline, the thinker pose, highly intellectual and sharp.",
  "Wide dominant stance, arms crossed firmly over the lower chest, kept low to show clothing.",
  "Strong athletic ready position, wide feet, slight knee bend, intense alpha focus.",
  "Legs wide apart, fists slightly clenched by the hips, exuding raw power and strength.",
  "Power pose: chest pushed forward, broad shoulders expanded, looking down slightly.",
  "One foot heavily forward, leaning into the stance, aggressive and confident posture.",
  "Athletic rest pose, hands on hips, chest expanding, heavy breath look.",
  "Arms folded loosely, dominant posture, unshakeable solid grounding.",
  "Standing extremely tall, military-like straight posture, commanding alpha presence.",
  "Flexing subtly, arms slightly bent, emphasizing arm and shoulder definition.",
  "Legs wide, hands resting on upper thighs, slightly leaning forward, fierce masculine dominance.",
];

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// BIOMETRIC NOISE + POSE SELECTOR
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
const MICRO_FEATURES = [
  "slightly asymmetrical jawline", "tiny beauty mark on cheek", "straight sharp nose bridge",
  "soft rounded jaw", "subtle dimples", "slightly wider-set eyes", "faint natural freckles across nose",
  "angular prominent cheekbones", "deep-set eyes with heavy brows", "straight flat eyebrows",
  "almond-shaped eyes", "full plump lips", "thin refined lips", "broad flat nose bridge",
  "narrow pointed chin", "wide strong chin", "arched dramatic eyebrows", "slightly upturned nose",
];

function getBiometricNoise(seed) {
  if (!seed) return '';
  const idx = parseInt(seed, 36) % MICRO_FEATURES.length;
  const idx2 = (parseInt(seed, 36) + 7) % MICRO_FEATURES.length;
  return idx === idx2 ? MICRO_FEATURES[idx] : `${MICRO_FEATURES[idx]}, ${MICRO_FEATURES[idx2]}`;
}

function detectGender(modelPreset) {
  if (!modelPreset) return 'female';
  const lower = modelPreset.toLowerCase();
  if (/\b(male|РјСѓР¶СЃРє|СЃР»Р°РІСЏРЅРёРЅ|Р°Р·РёР°С‚\b|РµРІСЂРѕРїРµРµС†|Р°С„СЂРёРєР°РЅРµС†|Р»Р°С‚РёРЅРѕР°РјРµСЂРёРєР°РЅРµС†)\b/i.test(lower)) return 'male';
  return 'female';
}

function selectPoseFromSeed(seed, gender) {
  const poses = gender === 'male' ? MALE_POSES : FEMALE_POSES;
  const numericSeed = Math.abs(parseInt(seed, 36)) || Math.floor(Math.random() * 100000);
  return poses[numericSeed % poses.length];
}

function buildGenderLock(gender) {
  return gender === 'male'
    ? '<GENDER_LOCK>BIOLOGICAL MALE. You MUST strictly enforce male anatomy, masculine bone structure, masculine hands with wider knuckles, and male features. The model is a MAN.</GENDER_LOCK>'
    : '<GENDER_LOCK>BIOLOGICAL FEMALE. You MUST strictly enforce 100% biological female anatomy: female breast contour, narrow waist, highly feminine facial features, DELICATE FEMININE HANDS (slender fingers, narrow wrists, soft skin, NO masculine knuckles or veins), and elegant feminine posture. Under NO circumstances should ANY body part вЂ” especially hands and arms вЂ” look masculine, even if she is muscular or bald. Every visible limb must read as unmistakably female.</GENDER_LOCK>';
}

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// SKIN RENDER MODES
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
const SKIN_BEAUTY_PROMPT = `<RENDER_PIPELINE>
MODE: HIGH-END BEAUTY FASHION EDITORIAL.
DIRECTIVE: Apply high-end commercial fashion retouching. Flawless, perfectly smooth, airbrushed skin. Glowing complexion, perfectly even skin tone, soft flattering studio lighting. Idealized model features.
</RENDER_PIPELINE>`;

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// ATTRIBUTE DIRECTIVE BUILDER (gender-aware)
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
function buildAttributeDirectives(attributes, gender) {
  if (!attributes || typeof attributes !== 'object') return '';
  const dict = gender === 'male' ? DICT_MALE : DICT_FEMALE;
  const directives = [];
  Object.entries(attributes).forEach(([key, val]) => {
    if (!val) return;
    if (val === 'РќРµС‚' || (Array.isArray(val) && val.length === 1 && val[0] === 'РќРµС‚')) {
      if (key === 'tattoo') directives.push('<TATTOO_CONSTRAINT>ABSOLUTELY NO TATTOOS. Completely pure, clean, unblemished skin. Zero ink anywhere.</TATTOO_CONSTRAINT>');
      if (key === 'piercing') directives.push('<PIERCING_CONSTRAINT>ABSOLUTELY NO PIERCINGS. Clean unadorned face and ears, zero metal.</PIERCING_CONSTRAINT>');
      return;
    }
    if (Array.isArray(val)) {
      val.filter(x => x !== 'РќРµС‚').forEach(item => { if (dict[item]) directives.push(dict[item]); });
    } else {
      if (dict[val]) directives.push(dict[val]);
    }
  });
  return directives.join('\n');
}

function enhanceBodyMetrics(preset, editCmd) {
  let enhanced = preset || '';
  if (editCmd && editCmd.trim()) {
    enhanced += `\nрџ”ґ PRIORITY EDIT OVERRIDE: "${editCmd.trim()}". Apply this transformation flawlessly.`;
  }
  return enhanced;
}
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// GARMENT SANITIZER вЂ” destroys facial data with solid black box
// Gaussian blur leaves low-frequency data (skull shape, jawline shadows)
// that Gemini can reconstruct. Solid black box = total pixel destruction.
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
async function sanitizeGarmentImage(imageBase64, index) {
  // Sanitization skipped вЂ” nano-banana-2 handles garment reference via text prompt.
  // Direct image editing requires separate model which is deprecated.
  console.log(`   в„№пёЏ Garment ${index + 1}: sanitization skipped (using direct reference)`);
  return imageBase64;
}

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// PRODUCT MODE вЂ” XML-С‚РµРіРёСЂРѕРІР°РЅРЅР°СЏ СЃРёСЃС‚РµРјР° РїСЂРѕРјРїС‚РѕРІ РґР»СЏ РїСЂРµРґРјРµС‚РЅРѕР№ СЃСЉРµРјРєРё
// РђРЅР°Р»РѕРі Fashion Mode cognitive_override, РЅРѕ СЃ РћР‘Р РђРўРќРћР™ Р»РѕРіРёРєРѕР№:
// "РСЃС…РѕРґРЅС‹Р№ С‚РѕРІР°СЂ = Sacred Blueprint, Р·Р°РјРѕСЂРѕР·СЊ РµРіРѕ РїРёРєСЃРµР»Рё 1:1"
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ

const CATEGORY_CONFIGS = {
  cosmetics: {
    materials: `<material_rendering_directive>
- SURFACES: High-fidelity separation between frosted glass, matte soft-touch plastics, and glossy acrylics.
- VOLUMETRICS: Apply Subsurface Scattering (SSS) to semi-translucent creams, serums, and liquids for a natural, premium organic glow.
- LABELS: Maintain crisp, perfectly flat typography and brand logos. Zero perspective warping or distortion on the text.
- REFLECTIONS: Smooth, continuous specular highlights on cylindrical and curved edges.
</material_rendering_directive>`,
    lighting: `<lighting_protocol>
- STYLE: High-end softbox beauty lighting.
- SETUP: Large diffused overhead modifiers and strip-lights.
- GOAL: Clean, luminous shadows. Fill lights must ensure the front label is perfectly lit and 100% legible. Zero harsh or distracting drop-shadows on the product face.
</lighting_protocol>`
  },

  // 'fragrance' matches presets.js ID (Deep Think used 'perfume')
  fragrance: {
    materials: `<material_rendering_directive>
- REFRACTION & OPTICS: Accurate Index of Refraction (IOR) for heavy crystal glass and perfume liquid. Generate realistic optical distortion and internal reflections.
- METALS: Heavy polished metallic atomizers, collars, and caps must reflect the surrounding environment cleanly with high contrast.
- FLUIDS: Simulate volumetric light transmission and subtle chromatic aberration through the liquid.
</material_rendering_directive>`,
    lighting: `<lighting_protocol>
- STYLE: Luxury cinematic lighting.
- SETUP: Strong directional backlighting or side-lighting to illuminate the liquid from within, making it glow.
- FX: Intense, realistic glass and liquid caustics projected onto the resting surface.
- LENS: Heavy, creamy cinematic bokeh (shallow depth of field) in the background to isolate the tack-sharp product in the foreground.
</lighting_protocol>`
  },

  jewelry: {
    materials: `<material_rendering_directive>
- METALS: Flawless metallic surface rendering (Gold/Silver/Platinum/Rose Gold). Anisotropic reflections for brushed metals, pure mirror-like speculars for polished metals.
- GEMSTONES: Physically accurate light dispersion (diamond fire), internal ray-traced refractions, multi-faceted brilliance, and prism effects.
- MICRO-DETAILS: Extreme macro resolution. Hallmarks, intricate engravings, and prongs must have razor-sharp micro-contrast. Zero melting of small metal links.
</material_rendering_directive>`,
    lighting: `<lighting_protocol>
- STYLE: Extreme macro dramatic studio lighting.
- SETUP: Pinpoint LED spot lights directly aimed at gemstones to trigger maximum sparkle and sharp caustics.
- GOAL: Use simulated black and white bounce reflection cards around the product to create deep, striking edge gradients on metal curves. Focus stacking simulation (entire piece is 100% sharp).
</lighting_protocol>`
  },

  // в”Ђв”Ђ Full CGI configs from Deep Think Parts 1-3 в”Ђв”Ђ
  supplements: {
    materials: `<material_rendering_directive>
- PLASTICS & SURFACES: Render medical-grade plastics with distinct PBR properties: high-gloss reflections for PET, light-absorbing soft-touch for matte HDPE bottles.
- TYPOGRAPHY & LABELS: Extreme crispness protocol. Nutritional facts, barcodes, and logos must maintain razor-sharp vector-like precision with zero AI bleeding or distortion.
- CONTENTS: If visible, apply realistic gelatin semi-translucency with Subsurface Scattering (SSS) for capsules, and dry, granular micro-textures for organic powders.
- PURITY: Maintain absolute clinical hygiene. Flawless surface rendering with zero dust, smudges, or organic imperfections.
</material_rendering_directive>`,
    lighting: `<lighting_protocol>
- STYLE: Clinical, trustworthy, high-key commercial studio lighting (5000K-5500K).
- SETUP: Massive overhead diffusion panels and broad wrap-around fill light.
- GOAL: Eliminate deep shadows. Establish a pure, airy, shadowless medical aesthetic that conveys premium health standards and safety.
</lighting_protocol>`
  },

  decor_candles: {
    materials: `<material_rendering_directive>
- WAX VOLUMETRICS: Apply deep Subsurface Scattering (SSS) to soy, beeswax, or paraffin wax. The wax must exhibit organic depth and milky semi-translucency, absorbing and scattering light near the flame.
- FLAME & WICK: Render charred micro-details on the braided cotton/wood wick. The flame must have a structurally accurate hot core with localized volumetric light emission.
- VESSELS: High-fidelity IOR for heavy glass jars, organic micro-porosity for unglazed ceramics, and anisotropic reflections for brushed metal lids.
- STRUCTURAL INTEGRITY: Maintain perfect circular geometry of the jar lip. Zero melting of the container's structural shape into the wax.
</material_rendering_directive>`,
    lighting: `<lighting_protocol>
- STYLE: Intimate, moody, and cozy atmospheric ambient lighting.
- COLOR TEMP: Warm incandescent and candlelight (2700K-3000K).
- FX: Soft volumetric glow radiating from the flame, casting warm ambient bounce light onto surrounding textures. Soft, elongated drop-shadows with a natural warm fall-off.
</lighting_protocol>`
  },

  electronics: {
    materials: `<material_rendering_directive>
- HARD SURFACE GEOMETRY: Strict hard surface CGI rendering. Absolute mathematical precision. Zero distortion, bending, or organic melting of parallel lines, bezels, and sharp geometric corners.
- TEXTURES: High-resolution PBR micro-bump mapping for accessories (matte friction-grip silicone, porous full-grain leather, woven carbon fiber, or rugged polycarbonate).
- REFLECTIONS: Perfect planar mirror-like reflection mapping on glossy glass screens. Smooth, continuous anisotropic gradients on machined aluminum or steel edges.
- SCREENS & LENSES: If visible, render with perfect pixel-grid simulation, OLED backlight emission, zero UI glare, and perfectly circular, pristine camera lenses.
</material_rendering_directive>`,
    lighting: `<lighting_protocol>
- STYLE: Premium, cool-toned futuristic tech studio lighting (5000K-6500K).
- SETUP: Precision gradient light modifiers (long strip softboxes) casting smooth, continuous zebra-stripe reflections across flat surfaces and glossy panels.
- EDGES: Intense, sharp accent rim lights to brilliantly define the product's silhouette, trace edge chamfers, and separate the device from the background.
</lighting_protocol>`
  },

  pet_supplies: {
    materials: `<material_rendering_directive>
- TEXTURE & TACTILITY: High-fidelity micro-textures. Render plush fabrics with distinct soft fibers. Emphasize high-friction matte or glossy surfaces for rubber/silicone chew toys.
- PACKAGING: Preserve ultra-clean, vibrant, and cheerful vector illustrations. Zero AI bleeding, smudging, or text distortion on packaging.
- CONTENTS: If pet food/treats are visible, render realistic porous baked kibble micro-textures or natural organic meat grains. Zero plastic sheen on food.
- PLASTICS: Safe, smooth, non-toxic pet-grade plastic rendering with clean specular highlights.
</material_rendering_directive>`,
    lighting: `<lighting_protocol>
- STYLE: Cheerful, bright, uplifting commercial lifestyle lighting.
- COLOR TEMP: Warm, friendly, and sunny daylight (4000K).
- SETUP: Broad diffused softbox illumination with bright fill lights to eliminate harsh or dramatic shadows.
- GOAL: Create a positive, safe, and approachable atmosphere.
</lighting_protocol>`
  },

  stationery: {
    materials: `<material_rendering_directive>
- PAPER & CARDBOARD: Authentic paper fiber micro-grain. Differentiate paper thickness (GSM) and render precise, razor-sharp edges for layered pages.
- LEATHER & BINDING: High-resolution bump mapping for full-grain or faux leather covers. Crisp, perfect geometric stitching and highly precise foil debossing/embossing.
- HARDWARE: Physically accurate metallic reflections on binder rings, clips, and zippers (brushed brass, polished chrome, matte black).
- INK & WRITING: Absolute vector-precision for printed lines, grids, and typography.
</material_rendering_directive>`,
    lighting: `<lighting_protocol>
- STYLE: Clean, minimal, airy natural workspace daylight (Flat lay optimized).
- COLOR TEMP: Pure overcast daylight (5500K).
- SETUP: Large overhead softbox simulating massive window light.
- GOAL: Extremely soft, short drop-shadows. Maintain even illumination across the flat lay without muddying the composition with deep contrast.
</lighting_protocol>`
  },

  food: {
    materials: `<material_rendering_directive>
- FOOD STYLING PBR: Maximize appetite appeal. Render rich specular gloss for viscous liquids (honey/syrup), tempered satin sheen for chocolate, and organic porous roughness for nuts/baked goods.
- FRESHNESS & FX: Apply photorealistic condensation droplets with accurate IOR on cold surfaces, and volumetric ray-traced steam/vapor for hot items.
- PACKAGING: Distinct tactile fidelity for raw fibrous kraft paper, crinkly foil, transparent glass, or food-safe plastics.
- HERO INGREDIENTS: Companion ingredients must look plump, vibrant, and organically fresh with natural subsurface scattering on fruits and leaves.
</material_rendering_directive>`,
    lighting: `<lighting_protocol>
- STYLE: High-end commercial food styling lighting with a golden hour feel.
- COLOR TEMP: Warm, appetizing, and inviting hero light (3500K-4000K).
- SETUP: Strong directional backlight (kicker) to reveal translucency in liquids/leaves, enhance micro-textures, and naturally illuminate steam.
- FILL: Bright simulated bounce cards from below to eliminate muddy "dead" shadows and maintain vibrant color purity.
</lighting_protocol>`
  },

  sports: {
    materials: `<material_rendering_directive>
- TECHNICAL MATERIALS: Strict PBR rendering of athletic gear. Matte stretch porosity for neoprene, cellular macro-texture for EVA foam, and tight woven patterns for nylon straps.
- GRIP & HARDWARE: Deep, mathematically perfect tactile friction patterns on rubber grips and treads. Anisotropic reflections on machined aluminum or brushed steel buckles.
- STRUCTURAL INTEGRITY: Zero organic melting. Equipment must look highly tensioned, robust, and structurally sound. Perfect geometric cylinders for weights/bars.
</material_rendering_directive>`,
    lighting: `<lighting_protocol>
- STYLE: High-contrast, dynamic, energetic athletic studio lighting.
- COLOR TEMP: Cool, intense key light (5000K) paired with a contrasting warm fill or rim light.
- SETUP: Hard directional edge/rim lighting (kickers) to deeply carve out grip textures, woven fabrics, and metallic edges. Dynamic angle.
- GOAL: Dramatic, moody background falloff with sharp shadows to emphasize action, strength, and premium performance.
</lighting_protocol>`
  },

  // Р¤РѕР»Р±СЌРє РґР»СЏ РЅРµРёР·РІРµСЃС‚РЅС‹С… РєР°С‚РµРіРѕСЂРёР№
  default: {
    materials: `<material_rendering_directive>
- SURFACES: Physically accurate PBR materials based on the original image.
- DETAILS: Maintain correct surface roughness, specularity, and exact color preservation.
</material_rendering_directive>`,
    lighting: `<lighting_protocol>
- STYLE: Professional E-commerce Studio Lighting.
- SETUP: Balanced softbox lighting. Clear shadows to ground the object, crisp highlights to define shape.
</lighting_protocol>`
  }
};

/**
 * РЎРѕР±РёСЂР°РµС‚ РїРѕР»РЅС‹Р№ XML-РїСЂРѕРјРїС‚ РґР»СЏ РїСЂРµРґРјРµС‚РЅРѕР№ С„РѕС‚РѕСЃСЉРµРјРєРё С‚РѕРІР°СЂРѕРІ
 * РђРЅР°Р»РѕРі buildMasterPrompt() РґР»СЏ Fashion Mode, РЅРѕ СЃ РѕР±СЂР°С‚РЅРѕР№ Р»РѕРіРёРєРѕР№
 */
function buildProductPrompt({
  categoryId,
  productPrompt,
  compositionPrompt,
  compositionId = 'still_life',
  cameraAngle = 'eye-level shot',
  bgPrompt,
  effectPrompt = '',
  aspectRatio = '1:1',
  withHumanModel = false,
  humanModelPrompt = '',
  isBeautyMode = false,
  attributes = null
}) {
  const category = CATEGORY_CONFIGS[categoryId] || CATEGORY_CONFIGS.default;
  const gender = detectGender(humanModelPrompt);
  const attrDirectives = attributes ? buildAttributeDirectives(attributes, gender) : '';

  // в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
  // COMPOSITION-SPECIFIC DIRECTIVES вЂ” Р¶С‘СЃС‚РєРёРµ Р±Р»РѕРєРё РґР»СЏ РєР°Р¶РґРѕРіРѕ С‚РёРїР° РєР°РґСЂР°
  // в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
  const COMPOSITION_DIRECTIVES = {
    in_hand: `<composition_directive type="IN_HAND">
MANDATORY HAND-HELD PRODUCT SHOT. THIS OVERRIDES ALL OTHER COMPOSITION INSTRUCTIONS.
- A realistic human HAND must be the PRIMARY visual element alongside the product. The hand physically GRIPS and HOLDS the product.
- FRAMING: Close-up shot. Only the hand, wrist, and product are in frame. Do NOT show full body, do NOT show legs, do NOT show a person standing.
- The product MUST be held UP in the hand вЂ” NOT placed on any surface, pedestal, podium, platform, table, or stand.
- NO PODIUMS. NO PEDESTALS. NO MARBLE PLATFORMS. The product is AIRBORNE, held by the human hand.
- Show accurate scale: the product size must be proportional to the human hand.
- Background: soft blurred bokeh (shallow depth of field, f/1.8). The background is abstract and out of focus.
- The hand enters the frame naturally from the bottom or side of the composition.
- Hand must have natural skin texture, visible knuckles, realistic finger positioning, and honest material physics.
- If the product is a pillow, bag, bottle, or any non-wearable item вЂ” the hand HOLDS it up, does NOT wear it, drape it, or place it on the body.
</composition_directive>`,

    macro: `<composition_directive type="MACRO">
MANDATORY: Extreme close-up macro photography.
- Fill 80-90% of the frame with the product вЂ” show intricate surface details, textures, labels, and micro-features.
- Ultra-shallow depth of field (f/2.0 or wider) вЂ” razor-sharp focus on the product surface, everything else melts into creamy bokeh.
- Show material micro-texture: fabric weave, plastic grain, metal brushing, glass refraction.
- Camera distance: extremely close, as if using a dedicated macro lens.
- No full product silhouette вЂ” this is about DETAIL, not overview.
</composition_directive>`,

    flat_lay: `<composition_directive type="FLAT_LAY">
MANDATORY: Strict top-down overhead flat lay composition.
- Camera angle: EXACTLY 90 degrees from above, looking straight down. No perspective distortion.
- The product lies flat on the surface, shot from directly above.
- Geometric alignment: the product is centered with optional styling props arranged symmetrically around it.
- Even, shadowless overhead lighting to minimize depth perception.
- Clean, organized layout typical of high-end Instagram flat lay photography.
</composition_directive>`,

    angled: `<composition_directive type="ANGLED_3/4">
MANDATORY: Dynamic 3/4 angle perspective shot.
- Camera positioned at approximately 30-45 degrees from the product's front face.
- This angle reveals the product's three-dimensional volume вЂ” showing both the front label AND the side profile.
- Elegant volumetric lighting with dramatic depth of field.
- The product appears sculptural and premium from this dynamic viewing angle.
</composition_directive>`,

    still_life: `<composition_directive type="STILL_LIFE">
MANDATORY: Classic front-facing product portrait (РЅР°С‚СЋСЂРјРѕСЂС‚).
- Centered composition, eye-level camera aligned with the product's center of mass.
- The product faces the camera directly вЂ” full label visibility, symmetrical framing.
- Professional studio lighting with clean backdrop.
- Standard e-commerce product hero shot.
</composition_directive>`
  };

  const compositionDirective = COMPOSITION_DIRECTIVES[compositionId] || COMPOSITION_DIRECTIVES.still_life;

  // Р‘Р»РѕРє РјРѕРґРµР»Рё-С‡РµР»РѕРІРµРєР°: РєРѕРіРґР° РїСЂРѕРґР°РІРµС† С…РѕС‡РµС‚ РїРѕРєР°Р·Р°С‚СЊ С‚РѕРІР°СЂ РІРјРµСЃС‚Рµ СЃ Р¶РёРІРѕР№ РјРѕРґРµР»СЊСЋ
  const humanModelBlock = withHumanModel && humanModelPrompt ? `
<human_model_integration>
CRITICAL DUAL-SUBJECT PROTOCOL:
This shot contains TWO subjects: the PRODUCT and a LIVING HUMAN MODEL.

HUMAN MODEL PROFILE: "${humanModelPrompt}"
- Generate a photorealistic living human model matching the profile above.
- The model must naturally interact with the product: holding it, demonstrating it, using it, or presenting it.
- The PRODUCT remains the HERO вЂ” the model is the SUPPORTING ACTOR. The product must be clearly visible, unobstructed, and prominently featured.
- Do NOT let the model's hands, arms, or body obscure the product label, brand, or key visual features.

<ANATOMICAL_INTEGRITY вЂ” ABSOLUTE RULE>
The human model has EXACTLY TWO hands and EXACTLY TWO arms.
ALL visible hands in the image MUST be anatomically connected to the model's body вЂ” attached at the wrist, forearm, and shoulder.
Do NOT generate any disembodied, floating, detached, or extra hands/arms.
NO phantom limbs. NO third hand. Every hand visible in the frame belongs to the single human model.
If the product needs to be held вЂ” the model holds it with ONE or BOTH of her own two hands.
</ANATOMICAL_INTEGRITY>

${attrDirectives ? `<APPLIED_CHARACTERISTICS>
${attrDirectives}
</APPLIED_CHARACTERISTICS>` : ''}

${isBeautyMode ? SKIN_BEAUTY_PROMPT : SKIN_REALISM_PROMPT}

INTERACTION STYLE:
- For cosmetics/skincare: model applies or holds the product near the face/hands, showing glowing skin.
- For electronics/cases: model holds the device naturally, showing the product in real-world context.
- For food/beverages: model enjoys or presents the product, creating appetite appeal.
- For sports gear: model demonstrates athletic use of the product in an active pose.
- For jewelry: extreme close-up of the product ON the model's body (wrist, neck, ear, finger).
- For supplements: model holds the container confidently, health-conscious lifestyle vibe.
- Default: model holds and presents the product at chest level with one hand, making eye contact with camera.
</human_model_integration>
` : '';

  // Р”Р»СЏ В«РўРѕРІР°СЂ РІ СЂСѓРєРµВ» вЂ” РѕС‡РёС‰Р°РµРј С„РѕРЅ РѕС‚ РїРѕРґРёСѓРјРѕРІ/РїР»Р°С‚С„РѕСЂРј, РєРѕС‚РѕСЂС‹Рµ РєРѕРЅС„Р»РёРєС‚СѓСЋС‚ СЃ РєРѕРјРїРѕР·РёС†РёРµР№
  const sanitizedBg = compositionId === 'in_hand'
    ? bgPrompt.replace(/,?\s*(elegant\s+)?marble\s+podium\s+platform/gi, '').replace(/,?\s*pedestal/gi, '').replace(/,?\s*platform/gi, '').replace(/,?\s*podium/gi, '').trim()
    : bgPrompt;

  const integrationText = withHumanModel
    ? 'The human model holds and interacts with the product naturally. The product is supported by the model\'s own hands вЂ” NOT placed on any surface. All hands visible belong to one single human body.'
    : compositionId === 'in_hand'
      ? 'The product is held in a human hand. No surface contact. No ground plane. The hand is the only support.'
      : 'Ground the product naturally onto the surface with accurate contact shadows, ambient occlusion, and bounced environmental light. Do NOT let the product float.';

  return `<system_directive>
ROLE: Elite Commercial Product Photographer, Master CGI Compositor & Material Specialist.
TASK: ${withHumanModel ? '1:1 Product-to-Scene integration with a living human model demonstrating the product.' : '1:1 Product-to-Scene integration with photorealistic rendering.'}
</system_directive>

<product_identity_lock>
CRITICAL PROTOCOL: The input image is the ABSOLUTE TRUTH ("Sacred Blueprint").
- PRESERVE 1:1: Exact physical geometry, silhouette, scale, and physical proportions.
- PRESERVE 1:1: Brand colors, label layout, typography, barcode, and logo placement.
- PRODUCT DESCRIPTION: ${productPrompt}
</product_identity_lock>

${withHumanModel ? `<image_roles>
IMAGE ROLE ASSIGNMENT:
- The FIRST input image(s) are PRODUCT REFERENCE photos ("Sacred Blueprint") вЂ” preserve their appearance 1:1.
- Any SUBSEQUENT input image(s) are HUMAN MODEL APPEARANCE REFERENCE вЂ” use ONLY for the model's face, hair, body type. Do NOT extract hands, limbs, or body parts from these reference images into the scene separately.
</image_roles>` : ''}

<zero_invention_products>
RESTRICTION PROTOCOL: ZERO INVENTION.
- DO NOT hallucinate, morph, or invent new structural elements.
- DO NOT add fake caps, nozzles, lids, ribbons, or dispensing mechanisms.
- DO NOT hallucinate fake text, typos, or AI squiggles on labels.
- ZERO morphing or blending between the product and the environment. The product is a solid, separate physical object.
</zero_invention_products>

${category.materials.trim()}

${category.lighting.trim()}

${compositionDirective}

${humanModelBlock}

<scene_composition>
  - PLACEMENT & STAGING: ${compositionPrompt}
  - ENVIRONMENT & BACKGROUND: ${sanitizedBg}
  - SPECIAL EFFECTS: ${effectPrompt || 'None'}
  - ASPECT RATIO TARGET: ${aspectRatio}
  - CAMERA: ${cameraAngle}. Commercial photography framing.
  - INTEGRATION: ${integrationText}
</scene_composition>

<output_rules>
- The final image must be INDISTINGUISHABLE from a real professional product photograph.
- No watermarks, no text overlays, no separate product shots.
- OUTPUT FORMAT: You MUST output ONLY a generated IMAGE. Do NOT output text. Do NOT describe the image. Generate the photo directly as pixel data.
</output_rules>`;
}


const QUICK_CARD_PROMPT_NATURAL = `You are an elite marketplace creative director, product photographer, conversion designer, Russian e-commerce copywriter, visual merchandising expert, and premium e-commerce art director.

Your task is to transform the provided product image into a premium, high-converting product card for Russian marketplaces, suitable for modern Wildberries and Ozon-style selling logic, but without copying their logos, UI, badges, colors, layout systems, or brand identity.

The final result must look expensive, modern, clean, stylish, trustworthy, and conversion-focused. It should feel like a top-performing 2026 marketplace product card created by a luxury e-commerce studio, with a custom creative direction selected specifically for the product in the image.

IMPORTANT LANGUAGE RULE:
All visible text on the card must be in Russian only.
Use correct Russian Cyrillic typography.
Do not use any English words, Latin letters, random symbols, fake text, lorem ipsum, or unreadable AI-generated typography.
Keep the Russian text short, clear, premium, and commercially strong.

FIRST, SILENTLY SCAN THE INPUT IMAGE:
Before designing the card, carefully analyze what is visible in the frame:

* product type and category;
* material, texture, shape, color, size impression, and visual quality;
* target buyer and likely purchase motivation;
* main emotional trigger: comfort, beauty, status, convenience, safety, durability, giftability, compactness, cleanliness, coziness, performance, care, or premium lifestyle;
* strongest visually supported benefits;
* best presentation angle for this exact product;
* whether the product needs a luxury, beauty, home, fashion, tech, kids, sport, wellness, kitchen, car, pet, office, or gift-style treatment.

Do not invent technical specifications, certifications, medical claims, waterproof claims, organic claims, warranty claims, discounts, ratings, awards, materials, dimensions, volume, capacity, or special features unless they are clearly visible or explicitly provided.

CORE CREATIVE PRINCIPLE:
Do not force one universal style on every product.
The card must feel custom-designed for this exact item.

After analyzing the product, automatically choose the full creative direction:

* overall visual mood;
* background style;
* lighting style;
* typography style;
* composition;
* benefit chip style;
* icon style;
* color palette;
* props or no props;
* visual accents;
* emotional tone;
* marketplace positioning.

Every design choice must support the product's real category, visible qualities, and emotional selling point.

CARD FORMAT:
Create a vertical marketplace product card, 3:4 aspect ratio, optimized for mobile viewing.
The product must be the hero and occupy approximately 60вЂ“72% of the composition.
The design must remain readable as a small marketplace thumbnail.

Use a clean composition with strong hierarchy:

1. Hero product image
2. Main Russian headline
3. 3вЂ“5 short benefit chips
4. Optional tiny supporting caption if useful
5. Subtle visual accents that explain the product without clutter

VISUAL STYLE:
Use a premium 2026 Russian marketplace aesthetic:

* expensive editorial studio lighting;
* soft realistic shadows;
* crisp product edges;
* clean matte or softly textured background;
* elegant off-white, warm grey, beige, graphite, taupe, milk, champagne, soft pastel, or product-matched palette;
* premium spacing;
* refined visual hierarchy;
* calm, confident, expensive composition.

Make the product look more desirable, but preserve its real identity, shape, proportions, color, material, recognizability, and core visual features.

Avoid:

* cheap neon colors;
* messy gradients;
* aggressive red/yellow discount banners;
* visual noise;
* cluttered collage;
* childish clipart unless the product is clearly for children;
* fake marketplace stickers;
* fake sale labels;
* fake reviews;
* fake star ratings;
* copied Ozon or Wildberries logos, badges, UI elements, or brand colors;
* random decorative elements that do not help sell the product.

ADAPTIVE CREATIVE DIRECTION:
Choose the best visual strategy automatically based on the actual product.

If it is a beauty, skincare, wellness, perfume, or self-care product:
use a clean premium cosmetic, lab, spa, or boutique style with soft reflections, cream tones, marble-like surfaces, delicate ingredient-inspired accents only if visually appropriate, and refined elegant typography.

If it is clothing, footwear, jewelry, or accessories:
use a fashion editorial marketplace style with confident spacing, elegant typography, fabric or material detail emphasis, clean background, and premium catalogue mood.

If it is home, kitchen, tableware, storage, textile, or decor:
use a cozy premium interior-inspired setting, warm neutral palette, tasteful lifestyle context, soft shadows, calm editorial typography, and clean practical benefit chips.

If it is electronics, gadgets, tools, auto accessories, or technical goods:
use a sleek modern tech style with precise geometry, controlled contrast, subtle glow or reflections, clean feature callouts, and strong readable typography.

If it is a children's product:
use soft, safe, warm, friendly visuals, pastel accents, rounded shapes, trustworthy calm composition, and gentle readable typography.

If it is a sports, fitness, travel, or outdoor product:
use dynamic but clean energy, performance lighting, strong contours, practical benefit callouts, and no chaotic effects.

If it is a giftable product:
make it feel elegant, desirable, and present-like with premium packaging mood, soft highlights, refined typography, emotional headline, and tasteful empty space.

If it is a simple everyday product:
make it look clean, useful, trustworthy, aesthetic, and worth clicking without exaggerating its status or inventing luxury claims.

TYPOGRAPHY:
Use premium Russian Cyrillic typography selected specifically for the product category and visual mood.

Do not default to heavy bold marketplace fonts.
Do not force one fixed font style across all products.
The font choice must increase perceived value and match the product.

Typography selection logic:

* for home, kitchen, decor, beauty, gifts, fashion, and lifestyle products, prefer refined editorial Cyrillic typography with elegant proportions, premium spacing, and calm hierarchy;
* for electronics, tools, sport, and functional goods, prefer clean modern sans-serif Cyrillic with precise geometry and strong readability;
* for kids and soft family products, prefer warm rounded Cyrillic typography that feels safe, friendly, and calm;
* for luxury or giftable products, use airy boutique-style typography with elegant spacing;
* for everyday items, use clean, trustworthy, tasteful typography that feels modern but not loud.

Typography rules:

* headline must be large, readable, beautiful, and commercially strong;
* benefit chips must be clean, aligned, compact, and readable;
* supporting text must be small but still legible;
* use generous spacing and balanced line height;
* all Russian letters must be sharp, natural, correctly formed, and correctly spelled;
* no distorted Cyrillic;
* no fake letters;
* no random symbols;
* no unreadable AI text;
* no overdecorated fonts;
* no childish fonts unless the product is for children;
* no cheap banner typography;
* no tiny unreadable text.

Use typography as a luxury design element: large elegant headline, airy spacing, calm hierarchy, and small refined benefit labels that do not overpower the product.

RUSSIAN COPYWRITING RULES:
Generate short Russian text that sells through clarity and taste, not through shouting.
The headline must be 2вЂ“6 words.
Each benefit chip must be 1вЂ“4 words.
Total visible text should be minimal and premium.

The copy must instantly explain:

* what the product is;
* why it looks desirable;
* what practical or emotional benefit it gives;
* why the buyer should click.

Use benefit language like:
"Р”Р»СЏ РґРѕРјР°"
"РќР° РєР°Р¶РґС‹Р№ РґРµРЅСЊ"
"РЎС‚РёР»СЊРЅС‹Р№ Р°РєС†РµРЅС‚"
"РџСЂРѕРґСѓРјР°РЅРЅС‹Рµ РґРµС‚Р°Р»Рё"
"РЈРґРѕР±РЅРѕ РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ"
"Р›РµРіРєРѕ СЃРѕС‡РµС‚Р°С‚СЊ"
"РџСЂРµРјРёР°Р»СЊРЅС‹Р№ РІРёРґ"
"РљРѕРјРїР°РєС‚РЅС‹Р№ С„РѕСЂРјР°С‚"
"РњСЏРіРєР°СЏ С„Р°РєС‚СѓСЂР°"
"Р§РёСЃС‚С‹Р№ СЃРёР»СѓСЌС‚"
"РђРєРєСѓСЂР°С‚РЅРѕРµ С…СЂР°РЅРµРЅРёРµ"
"Р”Р»СЏ РїРѕРґР°СЂРєР°"
"Р‘РµР· Р»РёС€РЅРµРіРѕ С€СѓРјР°"
"Р’СЃС‘ РїРѕРґ СЂСѓРєРѕР№"
"РќРµР¶РЅС‹Р№ СѓС…РѕРґ"
"РљРѕРјС„РѕСЂС‚РЅР°СЏ РїРѕСЃР°РґРєР°"
"Р›С‘РіРєРёР№ СѓС…РѕРґ"
"РџСЂРёСЏС‚РЅРѕ РґРµСЂР¶Р°С‚СЊ"
"Р”Р»СЏ РєСѓС…РЅРё"
"Р”Р»СЏ РїРѕРµР·РґРѕРє"
"Р”Р»СЏ РёРЅС‚РµСЂСЊРµСЂР°"
"РЎРјРѕС‚СЂРёС‚СЃСЏ РґРѕСЂРѕРіРѕ"

Adapt the text to the actual product.
Do not use generic text if a more specific safe benefit is visible.

STRICTLY AVOID THESE RUSSIAN WORDS AND CLAIMS UNLESS EXPLICITLY PROVIDED:
"СЃРєРёРґРєР°", "Р°РєС†РёСЏ", "СЂР°СЃРїСЂРѕРґР°Р¶Р°", "С‚РѕР»СЊРєРѕ СЃРµРіРѕРґРЅСЏ", "С„РёРЅР°Р»СЊРЅР°СЏ С†РµРЅР°", "Р»СѓС‡С€Р°СЏ С†РµРЅР°", "РјРµРіР° С†РµРЅР°", "С…РёС‚ РїСЂРѕРґР°Р¶", "С‚РѕРї РїСЂРѕРґР°Р¶", "в„–1", "Р»СѓС‡С€РёР№", "РіР°СЂР°РЅС‚РёСЏ", "РІРµСЂРЅС‘Рј РґРµРЅСЊРіРё", "СЃРµСЂС‚РёС„РёС†РёСЂРѕРІР°РЅРѕ", "Р»РµС‡РёС‚", "100% СЌС„С„РµРєС‚", "РІРѕРґРѕРЅРµРїСЂРѕРЅРёС†Р°РµРјС‹Р№", "РіРёРїРѕР°Р»Р»РµСЂРіРµРЅРЅС‹Р№", "РѕСЂРёРіРёРЅР°Р»", "РїСЂРµРјРёСѓРј РєР°С‡РµСЃС‚РІРѕ", fake ratings, fake reviews, fake marketplace badges.

LAYOUT:
Create a balanced premium composition:

* hero product centered or slightly off-center;
* headline placed in a clean safe zone;
* benefit chips arranged around the product without covering important details;
* use subtle lines, arrows, icons, or callouts only when they genuinely help explain the product;
* preserve enough empty space so the card feels expensive;
* make the product visually pop from the background;
* keep all text away from edges and marketplace crop zones;
* make the card readable as a small mobile thumbnail;
* avoid clutter and over-explaining.

Benefit chips:

* use 3вЂ“5 chips only;
* keep them short;
* make them visually consistent;
* use refined icons only if they match the product and improve clarity;
* do not use cartoonish icons unless appropriate for the product;
* do not cover the product.

BACKGROUND AND PROPS:
Choose background and props based on the product.
Use subtle lifestyle context only if it improves desirability and does not confuse the buyer.

Allowed:

* soft fabric;
* stone or matte surface;
* warm interior shadows;
* minimal pedestal;
* clean studio background;
* soft reflections;
* subtle natural elements;
* product-matched accents.

Avoid:

* extra objects that look like additional products included in the purchase;
* cluttered props;
* distracting textures;
* overly complex backgrounds;
* fake packaging unless packaging is visible in the input image.

CONVERSION PSYCHOLOGY:
The card must instantly answer:
"What is it?"
"Why does it look desirable?"
"What is the main benefit?"
"Why should I click?"

Make the buyer feel:

* trust;
* clarity;
* premium quality;
* aesthetic pleasure;
* practical value;
* desire to open the product card.

QUALITY:
Ultra-sharp, photorealistic, premium e-commerce advertising quality.
Professional studio retouching.
Clean shadows.
Natural proportions.
Realistic material rendering.
Crisp edges.
Readable text.
Balanced contrast.
No plastic-looking overprocessing.
No low-resolution artifacts.
No messy cutouts.
No duplicated product parts.
No deformed product shape.
No incorrect reflections.
No extra objects that confuse the product.
No unreadable or misspelled Russian text.

FINAL OUTPUT:
One finished premium Russian marketplace product card.
No explanations.
No mockup frame.
No website interface.
No marketplace logo.
Only the polished product card image.`;

const QUICK_CARD_PROMPT_EPIC = `You are a world-class marketplace art director, cinematic advertising designer, conversion-focused e-commerce strategist, Russian copywriter, and AI visual director.

Your task is to transform the provided product image into an extremely eye-catching, high-impact, scroll-stopping marketplace product card for Russian marketplaces such as Wildberries and Ozon.

The result must look like a powerful premium product poster, not a boring catalog photo.
It must instantly dominate the marketplace feed, create a "wow" effect, and make the buyer stop scrolling.

The style must be bold, dramatic, cinematic, slightly grotesque, highly commercial, and visually magnetic вЂ” but still tasteful, clean, readable, and trustworthy.

IMPORTANT LANGUAGE RULE:
All visible text on the card must be in Russian only.
Use only Russian Cyrillic text.
No English words.
No Latin letters.
No lorem ipsum.
No unreadable fake AI text.
No random symbols.
All Russian words must be spelled correctly and look professionally typeset.

CORE CREATIVE IDEA:
Make the product look like the main hero of a blockbuster advertising poster.
The product must feel powerful, desirable, energetic, expensive, and impossible to ignore.

Think:
- marketplace bestseller energy;
- cinematic poster composition;
- luxury commercial lighting;
- dramatic contrast;
- exaggerated but controlled visual emotion;
- product as a hero object;
- strong visual metaphor based on the product category;
- instant thumbnail readability;
- maximum click desire.

FIRST, SILENTLY SCAN THE INPUT IMAGE:
Before designing, analyze the product:
- What exact product is shown?
- What category does it belong to?
- What is its strongest visual identity?
- What emotion should it trigger?
- What would make this product impossible to ignore in a marketplace feed?
- What metaphor can amplify it visually?
- What is the most dramatic but still relevant way to present it?
- What type of buyer would click it immediately?
- What benefits are visually safe to communicate?
- What should not be invented?

Do not invent technical specifications, medical effects, certifications, waterproof claims, organic claims, awards, reviews, ratings, discounts, or guarantees unless they are clearly provided by the user or visible on the product.

VISUAL DIRECTION:
Create a vertical 3:4 marketplace product card optimized for mobile feed.
The product must be large, central, sharp, and dominant.
The product should occupy approximately 60вЂ“75% of the composition.
The design must be readable even as a small thumbnail.

Use a dramatic cinematic background that matches the product's nature.

Possible visual metaphors:
- fire and ice;
- light and shadow;
- explosion of texture;
- luxury spotlight;
- electric energy;
- flowing water;
- golden glow;
- cosmic depth;
- smoke and vapor;
- shattered particles;
- magnetic aura;
- premium stage lighting;
- speed trails;
- liquid splash;
- fabric wave;
- marble, metal, glass, stone, silk, velvet, neon glow, or atmospheric mist if relevant.

The metaphor must support the product, not distract from it.

The card must feel more powerful than a normal marketplace design.
It should feel like the product has its own universe.

STYLE INTENSITY:
Use controlled maximalism.
Make it bright, dramatic, and memorable, but not messy.

The visual should be:
- bold;
- high contrast;
- cinematic;
- premium;
- emotional;
- sharp;
- glossy where appropriate;
- energetic;
- expensive-looking;
- modern;
- theatrical;
- feed-stopping.

Avoid:
- cheap discount design;
- messy collage;
- random stickers;
- chaotic text;
- low-quality effects;
- overfilled composition;
- childish clipart;
- fake marketplace UI;
- copied Ozon or Wildberries elements;
- amateur Photoshop look.

COMPOSITION:
Use a strong heroic layout:
1. Product in the center as the main hero.
2. Explosive or energetic background behind the product.
3. Main headline near the top or bottom in a strong readable zone.
4. 3вЂ“4 short benefit chips around the product.
5. Optional price block only if price is provided.
6. Optional badge only if it does not make false claims.

Create depth:
- foreground particles or light streaks;
- midground product;
- background energy field;
- realistic shadows and reflections;
- clean separation between product and background.

The product must never be hidden by effects.
Effects may wrap around the product, frame it, or explode behind it, but must not damage readability.

MARKETPLACE THUMBNAIL LOGIC:
The card must work in the first 0.5 seconds.
At thumbnail size, the buyer must instantly understand:
- what the product is;
- why it looks exciting;
- why it feels more desirable than competitors;
- what the main emotional promise is.

Use big shapes, strong contrast, and simple hierarchy.
Do not place important text too close to the edges.
Do not use tiny text.
Do not use more than 5 text blocks.

RUSSIAN COPYWRITING:
Write short, powerful Russian text.
The copy must sound commercial, sharp, and premium.

Main headline:
- 2вЂ“5 words;
- strong and memorable;
- adapted to the product;
- emotional but not fake.

Examples of headline style:
"РЎРёР»Р° РІ РґРµС‚Р°Р»СЏС…"
"РњР°РєСЃРёРјСѓРј СЌС„С„РµРєС‚Р°"
"РЎРѕР·РґР°РЅРѕ РІС‹РґРµР»СЏС‚СЊСЃСЏ"
"Р’ С†РµРЅС‚СЂРµ РІРЅРёРјР°РЅРёСЏ"
"РњРѕС‰РЅС‹Р№ Р°РєС†РµРЅС‚"
"РЇСЂРєРёР№ С…Р°СЂР°РєС‚РµСЂ"
"РЎС‚РёР»СЊ Р±РµР· РєРѕРјРїСЂРѕРјРёСЃСЃРѕРІ"
"Р­С„С„РµРєС‚ СЃ РїРµСЂРІРѕРіРѕ РІР·РіР»СЏРґР°"
"Р—Р°РјРµС‚РЅРѕ СЃСЂР°Р·Сѓ"
"Р’С‹РіР»СЏРґРёС‚ РґРѕСЂРѕРіРѕ"
"Р”Р»СЏ СЃРёР»СЊРЅРѕРіРѕ РѕР±СЂР°Р·Р°"
"РўРІРѕР№ РіР»Р°РІРЅС‹Р№ Р°РєС†РµРЅС‚"
"РљРѕРіРґР° РЅСѓР¶РµРЅ СЌС„С„РµРєС‚"
"РџСЂРёС‚СЏРіРёРІР°РµС‚ РІР·РіР»СЏРґ"
"РЎСЂР°Р·Сѓ РІ С„РѕРєСѓСЃРµ"

Benefit chips:
Use 3вЂ“4 short Russian benefit chips, each 1вЂ“3 words.
They must be visually supported by the product or safe and general.

Examples:
"РЇСЂРєРёР№ РґРёР·Р°Р№РЅ"
"РџСЂРµРјРёР°Р»СЊРЅС‹Р№ РІРёРґ"
"РЎРёР»СЊРЅС‹Р№ Р°РєС†РµРЅС‚"
"РќР° РєР°Р¶РґС‹Р№ РґРµРЅСЊ"
"Р”Р»СЏ РїРѕРґР°СЂРєР°"
"РЈРґРѕР±РЅС‹Р№ С„РѕСЂРјР°С‚"
"РџСЂРёСЏС‚РЅРѕ РґРµСЂР¶Р°С‚СЊ"
"Р›РµРіРєРѕ РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ"
"РЎС‚РёР»СЊРЅРѕ СЃРјРѕС‚СЂРёС‚СЃСЏ"
"Р’С‹РґРµР»СЏРµС‚ РѕР±СЂР°Р·"
"Р§РёСЃС‚С‹Р№ СЃРёР»СѓСЌС‚"
"Р“Р»СѓР±РѕРєРёР№ С†РІРµС‚"
"Р­С„С„РµРєС‚РЅР°СЏ РїРѕРґР°С‡Р°"
"РЎРјРѕС‚СЂРёС‚СЃСЏ РґРѕСЂРѕРіРѕ"
"Р”Р»СЏ РґРѕРјР°"
"Р”Р»СЏ РїРѕРµР·РґРѕРє"
"Р”Р»СЏ СѓС…РѕРґР°"
"Р”Р»СЏ РЅР°СЃС‚СЂРѕРµРЅРёСЏ"

If the product category is clear, generate more specific Russian text.
If the product is perfume, use words like:
"Р“Р»СѓР±РѕРєРёР№ Р°СЂРѕРјР°С‚"
"РЎС‚РѕР№РєРёР№ С€Р»РµР№С„" only if provided or clearly allowed
"РњСѓР¶СЃРєРѕР№ С…Р°СЂР°РєС‚РµСЂ"
"РЎРёР»Р° СЃС‚РёС…РёР№"
"Р’ С†РµРЅС‚СЂРµ РІРЅРёРјР°РЅРёСЏ"
"Р­С„С„РµРєС‚РЅС‹Р№ С„Р»Р°РєРѕРЅ"
"Р”Р»СЏ РІРµС‡РµСЂР°"
"Р”Р»СЏ РїРѕРґР°СЂРєР°"

If the product is cosmetics:
"РќРµР¶РЅС‹Р№ СѓС…РѕРґ"
"РЎРёСЏСЋС‰РёР№ РІРёРґ"
"РљР°Р¶РґС‹Р№ РґРµРЅСЊ"
"Р§РёСЃС‚Р°СЏ РєРѕР¶Р°" only if safe
"РљСЂР°СЃРёРІС‹Р№ СЂРёС‚СѓР°Р»"

If the product is electronics:
"Р‘С‹СЃС‚СЂС‹Р№ РґРѕСЃС‚СѓРї"
"Р§С‘С‚РєРёР№ Р·РІСѓРє"
"РњРѕС‰РЅС‹Р№ Р·Р°СЂСЏРґ"
"РЈРјРЅС‹Р№ С„РѕСЂРјР°С‚"
"Р’СЃРµРіРґР° СЂСЏРґРѕРј"

If the product is clothing:
"РЎРёР»СЊРЅС‹Р№ РѕР±СЂР°Р·"
"РљРѕРјС„РѕСЂС‚РЅР°СЏ РїРѕСЃР°РґРєР°"
"Р›РµРіРєРѕ СЃРѕС‡РµС‚Р°С‚СЊ"
"РќР° РєР°Р¶РґС‹Р№ РґРµРЅСЊ"
"РЎС‚РёР»СЊРЅС‹Р№ СЃРёР»СѓСЌС‚"

If the product is home decor:
"РЈСЋС‚РЅС‹Р№ Р°РєС†РµРЅС‚"
"Р”Р»СЏ РёРЅС‚РµСЂСЊРµСЂР°"
"РЎРјРѕС‚СЂРёС‚СЃСЏ РґРѕСЂРѕРіРѕ"
"РўС‘РїР»Р°СЏ Р°С‚РјРѕСЃС„РµСЂР°"
"РљСЂР°СЃРёРІС‹Р№ РґРѕРј"

BADGE RULE:
You may create one small dramatic badge only if it is safe and not misleading.

Safe badge examples:
"РЇСЂРєРёР№ РІС‹Р±РѕСЂ"
"Р’Р°Сѓ-СЌС„С„РµРєС‚"
"Р”Р»СЏ РїРѕРґР°СЂРєР°"
"РќРѕРІС‹Р№ Р°РєС†РµРЅС‚"
"РЎС‚РёР»СЊРЅС‹Р№ С„РѕСЂРјР°С‚"
"Р’ С†РµРЅС‚СЂРµ РІРЅРёРјР°РЅРёСЏ"

Avoid fake badges unless provided:
"РҐРёС‚ РїСЂРѕРґР°Р¶"
"РўРѕРї РїСЂРѕРґР°Р¶"
"в„–1"
"Р›СѓС‡С€РёР№ С‚РѕРІР°СЂ"
"Р’С‹Р±РѕСЂ РїРѕРєСѓРїР°С‚РµР»РµР№"
"Р“Р°СЂР°РЅС‚РёСЏ"
"РћСЂРёРіРёРЅР°Р»"
"РЎРєРёРґРєР°"
"РђРєС†РёСЏ"
"Р Р°СЃРїСЂРѕРґР°Р¶Р°"

If the user explicitly asks for an aggressive bestseller-like design, visually create the feeling of a bestseller, but do not use false claims unless they are provided.

TEXT HIERARCHY:
Use:
- one large bold headline;
- one smaller descriptive line if necessary;
- 3вЂ“4 benefit chips;
- optional price block if price is provided.

The text must be readable, bold, and clean.
Use modern Russian sans-serif typography.
Use thick, confident, marketplace-friendly lettering.
Use dramatic contrast between text and background.
Avoid thin elegant fonts if the background is intense.
Avoid distorted letters.
Avoid too much text.

COLOR STRATEGY:
Automatically choose the strongest color world based on the product.

For black, gold, perfume, men's products:
use black, gold, amber, fire, electric blue, smoke, glass, reflections, luxury contrast.

For white, skincare, beauty:
use pearl, cream, champagne, soft glow, liquid splash, clean luxury, gentle radiance.

For red, sport, energy products:
use red, graphite, sparks, motion blur, speed, heat, power.

For blue, tech, freshness:
use deep blue, cyan, chrome, water, electricity, cool light.

For home and cozy products:
use warm beige, caramel, soft shadows, cozy glow, premium interior mood.

For children's products:
use bright but soft colors, playful depth, rounded shapes, safe friendly energy.

Do not use more than 3 dominant colors.
The product color must guide the palette.

LIGHTING:
Use expensive cinematic lighting:
- rim light around the product;
- glossy highlights where appropriate;
- dramatic backlight;
- controlled glow;
- realistic shadow under the product;
- premium reflections;
- strong separation from background.

The product must look sharp, desirable, and more premium than in the original photo.

GROTESQUE BUT PREMIUM:
The word "grotesque" means:
- exaggerated scale;
- stronger emotion;
- dramatic metaphor;
- poster-like power;
- surreal but relevant background;
- bold contrast;
- memorable visual hook.

It does NOT mean:
- ugly;
- chaotic;
- cheap;
- dirty;
- distorted;
- childish;
- visually overloaded.

Make it spectacular, not ridiculous.

CATEGORY-BASED DRAMA:
Choose one dramatic direction automatically:

1. Elemental Power:
Use fire, ice, water, smoke, wind, stone, lightning, or energy to symbolize the product's character.

2. Luxury Dominance:
Use black-gold lighting, glass reflections, premium shadows, dark studio atmosphere, and elegant intensity.

3. Hyper-Real Texture Explosion:
Use enlarged textures, particles, splashes, fibers, droplets, powder, fabric, steam, or material fragments around the product.

4. Hero Spotlight:
Use a dark stage, spotlight cone, glowing aura, cinematic shadows, and strong central focus.

5. Lifestyle Shock:
Place the product in an aspirational but clean mini-scene where it feels like the key object of desire.

Choose only one main direction.
Do not mix too many concepts.

PRODUCT INTEGRITY:
Preserve the real product:
- same shape;
- same proportions;
- same color;
- same label or packaging identity if visible;
- no deformation;
- no wrong material;
- no fake extra parts;
- no duplicated objects unless a deliberate clean product arrangement is requested.

Enhance lighting and presentation, but do not change what the product is.

PRICE BLOCK:
If a price is provided, display it large and clear in Russian marketplace style.
Use "в‚Ѕ" symbol.
Example:
"4 990 в‚Ѕ"

If no price is provided, do not invent a price.

Do not add fake discounts or crossed-out prices unless explicitly provided.

FOR PERFUME PRODUCTS:
If the product is perfume, make it feel sensual, powerful, expensive, and atmospheric.
Use:
- dark luxury background;
- glass reflections;
- smoke or mist;
- fire/ice/water/light metaphor;
- dramatic highlights on the bottle;
- premium masculine or feminine mood depending on packaging;
- short Russian phrases.

Possible Russian text:
"РЎРёР»Р° С…Р°СЂР°РєС‚РµСЂР°"
"Р“Р»СѓР±РѕРєРёР№ Р°СЂРѕРјР°С‚"
"Р­С„С„РµРєС‚РЅС‹Р№ С„Р»Р°РєРѕРЅ"
"Р”Р»СЏ РІРµС‡РµСЂР°"
"Р’ С†РµРЅС‚СЂРµ РІРЅРёРјР°РЅРёСЏ"
"РњРѕС‰РЅС‹Р№ С€Р»РµР№С„" only if provided or allowed
"Р”Р»СЏ РїРѕРґР°СЂРєР°"
"РЎС‚РёР»СЊРЅС‹Р№ Р°РєС†РµРЅС‚"

FOR THE EXAMPLE STYLE:
If the product resembles a perfume bottle with dark packaging and gold details, create a more powerful version of a fire-and-ice cinematic card:
- black glossy background;
- bottle in the center;
- golden fire on one side;
- icy blue water or lightning on the other side;
- dramatic splash around the bottle;
- luxury reflections;
- headline in Russian;
- 3 short benefit chips;
- optional price if given;
- no fake marketplace UI.

MAKE IT FEEL LIKE:
A product that people would screenshot.
A product that looks more expensive than competitors.
A product that dominates the feed.
A product that has cinematic energy.
A product that feels like a bestseller without relying on fake claims.

STRICT NEGATIVE RULES:
No English text.
No Latin letters.
No fake Ozon or Wildberries interface.
No Ozon logo.
No Wildberries logo.
No fake ratings.
No fake reviews.
No fake discount stickers.
No fake "top seller" or "number one" claims.
No unreadable text.
No misspelled Russian.
No clutter.
No cheap neon banners.
No random icons.
No visual trash.
No overfilled design.
No low-resolution artifacts.
No blurry product.
No distorted product.
No deformed packaging.
No fake certification.
No watermark.
No QR codes.
No barcode.
No excessive small text.

FINAL OUTPUT:
Create one finished vertical high-impact Russian marketplace product card.
It must be cinematic, dramatic, bold, premium, grotesque in scale and emotion, and extremely scroll-stopping.
No explanations.
No mockup frame.
No website interface.
Only the final polished product card image.`;

// в•ђв•ђв•ђ UGC PROMPT вЂ” СЂРµР°Р»РёСЃС‚РёС‡РЅС‹Рµ С„РѕС‚Рѕ В«РѕС‚ РїРѕРєСѓРїР°С‚РµР»РµР№В» РґР»СЏ РѕС‚Р·С‹РІРѕРІ в•ђв•ђв•ђ
const QUICK_UGC_PROMPT = `You are an expert at creating hyper-realistic smartphone photographs that look exactly like real customer review photos on Russian marketplaces (Wildberries, Ozon, AliExpress).

Your task: Take the provided product image, carefully analyze what the product is, and create a NEW photograph that looks like it was taken by a real customer on their smartphone after receiving the product.

CRITICAL PRODUCT ANALYSIS:
First, carefully identify:
- What is this product? (category, type, purpose)
- How would a real person use it?
- Where would they naturally photograph it?
- What would be visible around it in a real home?

PHOTO REALISM REQUIREMENTS:
The photo MUST look like it was shot on a smartphone (iPhone 13-15 quality):
- Slight depth of field (smartphone bokeh, not professional)
- Natural ambient lighting from a window or ceiling lamp (warm 3500-4500K)
- Mild digital noise (ISO 400-800 equivalent)
- Slightly imperfect composition вЂ” product NOT perfectly centered, camera at a slight casual angle (2-5 degrees tilt)
- Natural white balance with slight warmth
- No studio softboxes, no professional lighting setups
- Resolution and sharpness consistent with smartphone camera

SCENE SELECTION (choose the MOST natural one for this specific product):
Pick ONE scene that makes the most sense for this product type:

1. ON A TABLE: Kitchen table, desk, or coffee table. Visible: a coffee mug, phone, or magazine nearby. Natural clutter.
2. IN HANDS: Only hands visible (no face), holding or demonstrating the product. Hands look real, natural skin, casual grip.
3. ON A SOFA/BED: Product lying on a couch cushion or bed with a wrinkled blanket/throw. Cozy domestic feeling.
4. ON THE FLOOR: Flat lay on wooden parquet or laminate. Maybe a rug edge visible. Shot from above.
5. ON A WINDOWSILL: Product on a windowsill with natural daylight coming through. Maybe a plant pot nearby.
6. UNBOXING: Product partially out of a brown delivery box or plastic packaging. The excitement of receiving a package.
7. IN USE: If it's clothing вЂ” worn casually (mirror selfie vibe). If it's kitchenware вЂ” on a kitchen counter. If it's electronics вЂ” plugged in, being used.
8. COMPARISON: Product next to a familiar object (hand, pen, phone) to show real scale.

ANTI-DETECTION RULES (critical for believability):
- NEVER use white cyclorama or solid color backgrounds
- NEVER use professional studio lighting
- NEVER make the photo look too polished or retouched
- NEVER add text, watermarks, or any overlay
- NEVER show the product floating or in an unnatural position
- The background MUST be a real, lived-in domestic environment
- Include small realistic details: visible furniture edges, carpet textures, a cable, a crumb, a pet toy вЂ” micro-imperfections that make it believable
- Shadows must be natural and soft (from ambient light, not directional strobes)

PRODUCT INTEGRITY:
- The product itself must be recognizable and clearly the same item from the input photo
- Preserve exact colors, shape, proportions, and details of the product
- The product should look good but not unrealistically perfect
- Show the product from a slightly different angle than the original (3/4 view or casual angle)

MOOD:
- Casual, authentic, "I just got this and wanted to show you" energy
- The photo should feel like someone took it in 5 seconds, not staged for 30 minutes
- It should be the kind of photo a real buyer would attach to a 4-5 star review

FINAL OUTPUT:
One realistic smartphone photograph of the product in a natural domestic setting.
No text. No watermarks. No studio look. No explanations.
Just the photograph.`;

// в•ђв•ђв•ђ MODEL PHOTO PROMPT вЂ” РєСЂР°СЃРёРІРѕРµ С„РѕС‚Рѕ С‚РѕРІР°СЂР° СЃ РјРѕРґРµР»СЊСЋ (Р±РµР· РёРЅС„РѕРіСЂР°С„РёРєРё) в•ђв•ђв•ђ
const MODEL_PHOTO_PROMPT = `You are an elite product photographer and creative director.

Your task: Create a stunning, high-quality PHOTOGRAPH of a HUMAN MODEL naturally interacting with the product shown in the reference image(s).

STEP 1 вЂ” PRODUCT ANALYSIS:
Analyze the product image(s). Determine:
- What category? (clothing, electronics, cosmetics, furniture, food, sport, bags, jewelry, etc.)
- How should a person naturally wear, hold, use, or demonstrate this product?

STEP 2 вЂ” MODEL SELECTION:
Auto-select the perfect model for this product:
- Gender matching the product's target audience
- Age 22-35, attractive but natural
- Warm, confident expression
- Clothing that complements (not overshadows) the product

STEP 3 вЂ” SCENE & PHOTOGRAPHY:
- Choose the ideal setting: studio, lifestyle indoor, outdoor вЂ” whatever best showcases this product with a person
- Professional commercial photography lighting
- The PRODUCT must be clearly visible and be the hero
- Model complements the product naturally
- Composition: vertical 3:4, clean and balanced
- High-end fashion/commercial photography quality

STRICT RULES:
- NO text, NO typography, NO infographic elements, NO badges, NO benefit chips
- NO marketplace card layout вЂ” this is a PHOTO, not a card
- NO distorted product вЂ” preserve exact shape, color, details
- NO uncanny valley вЂ” model must look natural and photorealistic
- Product should be recognizable as the exact item from the reference

OUTPUT: One finished vertical product photo with a human model. No explanations. No text overlays.`;

// в•ђв•ђв•ђ MODEL CARD PROMPTS вЂ” РєР°СЂС‚РѕС‡РєРё РјР°СЂРєРµС‚РїР»РµР№СЃР° СЃ С‡РµР»РѕРІРµРєРѕРј-РјРѕРґРµР»СЊСЋ в•ђв•ђв•ђ
const MODEL_CARD_PROMPT_NATURAL = `You are an elite marketplace creative director, product photographer, and Russian copywriter.

Your task: Create a premium, clean, minimalist marketplace product card for Russian marketplaces (Wildberries, Ozon) that features a HUMAN MODEL holding, wearing, demonstrating, or using the product.

CRITICAL: HUMAN MODEL INTEGRATION
First, analyze what the product is, then determine HOW a human should interact with it:
- Clothing/accessories в†’ model WEARING the item, natural standing or walking pose
- Furniture в†’ model SITTING on/LEANING against the product, casual lifestyle pose
- Kitchen/home items в†’ model USING the item in a kitchen/home setting
- Electronics в†’ model HOLDING the device, demonstrating the product in use
- Beauty/cosmetics в†’ model APPLYING or holding the product near face
- Fitness/sport в†’ model in active or athletic pose with the product
- Other в†’ model holding/presenting the product naturally

MODEL REQUIREMENTS:
- Attractive but natural-looking person (no uncanny valley)
- Age 25-35, well-groomed, clean appearance
- Natural expression вЂ” slight smile or neutral
- Professional but approachable look
- Clothing should complement the product (neutral tones for most products)
- Model should NOT overpower the product вЂ” product is the hero

DESIGN STYLE (NATURAL/MINIMAL):
- Clean, minimal background (solid color, soft gradient, or simple texture)
- The background color should complement the product
- Soft, even studio lighting, no harsh shadows
- Elegant, balanced composition
- Product is clearly visible and well-lit
- Modern sans-serif Russian typography
- 1 headline in Russian (product name or key benefit)
- 1 subheadline (short descriptive line)
- 3вЂ“4 benefit chips with icons at the bottom
- Clean, readable, no clutter

RUSSIAN TEXT RULES:
- ALL text MUST be in Russian (Cyrillic)
- NO English text, NO Latin letters anywhere
- Use proper Russian grammar and spelling
- Text must be factual and based on the product

STRICT NEGATIVE RULES:
No English. No fake marketplace UI. No logos. No fake reviews. No fake ratings.
No QR codes. No watermarks. No distorted product. No blurry model.

FINAL OUTPUT:
One finished vertical premium marketplace card with a human model and the product.
No explanations. No mockup frame. Only the card.`;

const MODEL_CARD_PROMPT_EPIC = `You are a world-class marketplace art director, cinematic advertising designer, and Russian copywriter.

Your task: Create an EPIC, cinematic, scroll-stopping marketplace product card for Russian marketplaces (Wildberries, Ozon) that features a HUMAN MODEL dramatically interacting with the product.

CRITICAL: HUMAN MODEL + DRAMATIC INTERACTION
First, analyze what the product is, then create a DRAMATIC scene:
- Clothing/accessories в†’ model in a powerful pose, wind in hair, dramatic lighting, fashion editorial vibe
- Furniture в†’ model in cinematic luxury interior, dramatic shadows, lifestyle aspiration
- Kitchen/home items в†’ model in a styled, atmospheric kitchen scene with dramatic light
- Electronics в†’ model in a futuristic or tech-noir setting, dramatic reflections
- Beauty/cosmetics в†’ model in close-up beauty shot, dramatic lighting, editorial quality
- Fitness/sport в†’ model in powerful athletic pose, energy, motion blur, epic atmosphere
- Other в†’ model in a dramatic, cinematic scene that elevates the product

MODEL REQUIREMENTS:
- Strikingly attractive person with presence
- Confident, powerful expression
- Dramatic pose that creates energy
- Professional styling that matches the productвЂ™s mood
- Model and product should feel like one cinematic moment

DESIGN STYLE (EPIC/CINEMATIC):
- Dramatic, cinematic atmosphere (fire, smoke, neon, lightning, golden light, deep shadows)
- Bold, vibrant color world (deep blacks, electric blues, golden ambers, rich contrasts)
- Dramatic lighting вЂ” rim lights, volumetric rays, lens flares
- Powerful composition with strong leading lines
- Product is clearly visible and featured prominently
- Bold, impactful Russian typography
- 1 dramatic headline in Russian
- 1 subtitle or tagline
- 3вЂ“4 benefit chips
- SCROLL-STOPPING visual impact

RUSSIAN TEXT RULES:
- ALL text MUST be in Russian (Cyrillic)
- NO English text, NO Latin letters
- Bold, confident, marketplace-friendly lettering
- Dramatic contrast between text and background

STRICT NEGATIVE RULES:
No English. No fake UI. No logos. No fake reviews. No fake ratings.
No QR codes. No watermarks. No distorted product. No blurry model.
No cheap neon banners. No visual trash.

FINAL OUTPUT:
One cinematic, high-impact, vertical Russian marketplace card with a human model.
It must feel like a movie poster meets a premium product ad.
No explanations. No mockup frame. Only the epic card.`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const startTime = Date.now();

  // в•ђв•ђв•ђ AUTH: JWT + Firebase Token Verification в•ђв•ђв•ђ
  // РЎРЅР°С‡Р°Р»Р° РїСЂРѕР±СѓРµРј JWT (РЅРѕРІР°СЏ СЃРёСЃС‚РµРјР°), РїРѕС‚РѕРј Firebase (legacy)
  let verifiedUid = null;
  let decodedAuth = null;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.split('Bearer ')[1];
    try {
      decodedAuth = jwt.verify(token, JWT_SECRET);
      verifiedUid = decodedAuth.uid;
      if (!verifiedUid) {
        return res.status(401).json({ success: false, error: 'Unauthorized: token has no uid' });
      }
    } catch (authErr) {
      console.warn('[Auth] Invalid JWT token:', authErr.message);
      return res.status(401).json({ success: false, error: 'Unauthorized: invalid token' });
    }
  } else {
    return res.status(401).json({ success: false, error: 'Unauthorized: no token provided' });
  }

  try {
    if (req.body?.action === 'deduct-credit') {
      return res.status(410).json({ success: false, error: 'deduct-credit deprecated: generation requests reserve credits automatically.' });
    }

    // в•ђв•ђв•ђ REFUND CREDITS (РґР»СЏ РІРѕР·РІСЂР°С‚Р° РєСЂРµРґРёС‚РѕРІ РїСЂРё РЅРµСѓРґР°С‡РЅС‹С… РіРµРЅРµСЂР°С†РёСЏС…) в•ђв•ђв•ђ
    if (req.body?.action === 'refund-credit') {
      return res.status(410).json({ success: false, error: 'refund-credit deprecated: failed generation requests are refunded automatically.' });
    }

    let creditReservation = null;
    const creditCost = getGenerationCreditCost(req.body);
    const idempotencyKey = normalizeIdempotencyKey(req.body?.idempotencyKey);
    const idempotencyCacheKey = creditCost > 0 && idempotencyKey ? `${verifiedUid}:${idempotencyKey}` : null;
    let idempotencyEntry = null;

    if (idempotencyCacheKey) {
      pruneIdempotencyCache();
      const existingEntry = idempotencyCache.get(idempotencyCacheKey);
      if (existingEntry) {
        console.log(`[Idempotency] Reusing response for user=${verifiedUid} key=${idempotencyKey}`);
        const cached = await existingEntry.promise;
        return res.status(cached.statusCode).json(cached.body);
      }
      idempotencyEntry = createIdempotencyEntry(idempotencyCacheKey);
    }

    if (creditCost > 0) {
      installGenerationFinalizer({
        req,
        res,
        getReservation: () => creditReservation,
        idempotencyEntry,
      });

      creditReservation = await reserveGenerationCredits({
        uid: verifiedUid,
        email: decodedAuth?.email || null,
        dbUserId: decodedAuth?.dbUserId || null,
      }, creditCost, idempotencyKey || `req_${startTime}`);
    }

    // в•ђв•ђв•ђ DETECT ALL ELEMENTS (Gemini Vision вЂ” bounding boxes) в•ђв•ђв•ђ
    if (req.body?.action === 'detect-elements') {
      const { imageBase64 } = req.body;
      if (!imageBase64) return res.status(400).json({ success: false, error: 'imageBase64 required' });

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(200).json({ success: true, elements: [] });
      }

      try {
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey });
        const { mimeType: mt, base64str: b64 } = extractBase64(imageBase64);

        const resp = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { mimeType: mt, data: b64 } },
              { text: `РўС‹ РІРёРґРёС€СЊ РєР°СЂС‚РѕС‡РєСѓ С‚РѕРІР°СЂР° РјР°СЂРєРµС‚РїР»РµР№СЃР°. РќР°Р№РґРё Р’РЎР• РІРёР·СѓР°Р»СЊРЅС‹Рµ СЌР»РµРјРµРЅС‚С‹ РЅР° РєР°СЂС‚РёРЅРєРµ.

Р”Р»СЏ РєР°Р¶РґРѕРіРѕ СЌР»РµРјРµРЅС‚Р° РѕРїСЂРµРґРµР»Рё:
- name: РєРѕСЂРѕС‚РєРѕРµ РЅР°Р·РІР°РЅРёРµ РЅР° СЂСѓСЃСЃРєРѕРј (2-4 СЃР»РѕРІР°) 
- bbox: РєРѕРѕСЂРґРёРЅР°С‚С‹ РїСЂСЏРјРѕСѓРіРѕР»СЊРЅРёРєР° [x%, y%, width%, height%] РѕС‚ СЂР°Р·РјРµСЂРѕРІ РєР°СЂС‚РёРЅРєРё (0-100)

РўРёРїС‹ СЌР»РµРјРµРЅС‚РѕРІ РєРѕС‚РѕСЂС‹Рµ РЅСѓР¶РЅРѕ РёСЃРєР°С‚СЊ:
- Р—Р°РіРѕР»РѕРІРѕРє (С‚РµРєСЃС‚)
- РџРѕРґР·Р°РіРѕР»РѕРІРѕРє (С‚РµРєСЃС‚)
- Р‘РµР№РґР¶/РїРёР»Р» (РєРЅРѕРїРєР° СЃ С…Р°СЂР°РєС‚РµСЂРёСЃС‚РёРєРѕР№)
- Р¤РѕС‚Рѕ С‚РѕРІР°СЂР°
- Р”РµРєРѕСЂР°С‚РёРІРЅС‹Рµ СЌР»РµРјРµРЅС‚С‹ (С‡РµРјРѕРґР°РЅ, РїР»РµРґ Рё С‚.Рї.)
- Р¤РѕРЅ
- Р¦РµРЅР° (РµСЃР»Рё РµСЃС‚СЊ)
- РРєРѕРЅРєРё

Р’РµСЂРЅРё РўРћР›Р¬РљРћ JSON РјР°СЃСЃРёРІ Р±РµР· РїРѕСЏСЃРЅРµРЅРёР№:
[{"name":"...","bbox":[x,y,w,h]},...]
РћС‚РІРµС‚ РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ С‚РѕР»СЊРєРѕ JSON, РЅРёРєР°РєРѕРіРѕ РґСЂСѓРіРѕРіРѕ С‚РµРєСЃС‚Р°.` }
            ]
          }],
          config: {
            temperature: 0.1,
            maxOutputTokens: 512,
            responseMimeType: 'application/json'
          }
        });

        let elemText = resp.text?.trim() || '[]';
        if (elemText.startsWith('```')) {
          elemText = elemText.replace(/^```json\n?/, '').replace(/```$/, '').trim();
        }
        let elements = [];
        try { elements = JSON.parse(elemText); } catch (e) { elements = []; }
        return res.status(200).json({ success: true, elements });
      } catch (err) {
        console.error('[detect-elements]', err.message);
        return res.status(200).json({ success: true, elements: [] });
      }
    }

    // в•ђв•ђв•ђ IDENTIFY ELEMENT (Gemini Vision) в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
    if (req.body?.action === 'identify-element') {
      const { imageBase64 } = req.body;
      if (!imageBase64) return res.status(400).json({ success: false, error: 'imageBase64 required' });

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(200).json({ success: true, hint: 'РќР°Р¶РјРёС‚Рµ РЅР° РґРµР№СЃС‚РІРёРµ РґР»СЏ СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРёСЏ' });
      }

      try {
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey });
        const { mimeType: mt, base64str: b64 } = extractBase64(imageBase64);

        const resp = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { mimeType: mt, data: b64 } },
              { text: `РўС‹ РІРёРґРёС€СЊ С„СЂР°РіРјРµРЅС‚ РєР°СЂС‚РѕС‡РєРё С‚РѕРІР°СЂР° РјР°СЂРєРµС‚РїР»РµР№СЃР°.
РћРїСЂРµРґРµР»Рё С‡С‚Рѕ СЌС‚Рѕ Р·Р° СЌР»РµРјРµРЅС‚. РћС‚РІРµС‚СЊ РћР”РќРћР™ С„СЂР°Р·РѕР№ РЅР° СЂСѓСЃСЃРєРѕРј СЏР·С‹РєРµ (РјР°РєСЃРёРјСѓРј 15 СЃР»РѕРІ).
РџСЂРёРјРµСЂС‹:
- "Р—Р°РіРѕР»РѕРІРѕРє СЃ РЅР°Р·РІР°РЅРёРµРј С‚РѕРІР°СЂР°"
- "Р‘РµР№РґР¶-С…Р°СЂР°РєС‚РµСЂРёСЃС‚РёРєР° С‚РѕРІР°СЂР°, РјРѕР¶РЅРѕ РёР·РјРµРЅРёС‚СЊ С‚РµРєСЃС‚"
- "Р¤РѕРЅРѕРІС‹Р№ РґРµРєРѕСЂ, РјРѕР¶РЅРѕ РёР·РјРµРЅРёС‚СЊ С†РІРµС‚ РёР»Рё СѓР±СЂР°С‚СЊ"
- "Р¦РµРЅР° С‚РѕРІР°СЂР°"
- "Р¤РѕС‚Рѕ С‚РѕРІР°СЂР°"
- "CTA-РєРЅРѕРїРєР°"
РћС‚РІРµС‚СЊ РўРћР›Р¬РљРћ РѕРїРёСЃР°РЅРёРµРј, Р±РµР· РєР°РІС‹С‡РµРє.` }
            ]
          }],
          config: { temperature: 0.1, maxOutputTokens: 60 },
        });

        const hint = resp.text?.trim() || 'РќР°Р¶РјРёС‚Рµ РЅР° РґРµР№СЃС‚РІРёРµ РґР»СЏ СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРёСЏ';
        return res.status(200).json({ success: true, hint });
      } catch (err) {
        console.error('[identify-element]', err.message);
        return res.status(200).json({ success: true, hint: 'Р’С‹Р±РµСЂРёС‚Рµ РґРµР№СЃС‚РІРёРµ РґР»СЏ СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРёСЏ' });
      }
    }


    // в•ђв•ђв•ђ CREATE PERSONA вЂ” РіРµРЅРµСЂР°С†РёСЏ 5-frame casting card РїРѕ РѕРїРёСЃР°РЅРёСЋ + РѕРїС†РёРѕРЅР°Р»СЊРЅС‹Рµ С„РѕС‚Рѕ в•ђв•ђв•ђ
    if (req.body?.action === 'create-persona') {
      const { photos, personaDescription, modelName: personaName } = req.body;
      const photoKeys = photos && typeof photos === 'object' ? Object.keys(photos).filter(k => photos[k]) : [];
      const hasDescription = personaDescription && personaDescription.trim().length > 5;
      const hasPhotos = photoKeys.length > 0;

      // РќСѓР¶РЅРѕ С…РѕС‚СЏ Р±С‹ РѕРїРёСЃР°РЅРёРµ РР›Р С„РѕС‚Рѕ
      if (!hasDescription && !hasPhotos) {
        return res.status(400).json({ success: false, error: 'РќСѓР¶РЅРѕ РѕРїРёСЃР°РЅРёРµ РїРµСЂСЃРѕРЅР°Р¶Р° РёР»Рё С…РѕС‚СЏ Р±С‹ РѕРґРЅР° С„РѕС‚РѕРіСЂР°С„РёСЏ' });
      }

      const elapsed = () => ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`рџ§‘ [${elapsed()}s] Create Persona: name="${personaName || 'unknown'}", photos=${photoKeys.length}, hasDesc=${hasDescription}`);

      try {
        // Collect photos as image inputs
        const imageInputs = [];
        if (hasPhotos) {
          for (const key of ['front', 'left34', 'right34', 'fullbody']) {
            if (photos[key]) {
              const img = photos[key];
              imageInputs.push(img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`);
            }
          }
        }
        // в”Ђв”Ђ Build persona prompt based on available inputs в”Ђв”Ђ
        const descBlock = hasDescription
          ? `\nв•ђв•ђв•ђ CHARACTER DESCRIPTION (PRIMARY SUBJECT) в•ђв•ђв•ђ\n${personaDescription.trim()}${personaName ? `\nName: ${personaName}` : ''}\n`
          : '';
        const refBlock = hasPhotos
          ? `\nв•ђв•ђв•ђ REFERENCE PHOTOS PROVIDED в•ђв•ђв•ђ\nYou have received ${imageInputs.length} reference photo(s). Use them to match the person's EXACT facial features, skin tone, hair, and body type. The generated character MUST look like the person in the reference photos.\n`
          : '';
        const subjectInstruction = hasPhotos
          ? `REPLICATE the EXACT facial features from the reference photos. ZERO creative liberty with the face.`
          : `CREATE this character FROM SCRATCH based on the description above. Generate a unique, photorealistic human being matching the description exactly.`;

        const personaPrompt = `You are an elite fashion agency photographer and casting director creating a PROFESSIONAL MODEL CASTING CARD.
${descBlock}${refBlock}
в•ђв•ђв•ђ LAYOUT: TOP ROW (4 face close-ups) + BOTTOM (1 large full-body) в•ђв•ђв•ђ

TOP ROW вЂ” 4 equal portrait frames side by side:
  [1] Face Front вЂ” head & shoulders, looking directly at camera, serious/neutral expression
  [2] Face 3/4 Left вЂ” head & shoulders, turned ~30В° to subject's left
  [3] Face 3/4 Right вЂ” head & shoulders, turned ~30В° to subject's right
  [4] Face Profile вЂ” head & shoulders, full 90В° side profile view

BOTTOM вЂ” 1 wide full-body frame (same width as all 4 top frames combined):
  [5] Full Body Front вЂ” standing straight, arms relaxed at sides, facing camera, head to toe

TOTAL: Exactly 5 frames. NO MORE. NO LESS. Top row: 4 small portraits. Bottom: 1 large full-body.

в•ђв•ђв•ђ PHOTOGRAPHIC REALISM (CRITICAL вЂ” NO PLASTIC SKIN) в•ђв•ђв•ђ
- DO NOT apply AI smoothing, plastic skin filters, or generic CGI rendering
- PRESERVE raw photographic texture: skin pores, micro-details, natural imperfections
- Lighting: cinematic, dramatic with depth and micro-contrast вЂ” NOT flat studio lighting
- Render hyper-realistic skin, natural hair strands, authentic human texture
- The result must look like a real photograph, NOT an AI illustration

в•ђв•ђв•ђ ABSOLUTE IDENTITY LOCK (CRITICAL вЂ” ZERO TOLERANCE) в•ђв•ђв•ђ
${subjectInstruction}
The person in ALL 5 frames must be CONSISTENT вЂ” same person across every frame:
- FACE: Exact bone structure вЂ” cheekbones, jawline angle, chin shape, forehead size
- EYES: Same exact eye shape, color, distance, eyelid crease, piercing gaze
- NOSE: Same exact nose bridge width, nostril shape, tip angle
- LIPS: Same exact lip fullness, cupid's bow, natural lip color
- SKIN: Same exact skin tone, texture, any moles/marks/freckles
- HAIR: Same exact color, length, texture, parting, style вЂ” NO hairstyle changes
- BODY: Same exact build, height proportions, shoulder width, muscle definition
- AGE: Consistent age across all 5 frames
If ANY frame shows a different-looking person вЂ” REJECTED.

в•ђв•ђв•ђ WARDROBE & BACKGROUND в•ђв•ђв•ђ
- Wardrobe: Simple black fitted clothing (black crew-neck t-shirt + black slim pants). No logos.
- Background: Dark cinematic charcoal/slate with subtle vignette, matching the dramatic mood of input photos. Uniform across all frames.

в•ђв•ђв•ђ LABELS в•ђв•ђв•ђ
Small elegant white text label below each frame:
Top: "Face Front" | "Face 3/4 Left" | "Face 3/4 Right" | "Face Profile"
Bottom: "Full Body Front"

в•ђв•ђв•ђ TECHNICAL в•ђв•ђв•ђ
- Clean thin dark borders between frames
- Top 4 frames: equal width, portrait orientation (roughly 1:1.2 ratio)
- Bottom 1 frame: full width, landscape orientation showing entire body
- ABSOLUTELY NO 3rd row, NO 6th frame, NO 8-frame grid. Only 5 frames total.

OUTPUT: One single 4K image. Casting card with 5 frames. Masterpiece cinematic photography quality.`;


        console.log(`рџ§‘ [${elapsed()}s] Sending ${imageInputs.length} photo(s) to KIE.ai for persona casting card...`);
        const resultUrl = await executeKieTask(personaPrompt, imageInputs, 'nano-banana-2', '16:9', '4K');
        console.log(`вњ… [${elapsed()}s] Comp card generated. Downloading...`);
        const dl = await downloadToBase64(resultUrl);
        if (!dl) throw new Error('Failed to download comp card');

        const creditsRemaining = await getCreditsRemainingForReservation(creditReservation);

        incrementGlobalCounter('generationsPersona').catch(() => {});
        saveGenerationLog({ userId: verifiedUid, success: true, imageUrl: resultUrl, reqBody: { action: 'create-persona', photoCount: photoKeys.length }, durationMs: Date.now() - startTime }).catch(() => {});

        return res.status(200).json({ success: true, imageBase64: `data:${dl.mimeType};base64,${dl.base64str}`, imageUrl: resultUrl, creditsRemaining });
      } catch (err) {
        console.error(`вќЊ Create Persona error:`, err.message);
        alertOnError(err, `generate-image [create_persona]`).catch(() => {});
        return res.status(200).json({ success: false, error: `РћС€РёР±РєР° СЃРѕР·РґР°РЅРёСЏ РїРµСЂСЃРѕРЅР°Р¶Р°: ${err.message.substring(0, 200)}` });
      }
    }

    // в•ђв•ђв•ђ GENERATE MISSING ANGLE вЂ” РіРµРЅРµСЂР°С†РёСЏ РЅРµРґРѕСЃС‚Р°СЋС‰РµРіРѕ СЂР°РєСѓСЂСЃР° РёР· РёРјРµСЋС‰РёС…СЃСЏ С„РѕС‚Рѕ в•ђв•ђв•ђ
    if (req.body?.action === 'generate-missing-angle') {
      const { existingPhotos, missingAngle } = req.body;
      if (!existingPhotos || !Array.isArray(existingPhotos) || existingPhotos.length === 0) {
        return res.status(400).json({ success: false, error: 'existingPhotos array required' });
      }
      if (!missingAngle) {
        return res.status(400).json({ success: false, error: 'missingAngle required (front, left34, right34, fullbody)' });
      }

      const elapsed = () => ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`рџ“ђ [${elapsed()}s] Generate missing angle: ${missingAngle} from ${existingPhotos.length} existing photos`);

      const ANGLE_DESCRIPTIONS = {
        front: 'a FRONT-FACING portrait photo (looking directly at camera, head and shoulders, neutral expression)',
        left34: 'a 3/4 LEFT SIDE portrait photo (head turned ~30В° to their left, showing more of the left side of face)',
        right34: 'a 3/4 RIGHT SIDE portrait photo (head turned ~30В° to their right, showing more of the right side of face)',
        fullbody: 'a FULL BODY photo (standing straight, facing camera, showing the entire body from head to feet, arms relaxed at sides)',
      };

      const angleDesc = ANGLE_DESCRIPTIONS[missingAngle] || ANGLE_DESCRIPTIONS.front;

      try {
        const imageInputs = existingPhotos.map(img =>
          img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`
        );

        const missingPrompt = `You have received ${existingPhotos.length} reference photo(s) of a REAL PERSON.
Generate ${angleDesc} of this EXACT SAME PERSON.

CRITICAL IDENTITY RULES:
- The generated photo must show the EXACT SAME PERSON as in the reference photos
- Preserve ALL facial features identically: face shape, nose, eyes, eyebrows, lips, jawline, skin tone, wrinkles, moles
- Preserve EXACT hair: color, length, texture, style, hairline
- Preserve EXACT body proportions
- Wear simple black fitted clothing (black t-shirt + black pants)
- Neutral dark gray studio background
- Professional studio lighting

OUTPUT: One single high-quality photo. No text. No collage. No explanations.`;

        console.log(`рџ“ђ [${elapsed()}s] Sending to KIE.ai for missing angle generation...`);
        const resultUrl = await executeKieTask(missingPrompt, imageInputs, 'nano-banana-2');
        console.log(`вњ… [${elapsed()}s] Missing angle generated. Downloading...`);
        const dl = await downloadToBase64(resultUrl);
        if (!dl) throw new Error('Failed to download generated angle');

        const creditsRemaining = await getCreditsRemainingForReservation(creditReservation);

        incrementGlobalCounter('generationsAngle').catch(() => {});

        return res.status(200).json({ success: true, imageBase64: `data:${dl.mimeType};base64,${dl.base64str}`, imageUrl: resultUrl, creditsRemaining });
      } catch (err) {
        console.error(`вќЊ Generate missing angle error:`, err.message);
        alertOnError(err, `generate-image [missing_angle]`).catch(() => {});
        return res.status(200).json({ success: false, error: `РћС€РёР±РєР° РіРµРЅРµСЂР°С†РёРё СЂР°РєСѓСЂСЃР°: ${err.message.substring(0, 200)}` });
      }
    }

    // в•ђв•ђв•ђ EDIT CARD вЂ” СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ РєР°СЂС‚РѕС‡РєРё РјР°СЂРєРµС‚РїР»РµР№СЃР° С‡РµСЂРµР· GPT Image 2 в•ђв•ђв•ђ
    if (req.body?.action === 'edit-card') {
      const { sourceImageBase64: editSrc, editInstruction: editText } = req.body;
      if (!editSrc || !editText) {
        return res.status(400).json({ success: false, error: 'sourceImageBase64 and editInstruction are required' });
      }
      const elapsed = () => ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`вњЏпёЏ [${elapsed()}s] Edit Card: instruction="${editText.substring(0, 80)}"`);
      try {
        const editPrompt = `You are editing a marketplace product card image. Apply this change precisely:\n"${editText}"\n\nRules:\n- Preserve the overall layout, typography style, brand identity, and Russian text quality.\n- Only modify what the user explicitly asked to change.\n- Keep all other elements exactly as they are.\n- The result must still look like a premium product card.\n- All text must remain in Russian Cyrillic.\n- Output ONLY the modified image.`;

        const imageInput = editSrc.startsWith('data:') ? editSrc : `data:image/jpeg;base64,${editSrc}`;
        const resultUrl = await executeKieTask(editPrompt, [imageInput], 'nano-banana-2');
        const dl = await downloadToBase64(resultUrl);
        if (!dl) throw new Error('Failed to download edited card');

        const creditsRemaining = await getCreditsRemainingForReservation(creditReservation);

        incrementGlobalCounter('generationsCardEdit').catch(() => {});

        return res.status(200).json({ success: true, imageBase64: `data:${dl.mimeType};base64,${dl.base64str}`, imageUrl: resultUrl, creditsRemaining });
      } catch (err) {
        console.error(`вќЊ Edit Card error:`, err.message);
        alertOnError(err, `generate-image [edit_card]`).catch(() => {});
        return res.status(200).json({ success: false, error: `РћС€РёР±РєР° СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРёСЏ: ${err.message.substring(0, 200)}` });
      }
    }

    if (req.body?.action === 'generate-card-text') {
      const { imageUrl, imageBase64 } = req.body;
      let targetImage = null;
      
      if (imageUrl) {
        targetImage = await downloadToBase64(imageUrl);
      } else if (imageBase64) {
        const { mimeType, base64str } = extractBase64(imageBase64);
        targetImage = { mimeType, base64str };
      }
      
      if (!targetImage) {
        return res.status(400).json({ success: false, error: 'РР·РѕР±СЂР°Р¶РµРЅРёРµ РЅРµ РЅР°Р№РґРµРЅРѕ РґР»СЏ Р°РЅР°Р»РёР·Р°' });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.warn('вљ пёЏ GEMINI_API_KEY not set, returning fallback card text');
        return res.status(200).json({
          success: true,
          title: 'РЎРўРР›Р¬РќР«Р™ РўРћР’РђР ',
          material: 'РџСЂРµРјРёСѓРј РєР°С‡РµСЃС‚РІРѕ',
          size: '',
          benefit: 'Р›СѓС‡С€РёР№ РІС‹Р±РѕСЂ'
        });
      }

      try {
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey });
        
        const textPrompt = `Analyze this product image carefully.
You are a top copywriter for Wildberries and Ozon marketplaces.
Generate realistic Russian selling metadata for this exact product.

Return ONLY a strict JSON object with these exact fields:
{
  "title": "A catchy, short product name in Russian (2-3 words, capitalized, e.g., 'РђРќРђРўРћРњРР§Р•РЎРљРђРЇ РџРћР”РЈРЁРљРђ' or 'РЁР•Р›РљРћР’РђРЇ РџРР–РђРњРђ')",
  "material": "One key material/composition in Russian (e.g., '100% Р’РµР»СЋСЂ' or 'РќР°С‚СѓСЂР°Р»СЊРЅС‹Р№ С€РµР»Рє')",
  "size": "One key size/dimension description in Russian (e.g., 'Р Р°Р·РјРµСЂ: M-L' or 'РћР±СЉРµРј: 50 РјР»')",
  "benefit": "One strong product benefit or feature in Russian (e.g., 'РђРЅР°С‚РѕРјРёС‡РµСЃРєР°СЏ С„РѕСЂРјР°' or 'Р“Р»СѓР±РѕРєРѕРµ СѓРІР»Р°Р¶РЅРµРЅРёРµ')"
}

IMPORTANT: Return ONLY the JSON, no markdown, no markdown blocks, no explanation. DO NOT include any price вЂ” the seller sets their own pricing.`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [
            {
              role: 'user',
              parts: [
                { inlineData: { mimeType: targetImage.mimeType, data: targetImage.base64str } },
                { text: textPrompt }
              ]
            }
          ],
          config: {
            temperature: 0.2,
            maxOutputTokens: 256,
            responseMimeType: 'application/json'
          }
        });

        let text = response.text?.trim() || '';
        if (text.startsWith('```')) {
          text = text.replace(/^```json\n?/, '').replace(/```$/, '').trim();
        }
        const json = JSON.parse(text);
        return res.status(200).json({
          success: true,
          title: json.title || 'РЎРўРР›Р¬РќР«Р™ РўРћР’РђР ',
          material: json.material || 'РџСЂРµРјРёСѓРј РєР°С‡РµСЃС‚РІРѕ',
          size: json.size || '',
          benefit: json.benefit || 'Р›СѓС‡С€РёР№ РІС‹Р±РѕСЂ'
        });
      } catch (err) {
        console.error('вќЊ Gemini card text generation failed:', err.message);
        return res.status(200).json({
          success: true,
          title: 'РЎРўРР›Р¬РќР«Р™ РўРћР’РђР ',
          material: 'РџСЂРµРјРёСѓРј РєР°С‡РµСЃС‚РІРѕ',
          size: '',
          benefit: 'Р›СѓС‡С€РёР№ РІС‹Р±РѕСЂ'
        });
      }
    }

    const {
      modelPreset = "25-year-old European female, slim build, natural makeup",
      posePreset = "standing straight, confident posture, facing the camera directly",
      cameraAngle = "full body shot",
      backgroundPreset = "clean minimalist white cyclorama",
      aspectRatio = "3:4",
      garmentImagesBase64 = [],
      garmentImageBase64,
      garmentImageUrls = [],
      modelReferenceImages,
      locationImages,
      customPoseText,
      previewMode,
      isCalibration = false,
      isPhotoEdit = false,
      sourceImageBase64,
      sourceImageUrl,
      editInstruction,
      attributes,
      isBeautyMode = false,
      biometricSeed,
      isProductMode = false,
      categoryId = 'default',
      compositionId = 'still_life',
      withHumanModel = false,
      humanModelPrompt = '',
      humanModelRefImages,
      isCardDesign = false,
      cardStyle = 'natural',
      isQuickCard = false,
      isUgcMode = false,
      isModelCard = false,
      isPhotoOnly = false,
      quickCardStyle = 'natural',
      userProductInfo = '',
    } = req.body;

    // в•ђв•ђв•ђ PHOTO EDIT MODE вЂ” precise, non-destructive editing в•ђв•ђв•ђ
    // Sends the EXISTING photo + edit instruction to Gemini.
    // Does NOT regenerate from scratch вЂ” only modifies what the user asked for.
    if (isPhotoEdit && editInstruction) {
      console.log(`вњЏпёЏ [${new Date().toISOString()}] Photo Edit: "${editInstruction}"`);
      try {
        // Get source image data
        let sourceData = null;
        if (sourceImageUrl) {
          sourceData = await downloadToBase64(sourceImageUrl);
        } else if (sourceImageBase64) {
          const { mimeType, base64str } = extractBase64(sourceImageBase64);
          sourceData = { mimeType, base64str };
        }
        if (!sourceData) {
          return res.status(200).json({ success: false, error: 'РќРµС‚ РёСЃС…РѕРґРЅРѕРіРѕ РёР·РѕР±СЂР°Р¶РµРЅРёСЏ РґР»СЏ СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРёСЏ.' });
        }

        console.log(`вњЏпёЏ Source image: ${sourceData.mimeType}, ${Math.round(sourceData.base64str.length / 1024)}KB base64`);

        const editPrompt = `PHOTO EDITING MODE вЂ” NON-DESTRUCTIVE RETOUCHING.

You are receiving an existing photograph. Your ONLY job is to make ONE specific modification to it.

EDIT REQUESTED: "${editInstruction}"

ABSOLUTE REQUIREMENTS:
- DO NOT regenerate, recreate, or reimagine this image.
- DO NOT change the person's identity, face shape, body shape, skin color, hair, clothing, or pose.
- DO NOT change the background, lighting, camera angle, or composition.
- DO NOT add or remove anything that was NOT explicitly requested.
- The output image MUST be visually identical to the input image in every way EXCEPT for the specific edit requested.
- Treat this as Photoshop-level retouching: precise, surgical, minimal.
- If asked to "add a smile": change ONLY the mouth area. Everything else stays pixel-identical.
- If asked to "remove tattoo": blend ONLY the tattoo area with surrounding skin. Nothing else changes.

Return ONLY the edited photograph.`;

        const resultUrl = await executeKieTask(editPrompt, [`data:${sourceData.mimeType};base64,${sourceData.base64str}`], 'nano-banana-2');
        console.log(`вњ… [${((Date.now() - startTime) / 1000).toFixed(1)}s] Photo edit complete. Downloading result...`);
        const dl = await downloadToBase64(resultUrl);
        if (!dl) throw new Error("Failed to download edited image");
        const creditsRemaining = await getCreditsRemainingForReservation(creditReservation);
        
        return res.status(200).json({ success: true, imageBase64: `data:${dl.mimeType};base64,${dl.base64str}`, imageUrl: resultUrl, creditsRemaining });
      } catch (editError) {
        console.error(`вќЊ Photo edit error:`, editError.message);
        return res.status(200).json({ success: false, error: `РћС€РёР±РєР° СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРёСЏ: ${editError.message}` });
      }
    }

    // в•ђв•ђв•ђ GARMENT SOURCE RESOLUTION в•ђв•ђв•ђ
    // Handles: Firebase Storage URLs, base64 data URLs (fallback), legacy fields
    let garmentImages = [];
    if (garmentImageUrls.length > 0) {
      console.log(`вЃпёЏ Processing ${garmentImageUrls.length} garment source(s)...`);
      const processed = await Promise.all(garmentImageUrls.map(async (url) => {
        if (url.startsWith('data:')) {
          // Already a base64 data URL вЂ” use directly (fallback mode when Storage is down)
          console.log('  рџ“Ћ Using base64 data URL directly (Storage fallback)');
          return url;
        }
        // Firebase Storage URL вЂ” download server-side
        const dl = await downloadToBase64(url);
        return dl ? `data:${dl.mimeType};base64,${dl.base64str}` : null;
      }));
      garmentImages = processed.filter(Boolean);
      console.log(`вЃпёЏ Resolved ${garmentImages.length}/${garmentImageUrls.length} garment(s) successfully`);
    } else if (garmentImagesBase64.length > 0) {
      garmentImages = garmentImagesBase64;
    } else if (garmentImageBase64) {
      garmentImages = [garmentImageBase64];
    }
    
    console.log(`рџљЂ [${new Date().toISOString()}] Р—Р°РїСЂРѕСЃ: calibration=${isCalibration}, garments=${garmentImages.length}, refs=${modelReferenceImages?.length || 0}, edit=${editInstruction || 'none'}, beauty=${isBeautyMode}, source=${garmentImageUrls.length > 0 ? 'URLs' : 'base64'}`);

    // Detect gender from model preset text
    const gender = detectGender(modelPreset);

    // Build XML attribute directives from structured selections (gender-aware)
    const attrDirectives = buildAttributeDirectives(attributes, gender);
    const bioNoise = getBiometricNoise(biometricSeed);
    const skinPrompt = isBeautyMode ? SKIN_BEAUTY_PROMPT : SKIN_REALISM_PROMPT;
    const genderLock = buildGenderLock(gender);
    const selectedPose = selectPoseFromSeed(biometricSeed, gender);

    const enhancedActorProfile = enhanceBodyMetrics(modelPreset, editInstruction);



    if (isCalibration) {
      const calibPrompt = buildMasterPrompt({
        modelPreset: enhancedActorProfile, posePreset: customPoseText || posePreset, cameraAngle, backgroundPreset, aspectRatio,
        hasMultipleGarments: false, hasModelRef: !!(modelReferenceImages && modelReferenceImages.length), isCalibration: true
      });
      let imageInputs = [];
      if (modelReferenceImages && Array.isArray(modelReferenceImages) && modelReferenceImages.length > 0) {
        for (const img of modelReferenceImages.slice(0, 5)) {
          if (!img) continue;
          if (img.startsWith('data:')) { imageInputs.push(img); }
          else if (img.startsWith('http')) { 
            const dl = await downloadToBase64(img); 
            if (dl) imageInputs.push(`data:${dl.mimeType};base64,${dl.base64str}`); 
          }
        }
      }
      console.log(`вЏі [${((Date.now() - startTime) / 1000).toFixed(1)}s] РћС‚РїСЂР°РІР»СЏРµРј РєР°Р»РёР±СЂРѕРІРєСѓ РІ KIE.ai...`);
      const resultUrl = await executeKieTask(calibPrompt, imageInputs, 'nano-banana-2');
      console.log(`вњ… [${((Date.now() - startTime) / 1000).toFixed(1)}s] РљР°Р»РёР±СЂРѕРІРєР° СѓСЃРїРµС€РЅР°. Downloading result...`);
      const dl = await downloadToBase64(resultUrl);
      if (!dl) throw new Error("Failed to download generated image");
      const creditsRemaining = await getCreditsRemainingForReservation(creditReservation);
      return res.status(200).json({ success: true, imageBase64: `data:${dl.mimeType};base64,${dl.base64str}`, imageUrl: resultUrl, creditsRemaining });
    }

    // в•ђв•ђв•ђ MODEL CARD вЂ” РєР°СЂС‚РѕС‡РєР° РјР°СЂРєРµС‚РїР»РµР№СЃР° СЃ РјРѕРґРµР»СЊСЋ С‡РµСЂРµР· GPT Image 2 в•ђв•ђв•ђ
    if (isModelCard) {
      const elapsed = () => ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`рџ‘¤ [${elapsed()}s] Model Card Mode: style=${quickCardStyle}, source=${garmentImageUrls?.length || 0} URLs`);
      try {
        let modelCardImages = [];
        if (garmentImages && garmentImages.length > 0) {
          for (const img of garmentImages.slice(0, 2)) {
            if (img.startsWith('data:')) { modelCardImages.push(img); }
            else if (img.startsWith('http')) {
              const result = await downloadToBase64(img);
              if (result) modelCardImages.push(`data:${result.mimeType};base64,${result.base64str}`);
            }
          }
        }
        if (sourceImageBase64) {
          modelCardImages.push(sourceImageBase64.startsWith('data:') ? sourceImageBase64 : `data:image/jpeg;base64,${sourceImageBase64}`);
        } else if (sourceImageUrl) {
          const dl = await downloadToBase64(sourceImageUrl);
          if (dl) modelCardImages.push(`data:${dl.mimeType};base64,${dl.base64str}`);
        }
        if (modelCardImages.length === 0) {
          return res.status(200).json({ success: false, error: 'РќРµС‚ РёСЃС…РѕРґРЅРѕРіРѕ С„РѕС‚Рѕ РґР»СЏ СЃРѕР·РґР°РЅРёСЏ РєР°СЂС‚РѕС‡РєРё СЃ РјРѕРґРµР»СЊСЋ.' });
        }

        const modelPrompt = isPhotoOnly ? MODEL_PHOTO_PROMPT : (quickCardStyle === 'epic' ? MODEL_CARD_PROMPT_EPIC : MODEL_CARD_PROMPT_NATURAL);
        let finalPrompt = modelPrompt;
        if (userProductInfo && userProductInfo.trim()) {
          finalPrompt += `\n\nUSER PROVIDED PRODUCT INFORMATION (use this for text on the card):\n${userProductInfo.trim()}`;
        }

        console.log(`рџ‘¤ [${elapsed()}s] Sending MODEL CARD to KIE.ai (gpt-image-2, style=${quickCardStyle})...`);
        const resultUrl = await executeKieTask(finalPrompt, modelCardImages, 'nano-banana-2');
        console.log(`вњ… [${elapsed()}s] Model card ready. Downloading...`);
        const dl = await downloadToBase64(resultUrl);
        if (!dl) throw new Error('Failed to download model card from KIE.ai');

        const creditsRemaining = await getCreditsRemainingForReservation(creditReservation);

        incrementGlobalCounter('generationsModelCard').catch(() => {});
        saveGenerationLog({ userId: verifiedUid, success: true, imageUrl: resultUrl, reqBody: req.body, durationMs: Date.now() - startTime }).catch(() => {});

        return res.status(200).json({ success: true, imageBase64: `data:${dl.mimeType};base64,${dl.base64str}`, imageUrl: resultUrl, creditsRemaining });
      } catch (modelErr) {
        console.error(`вќЊ Model card error:`, modelErr.message);
        alertOnError(modelErr, `generate-image [model_card]`).catch(() => {});
        return res.status(200).json({ success: false, error: `РћС€РёР±РєР° СЃРѕР·РґР°РЅРёСЏ РєР°СЂС‚РѕС‡РєРё СЃ РјРѕРґРµР»СЊСЋ: ${modelErr.message.substring(0, 200)}` });
      }
    }

    // в•ђв•ђв•ђ UGC MODE вЂ” СЂРµР°Р»РёСЃС‚РёС‡РЅС‹Рµ С„РѕС‚Рѕ В«РѕС‚ РїРѕРєСѓРїР°С‚РµР»РµР№В» С‡РµСЂРµР· GPT Image 2 в•ђв•ђв•ђ
    if (isUgcMode) {
      const elapsed = () => ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`рџ“± [${elapsed()}s] UGC Mode: source=${garmentImageUrls?.length || 0} URLs`);
      try {
        let ugcImageInputs = [];
        if (garmentImages && garmentImages.length > 0) {
          for (const img of garmentImages.slice(0, 1)) {
            if (img.startsWith('data:')) { ugcImageInputs.push(img); }
            else if (img.startsWith('http')) {
              const result = await downloadToBase64(img);
              if (result) ugcImageInputs.push(`data:${result.mimeType};base64,${result.base64str}`);
            }
          }
        }
        if (sourceImageBase64) {
          ugcImageInputs.push(sourceImageBase64.startsWith('data:') ? sourceImageBase64 : `data:image/jpeg;base64,${sourceImageBase64}`);
        } else if (sourceImageUrl) {
          const dl = await downloadToBase64(sourceImageUrl);
          if (dl) ugcImageInputs.push(`data:${dl.mimeType};base64,${dl.base64str}`);
        }
        if (ugcImageInputs.length === 0) {
          return res.status(200).json({ success: false, error: 'РќРµС‚ РёСЃС…РѕРґРЅРѕРіРѕ С„РѕС‚Рѕ РґР»СЏ СЃРѕР·РґР°РЅРёСЏ UGC.' });
        }

        console.log(`рџ“± [${elapsed()}s] Sending UGC to KIE.ai (gpt-image-2)...`);
        const resultUrl = await executeKieTask(QUICK_UGC_PROMPT, ugcImageInputs, 'nano-banana-2');
        console.log(`вњ… [${elapsed()}s] UGC ready. Downloading...`);
        const dl = await downloadToBase64(resultUrl);
        if (!dl) throw new Error('Failed to download UGC from KIE.ai');

        const creditsRemaining = await getCreditsRemainingForReservation(creditReservation);

        incrementGlobalCounter('generationsUgc').catch(() => {});
        saveGenerationLog({ userId: verifiedUid, success: true, imageUrl: resultUrl, reqBody: req.body, durationMs: Date.now() - startTime }).catch(() => {});

        return res.status(200).json({ success: true, imageBase64: `data:${dl.mimeType};base64,${dl.base64str}`, imageUrl: resultUrl, creditsRemaining });
      } catch (ugcErr) {
        console.error(`вќЊ UGC error:`, ugcErr.message);
        alertOnError(ugcErr, `generate-image [ugc]`).catch(() => {});
        return res.status(200).json({ success: false, error: `РћС€РёР±РєР° СЃРѕР·РґР°РЅРёСЏ UGC-С„РѕС‚Рѕ: ${ugcErr.message.substring(0, 200)}` });
      }
    }

    // в•ђв•ђв•ђ QUICK CARD вЂ” РїРѕР»РЅРѕС†РµРЅРЅР°СЏ РєР°СЂС‚РѕС‡РєР° РјР°СЂРєРµС‚РїР»РµР№СЃР° С‡РµСЂРµР· GPT Image 2 в•ђв•ђв•ђ
    if (isQuickCard) {
      const elapsed = () => ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`рџ“‹ [${elapsed()}s] Quick Card: style=${quickCardStyle}, source=${garmentImageUrls?.length || 0} URLs, userInfo=${userProductInfo?.length || 0} chars`);
      try {
        let cardImageInputs = [];
        // РџРѕР»СѓС‡Р°РµРј РёР·РѕР±СЂР°Р¶РµРЅРёРµ С‚РѕРІР°СЂР°
        if (garmentImages && garmentImages.length > 0) {
          for (const img of garmentImages.slice(0, 1)) {
            if (img.startsWith('data:')) { cardImageInputs.push(img); }
            else if (img.startsWith('http')) {
              const result = await downloadToBase64(img);
              if (result) cardImageInputs.push(`data:${result.mimeType};base64,${result.base64str}`);
            }
          }
        }
        if (sourceImageBase64) {
          cardImageInputs.push(sourceImageBase64.startsWith('data:') ? sourceImageBase64 : `data:image/jpeg;base64,${sourceImageBase64}`);
        } else if (sourceImageUrl) {
          const dl = await downloadToBase64(sourceImageUrl);
          if (dl) cardImageInputs.push(`data:${dl.mimeType};base64,${dl.base64str}`);
        }
        if (cardImageInputs.length === 0) {
          return res.status(200).json({ success: false, error: 'РќРµС‚ РёСЃС…РѕРґРЅРѕРіРѕ С„РѕС‚Рѕ РґР»СЏ СЃРѕР·РґР°РЅРёСЏ РєР°СЂС‚РѕС‡РєРё.' });
        }

        // Р’С‹Р±РёСЂР°РµРј СЃРёСЃС‚РµРјРЅС‹Р№ РїСЂРѕРјРїС‚ РєР°СЂС‚РѕС‡РєРё
        const cardPrompt = quickCardStyle === 'epic' ? QUICK_CARD_PROMPT_EPIC : QUICK_CARD_PROMPT_NATURAL;
        // Р•СЃР»Рё РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ РґРѕР±Р°РІРёР» РёРЅС„РѕСЂРјР°С†РёСЋ вЂ” РІСЃС‚Р°РІР»СЏРµРј РІ РїСЂРѕРјРїС‚
        const fullPrompt = userProductInfo && userProductInfo.trim()
          ? `${cardPrompt}\n\n<USER_PROVIDED_PRODUCT_INFO>\nThe seller has provided the following verified product information. Use ONLY this data for text on the card. Do NOT invent additional claims.\n${userProductInfo.trim()}\n</USER_PROVIDED_PRODUCT_INFO>`
          : cardPrompt;

        console.log(`рџ“‹ [${elapsed()}s] Sending Quick Card to KIE.ai (gpt-image-2)...`);
        const resultUrl = await executeKieTask(fullPrompt, cardImageInputs, 'nano-banana-2');
        console.log(`вњ… [${elapsed()}s] Quick Card ready. Downloading...`);
        const dl = await downloadToBase64(resultUrl);
        if (!dl) throw new Error('Failed to download quick card from KIE.ai');

        const creditsRemaining = await getCreditsRemainingForReservation(creditReservation);

        incrementGlobalCounter('generationsQuickCard').catch(() => {});
        saveGenerationLog({ userId: verifiedUid, success: true, imageUrl: resultUrl, reqBody: req.body, durationMs: Date.now() - startTime }).catch(() => {});

        return res.status(200).json({ success: true, imageBase64: `data:${dl.mimeType};base64,${dl.base64str}`, imageUrl: resultUrl, creditsRemaining });
      } catch (cardErr) {
        console.error(`вќЊ Quick Card error:`, cardErr.message);
        alertOnError(cardErr, `generate-image [quick_card]`).catch(() => {});
        return res.status(200).json({ success: false, error: `РћС€РёР±РєР° СЃРѕР·РґР°РЅРёСЏ РєР°СЂС‚РѕС‡РєРё: ${cardErr.message.substring(0, 200)}` });
      }
    }

    // в•ђв•ђв•ђ CARD DESIGN MODE вЂ” РјР°СЂРєРµС‚РїР»РµР№СЃРЅР°СЏ РєР°СЂС‚РѕС‡РєР° С‚РѕРІР°СЂР° в•ђв•ђв•ђ
    if (isCardDesign) {
      const elapsed = () => ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`рџЋґ [${elapsed()}s] Card Design: style=${cardStyle}, source=${sourceImageUrl ? 'url' : sourceImageBase64 ? 'base64' : 'garment'}`);
      try {
        let cardImageInputs = [];
        if (sourceImageUrl) {
          const dl = await downloadToBase64(sourceImageUrl);
          if (dl) cardImageInputs.push(`data:${dl.mimeType};base64,${dl.base64str}`);
        } else if (sourceImageBase64) {
          cardImageInputs.push(sourceImageBase64.startsWith('data:') ? sourceImageBase64 : `data:image/jpeg;base64,${sourceImageBase64}`);
        } else if (garmentImages && garmentImages.length > 0) {
          for (const img of garmentImages.slice(0, 1)) {
            if (img.startsWith('data:')) { cardImageInputs.push(img); }
            else if (img.startsWith('http')) {
              const result = await downloadToBase64(img);
              if (result) cardImageInputs.push(`data:${result.mimeType};base64,${result.base64str}`);
            }
          }
        }
        if (cardImageInputs.length === 0) {
          return res.status(200).json({ success: false, error: 'РќРµС‚ РёСЃС…РѕРґРЅРѕРіРѕ С„РѕС‚Рѕ РґР»СЏ СЃРѕР·РґР°РЅРёСЏ РєР°СЂС‚РѕС‡РєРё.' });
        }

        const EPIC_CARD_PROMPT = `ROLE: Elite Russian E-commerce Art Director (Wildberries/Ozon).
TASK: Transform this product photo into a stunning marketplace card background template.
STYLE: EPIC вЂ” Dark cinematic. Deep mysterious dark background (#06060c to #111122 gradient) with dynamic abstract shapes, light beams or soft glowing particles.
LAYOUT: Place the product photo on the right/center (55-60% of card width) with realistic contact shadows and glowing ambient backlighting.
TEXT WARNING: DO NOT WRITE ANY TEXT, WORDS, LETTERS, CHARACTERS, NUMBERS OR BADGES ON THE IMAGE. Keep the left side (approx 40-45% width) completely clean and empty for text overlay.
OUTPUT: A clean, high-end marketplace background template with the product integrated, containing NO text or letters.`;

        const NATURAL_CARD_PROMPT = `ROLE: Elite Russian E-commerce Art Director (Wildberries/Ozon).
TASK: Transform this product photo into a stunning marketplace card background template.
STYLE: NATURAL вЂ” Clean, premium lifestyle. Soft cream, beige, or warm white minimalist aesthetic background (#faf8f5) with soft shadows or organic shadows.
LAYOUT: Place the product in the center-bottom or right (55% height/width) with realistic soft ground shadows.
TEXT WARNING: DO NOT WRITE ANY TEXT, WORDS, LETTERS, CHARACTERS, NUMBERS OR BADGES ON THE IMAGE. Keep the top/left area clean and empty for text overlay.
OUTPUT: A clean, high-end marketplace background template with the product integrated, containing NO text or letters.`;

        const cardPrompt = cardStyle === 'epic' ? EPIC_CARD_PROMPT : NATURAL_CARD_PROMPT;

        console.log(`рџЋґ [${elapsed()}s] Sending to KIE.ai gpt-image-2...`);
        const resultUrl = await executeKieTask(cardPrompt, cardImageInputs, 'nano-banana-2');
        console.log(`вњ… [${elapsed()}s] Card design ready. Downloading...`);
        const dl = await downloadToBase64(resultUrl);
        if (!dl) throw new Error('Failed to download card design from KIE.ai');

        incrementGlobalCounter('generationsCard').catch(() => {});
        saveGenerationLog({ userId: verifiedUid, success: true, imageUrl: resultUrl, reqBody: req.body, durationMs: Date.now() - startTime }).catch(() => {});
        const creditsRemaining = await getCreditsRemainingForReservation(creditReservation);

        return res.status(200).json({ success: true, imageBase64: `data:${dl.mimeType};base64,${dl.base64str}`, imageUrl: resultUrl, creditsRemaining });
      } catch (cardErr) {
        console.error(`вќЊ Card Design error:`, cardErr.message);
        alertOnError(cardErr, `generate-image [card_design]`).catch(() => {});
        return res.status(200).json({ success: false, error: `РћС€РёР±РєР° СЃРѕР·РґР°РЅРёСЏ РєР°СЂС‚РѕС‡РєРё: ${cardErr.message.substring(0, 200)}` });
      }
    }

    // в•ђв•ђв•ђ PRODUCT MODE вЂ” РїСЂРµРґРјРµС‚РЅР°СЏ СЃСЉРµРјРєР° С‚РѕРІР°СЂРѕРІ в•ђв•ђв•ђ
    // РСЃРїРѕР»СЊР·СѓРµС‚ buildProductPrompt() РІРјРµСЃС‚Рѕ fashion pipeline
    if (isProductMode) {

      console.log(`рџ“¦ [${((Date.now() - startTime) / 1000).toFixed(1)}s] Product Mode: category=${categoryId}, images=${garmentImages.length}, withModel=${withHumanModel}`);
      
      const effectPrompt = customPoseText || '';
      const productPromptText = buildProductPrompt({
        categoryId,
        productPrompt: modelPreset,
        compositionPrompt: posePreset,
        compositionId,
        cameraAngle,
        bgPrompt: backgroundPreset,
        effectPrompt,
        aspectRatio,
        withHumanModel,
        humanModelPrompt,
        isBeautyMode,
        attributes
      });

      let imageInputs = [];
      for (const img of garmentImages.slice(0, 9)) {
        imageInputs.push(img.startsWith('data:') ? img : `data:image/jpeg;base64,${extractBase64(img).base64str}`);
      }

      // Р РµС„РµСЂРµРЅСЃС‹ РјРѕРґРµР»Рё-С‡РµР»РѕРІРµРєР°
      if (withHumanModel && humanModelRefImages && Array.isArray(humanModelRefImages) && humanModelRefImages.length > 0) {
        for (const img of humanModelRefImages.slice(0, 5)) {
          if (!img) continue;
          if (img.startsWith('data:')) { imageInputs.push(img); }
          else if (img.startsWith('http')) {
            const result = await downloadToBase64(img);
            if (result) imageInputs.push(`data:${result.mimeType};base64,${result.base64str}`);
          }
        }
      }

      // РџРѕРґРґРµСЂР¶РєР° Р»РѕРєР°С†РёР№ РґР»СЏ С‚РѕРІР°СЂРѕРІ
      if (locationImages && Array.isArray(locationImages) && locationImages.length > 0) {
        console.log(`рџ“Ќ [Product] Loading ${locationImages.length} location image(s)...`);
        for (const img of locationImages.slice(0, 5)) {
          if (img.startsWith('data:')) { imageInputs.push(img); }
          else if (img.startsWith('http')) {
            const result = await downloadToBase64(img);
            if (result) {
              imageInputs.push(`data:${result.mimeType};base64,${result.base64str}`);
              console.log(`вњ… [Product] Location image loaded OK (${result.base64str.length} bytes b64)`);
            } else {
              console.error(`вќЊ [Product] FAILED to load location image: ${img.substring(0, 80)}`);
            }
          }
        }
        console.log(`рџ“Ќ [Product] After loc load: imageInputs.length=${imageInputs.length}`);
      }

      console.log(`вЏі [${((Date.now() - startTime) / 1000).toFixed(1)}s] Product Mode в†’ KIE.ai (gpt-image-2), ${imageInputs.length} image(s), model=${withHumanModel}...`);
      const resultUrl = await executeKieTask(productPromptText, imageInputs, 'nano-banana-2');
      console.log(`вњ… [${((Date.now() - startTime) / 1000).toFixed(1)}s] Product shot ready. Downloading...`);
      const dl = await downloadToBase64(resultUrl);
      if (!dl) throw new Error("Failed to download product image from KIE.ai");

      const creditsRemainingProd = await getCreditsRemainingForReservation(creditReservation);

      incrementGlobalCounter('generationsProduct').catch(() => {});
      saveGenerationLog({ userId: verifiedUid, success: true, imageUrl: resultUrl, reqBody: req.body, durationMs: Date.now() - startTime }).catch(() => {});

      return res.status(200).json({ success: true, imageBase64: `data:${dl.mimeType};base64,${dl.base64str}`, imageUrl: resultUrl, creditsRemaining: creditsRemainingProd });
    }

    const isAdaptive = /amputee|prosthe|wheelchair|limb\s*(missing|difference)|adaptive\s*fashion/i.test(modelPreset);
    const adaptiveBlock = isAdaptive
      ? `\nADAPTIVE FASHION DIRECTIVE: Accurately represent the specified physical disability. Do NOT "correct" or "fix" the model's body.\n`
      : '';
    const multiGarmentNote = garmentImages.length > 1
      ? 'MULTIPLE garment assets provided вЂ” extract and drape ALL of them simultaneously.'
      : '';
    const hasModelRef = !!(modelReferenceImages && modelReferenceImages.length);
    const modelInstruction = hasModelRef
      ? 'CRITICAL: Reference photos of the EXACT person are provided. You MUST replicate their face, skin tone, features, and overall appearance.'
      : '';
    const poseStr = customPoseText || posePreset;

    // в•ђв•ђв•ђ GARMENT SANITIZATION вЂ” CRITICAL: must run before SCHEMA pipeline в•ђв•ђв•ђ
    // Deep Think suggested removing this, but was WRONG. Semantic masking in text
    // alone does NOT prevent identity leak. Gemini still extracts facial features
    // from raw photos. The solid black box physically destroys face pixels and
    // is the ONLY proven method that blocks identity transfer.
    if (garmentImages.length > 0) {
      console.log(`рџ§№ [${((Date.now() - startTime) / 1000).toFixed(1)}s] Sanitizing ${garmentImages.length} garment image(s) (solid black box)...`);
      garmentImages = await Promise.all(
        garmentImages.map((img, i) => sanitizeGarmentImage(img, i))
      );
      console.log(`рџ§№ [${((Date.now() - startTime) / 1000).toFixed(1)}s] Sanitization complete`);
    }

    let promptText = `<system_directive>
ROLE: Elite Commercial Fashion Photographer and CGI Compositing Specialist.
TASK: Photorealistic Virtual Try-On (VTON) executing a flawless "Mannequin-to-Human" texture transfer.
METHODOLOGY: Strict adherence to structured SCHEMA parameters.
</system_directive>
${adaptiveBlock}
<input_modality_1>
SOURCE GARMENT REFERENCE:
Analyze the physical fabric, cut, color, and fit of the clothing in the attached images.
${hasModelRef ? '' : `
<IDENTITY_FIREWALL>
ABSOLUTE PRIORITY вЂ” The person wearing the clothing in these reference images is COMPLETELY IRRELEVANT.
You MUST NOT extract, copy, reference, or be influenced by:
- Their face, facial bone structure, or facial features
- Their skin tone, complexion, or skin texture
- Their body shape, proportions, or posture
- Their hairstyle, hair color, or hair texture
- Their age, ethnicity appearance, or any biometric data
- Their tattoos, jewelry, or accessories

The wearer in the reference photos is a TRANSPARENT INVISIBLE GHOST вЂ” a lifeless plastic display mannequin.
You are ONLY looking at the FABRIC draped on this ghost: the color, material, cut, seams, zippers, logos, and construction of the garment itself.

AFTER extracting the garment data, you must COMPLETELY FORGET the ghost. Generate a BRAND NEW person from scratch based ONLY on the text description in ACTOR_PROFILE below.
The generated person must have a COMPLETELY DIFFERENT face, body, and identity from whoever was in the source photo.
</IDENTITY_FIREWALL>
`}WARNING: Treat the entity currently wearing the clothing as an INVISIBLE, IRRELEVANT SCAFFOLD (Plastic Mannequin). Do NOT extract biometrics.
</input_modality_1>

<phase_1_semantic_masking>
Perform explicit semantic masking on the source garment reference.
1. ISOLATE the physical garment (fabric texture, weave, natural folds, exact color, branding, cut). Preserve 100% PHYSICAL REALITY.
2. DE-ANCHOR THE IDENTITY. Completely discard all anatomical features, body mass, skin tones, and the facial structure/void of the source wearer.
${multiGarmentNote}
</phase_1_semantic_masking>

<phase_2_subject_recasting>
Generate a completely novel, living human actor to wear the isolated garment.
${genderLock}
SUBJECT GEOMETRY & TRAITS (CRITICAL): "${enhancedActorProfile}"
- You MUST enforce a totally new biometric generation matching ONLY the traits above.
${modelInstruction}
${bioNoise ? `<BIOMETRIC_SEED>UID-${biometricSeed}. Unique facial micro-features for this generation: ${bioNoise}. Use these to create a DISTINCTLY UNIQUE face that has never been generated before, while still matching the ethnic profile above.</BIOMETRIC_SEED>` : ''}
${attrDirectives ? `<APPLIED_CHARACTERISTICS>
${attrDirectives}
</APPLIED_CHARACTERISTICS>` : ''}
<POSE_AND_CAMERA_DIRECTIVE>
TARGET POSE: "${customPoseText || posePreset || selectedPose}"
IMPERATIVE RULES FOR POSE EXECUTION:
1. GARMENT VISIBILITY IS ABSOLUTE: Execute the target pose, but hands, arms, and accessories MUST NEVER completely cover or obscure the main design, logos, or chest/stomach area of the clothing. If the pose dictates crossed arms, place them loose and low.
2. FABRIC PHYSICS & GRAVITY: The clothing must dynamically adapt to this specific pose. Calculate realistic fabric tension, drape, stretching, and wrinkles based on the model's body angle and limb positioning.
3. EDITORIAL VIBE: The final image must look like a high-end fashion magazine lookbook. Break the flat "mannequin" syndrome entirely.
</POSE_AND_CAMERA_DIRECTIVE>
</phase_2_subject_recasting>
`;

    let imageInputs = [];
    for (const img of garmentImages.slice(0, 9)) {
       imageInputs.push(img.startsWith('data:') ? img : `data:image/jpeg;base64,${extractBase64(img).base64str}`);
    }

    if (modelReferenceImages && Array.isArray(modelReferenceImages) && modelReferenceImages.length > 0) {
      promptText += `\n<identity_reference>\nACTOR IDENTITY LOCK:\nThe generated person MUST closely resemble the REAL person in the attached reference photos. Match facial features, ethnicity, and skin tone.\n</identity_reference>\n`;
      for (const img of modelReferenceImages.slice(0, 5)) {
        if (!img) continue;
        if (img.startsWith('data:')) {
          imageInputs.push(img);
        } else if (img.startsWith('http')) {
          const result = await downloadToBase64(img);
          if (result) imageInputs.push(`data:${result.mimeType};base64,${result.base64str}`);
        }
      }
    }

    if (locationImages && Array.isArray(locationImages) && locationImages.length > 0) {
      console.log(`рџ“Ќ [Fashion] Loading ${locationImages.length} location image(s)...`);
      promptText += `\n<location_reference>\nUse the attached location images as reference for the background.\n</location_reference>\n`;
      for (const img of locationImages.slice(0, 5)) {
        if (img.startsWith('data:')) {
          imageInputs.push(img);
        } else if (img.startsWith('http')) {
          const result = await downloadToBase64(img);
          if (result) {
            imageInputs.push(`data:${result.mimeType};base64,${result.base64str}`);
            console.log(`вњ… [Fashion] Location image loaded OK`);
          } else {
            console.error(`вќЊ [Fashion] FAILED to load location image: ${img.substring(0, 80)}`);
          }
        }
      }
      console.log(`рџ“Ќ [Fashion] After loc load: imageInputs.length=${imageInputs.length}`);
    }

    promptText += `<schema_generation_directive>
<style>High-end e-commerce editorial photography, hyper-realistic skin texture, 35mm film quality, razor-sharp focus on apparel.</style>
<lighting>Three-point studio softbox lighting, 5600K key light, zero harsh shadows on the garment to preserve fabric details.</lighting>
<environment>${backgroundPreset}</environment>
<composition>POSE: ${poseStr}. CAMERA: ${cameraAngle}. ASPECT RATIO: ${aspectRatio}. 50mm lens equivalent, full subject framing.</composition>

<mandatory_constraints>
1. 100% pixel-perfect fidelity to the original garment's structure, sleeve length, collar type, and exact color.
2. The garment must stretch, drape, and cast natural micro-shadows realistically over the specific generated body geometry dictated by SUBJECT GEOMETRY.
3. If an edit override is provided in SUBJECT GEOMETRY, it MUST be applied flawlessly.
${skinPrompt}
</mandatory_constraints>

<prohibitions>
- ZERO INVENTION (CLOTHING): Do NOT invent, hallucinate, or add ANY structural elements to the clothing. This means: NO added sleeves, NO added undershirts, NO added layers beneath a vest, NO added pockets, NO added belts, NO added zippers, NO added buttons, NO added patterns. If the source garment is a sleeveless vest вЂ” the output MUST show a sleeveless vest with bare arms visible. NEVER add a shirt or sweater underneath.
- ZERO INVENTION (BODY): Do NOT add tattoos, piercings, jewelry, watches, bracelets, necklaces, or accessories UNLESS explicitly requested in <APPLIED_CHARACTERISTICS>. If <TATTOO_CONSTRAINT> says NO tattoos вЂ” the skin MUST be completely clean.
- CLOTHING PHYSICS: You MUST physically deform, stretch, and adjust the volume of the original clothing to perfectly match the <BODY_OVERRIDE> target. Do NOT lazily copy the body shape from the source garment image.
- MODIFICATION EXPOSURE: If <TATTOO> or <PIERCING> dictates mandatory visibility, ensure the model pose naturally exposes those areas (arms, neck, ears) so the ink/metal is clearly seen.
- IDENTITY LOCK: Do NOT transfer any physical traits, skin tones, or facial structure from the garment reference image to the new actor.
- BODY TYPE LOCK: Do NOT use average, slim, or athletic body proportions if heavy/obese metrics are requested. Do NOT smooth out requested curves or fat.
- Do NOT alter the fabric's original pattern, texture scale, color, or cut.
- OUTPUT FORMAT: Output ONLY pixel data. Do NOT output text. Do NOT describe the image.
</prohibitions>

<trigger>FINAL EXECUTION: Generate the photorealistic render based strictly on the SCHEMA. Execute now.</trigger>
</schema_generation_directive>`;

    console.log(`вЏі [${((Date.now() - startTime) / 1000).toFixed(1)}s] РћС‚РїСЂР°РІР»СЏРµРј Р·Р°РїСЂРѕСЃ РІ KIE.ai (gpt-image-2)...`);
    
    const resultUrl = await executeKieTask(promptText, imageInputs, 'nano-banana-2');
    console.log(`вњ… [${((Date.now() - startTime) / 1000).toFixed(1)}s] РљР°СЂС‚РёРЅРєР° СЃРіРµРЅРµСЂРёСЂРѕРІР°РЅР°. Downloading result...`);
    const dl = await downloadToBase64(resultUrl);
    if (!dl) throw new Error("Failed to download final generated image from KIE.ai");

    const creditsRemainingFashion = await getCreditsRemainingForReservation(creditReservation);

    // в•ђв•ђв•ђ STATS: Р°С‚РѕРјР°СЂРЅРѕ РёРЅРєСЂРµРјРµРЅС‚РёСЂСѓРµРј СЃС‡С‘С‚С‡РёРє РіРµРЅРµСЂР°С†РёР№ в•ђв•ђв•ђ
    const mode = req.body?.isCalibration ? 'generationsCalibration' : 'generationsFashion';
    incrementGlobalCounter('generationsTotal').catch(() => {});
    incrementGlobalCounter(mode).catch(() => {});

    // Р—Р°РїРёСЃС‹РІР°РµРј РґРµС‚Р°Р»СЊРЅС‹Р№ Р»РѕРі СѓСЃРїРµС€РЅРѕР№ РіРµРЅРµСЂР°С†РёРё
    saveGenerationLog({
      userId: verifiedUid,
      success: true,
      imageUrl: resultUrl,
      reqBody: req.body,
      durationMs: Date.now() - startTime
    }).catch(() => {});

    return res.status(200).json({ success: true, imageBase64: `data:${dl.mimeType};base64,${dl.base64str}`, imageUrl: resultUrl, creditsRemaining: creditsRemainingFashion });
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`вќЊ [${elapsed}s] РћС€РёР±РєР°:`, error.message);
    
    // Р—Р°РїРёСЃС‹РІР°РµРј РґРµС‚Р°Р»СЊРЅС‹Р№ Р»РѕРі РѕС€РёР±РєРё РіРµРЅРµСЂР°С†РёРё
    saveGenerationLog({
      userId: verifiedUid,
      success: false,
      error: error.message,
      reqBody: req.body,
      durationMs: Date.now() - startTime
    }).catch(() => {});

    // в•ђв•ђв•ђ ADMIN ALERT вЂ” РѕС‚РїСЂР°РІРєР° РІ Telegram (С„РѕРЅРѕРІР°СЏ, РЅРµ Р±Р»РѕРєРёСЂСѓРµС‚ РѕС‚РІРµС‚) в•ђв•ђв•ђ
    const mode = req.body?.isProductMode ? 'product' : req.body?.isCalibration ? 'calibration' : req.body?.isPhotoEdit ? 'photo_edit' : 'fashion';
    alertOnError(error, `generate-image [${mode}] ${elapsed}s`).catch(() => {});
    
    // Detect quota/rate-limit errors and return friendly messages
    const msg = error.message || '';
    if (error.code === 'NO_PLAN' || error.code === 'INSUFFICIENT_CREDITS') {
      return res.status(402).json({
        success: false,
        error: error.message,
        isBillingError: true,
        creditsRemaining: error.creditsRemaining ?? 0
      });
    }
    if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota') || msg.includes('rate')) {
      return res.status(200).json({ 
        success: false, 
        error: 'вЏі Р›РёРјРёС‚ Р·Р°РїСЂРѕСЃРѕРІ РІСЂРµРјРµРЅРЅРѕ РёСЃС‡РµСЂРїР°РЅ. РџРѕРґРѕР¶РґРёС‚Рµ 1-2 РјРёРЅСѓС‚С‹ Рё РїРѕРїСЂРѕР±СѓР№С‚Рµ СЃРЅРѕРІР°.',
        isQuotaError: true
      });
    }
    if (msg.includes('422') || msg.includes('not supported')) {
      return res.status(200).json({ 
        success: false, 
        error: 'вљ пёЏ РњРѕРґРµР»СЊ РіРµРЅРµСЂР°С†РёРё РІСЂРµРјРµРЅРЅРѕ РЅРµРґРѕСЃС‚СѓРїРЅР°. РџРѕРїСЂРѕР±СѓР№С‚Рµ РїРѕР·Р¶Рµ.'
      });
    }
    if (msg.includes('400') || msg.includes('INVALID_ARGUMENT')) {
      return res.status(200).json({ 
        success: false, 
        error: 'вќЊ РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ Р·Р°РїСЂРѕСЃ. РџРѕРїСЂРѕР±СѓР№С‚Рµ РґСЂСѓРіРёРµ РЅР°СЃС‚СЂРѕР№РєРё РёР»Рё С„РѕС‚Рѕ.'
      });
    }
    
    // KIE.ai specific errors
    if (msg.includes('KIE') || msg.includes('Task failed') || msg.includes('Task timed out')) {
      return res.status(200).json({
        success: false,
        error: `вљ пёЏ РЎРµСЂРІРёСЃ РіРµРЅРµСЂР°С†РёРё (KIE.ai): ${msg.substring(0, 200)}`,
      });
    }
    // Network/download errors
    if (msg.includes('network') || msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT') || msg.includes('Failed to download')) {
      return res.status(200).json({
        success: false,
        error: `рџЊђ РћС€РёР±РєР° СЃРµС‚Рё: ${msg.substring(0, 200)}. РџРѕРїСЂРѕР±СѓР№С‚Рµ СЃРЅРѕРІР°.`,
      });
    }
    
    // Catch-all with FULL error details for diagnosis (status 200 вЂ” Vercel truncates 500 bodies)
    const fullError = `${error.name || 'Error'}: ${msg}`.substring(0, 400);
    console.error(`вќЊ [catch-all] Full error:`, error.name, msg, error.stack?.substring(0, 300));
    return res.status(200).json({ success: false, error: `РћС€РёР±РєР° РіРµРЅРµСЂР°С†РёРё: ${fullError}` });
  }
}
