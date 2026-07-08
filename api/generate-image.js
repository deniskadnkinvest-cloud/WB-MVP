import { alertOnError } from './_admin-alerts.js';
import sharp from 'sharp';
import { query as _dbQuery } from './_db.js';
import jwt from 'jsonwebtoken';
import { getPromptLang, PROMPTS } from './_prompts.js';

// Safety wrapper: if _db.js fails to load, provide clear error instead of "ReferenceError: _db is not defined"
const query = (...args) => {
  if (typeof _dbQuery !== 'function') {
    throw new Error(`DB module not loaded: query is ${typeof _dbQuery}. Check _db.js and DATABASE_URL env var.`);
  }
  return _dbQuery(...args);
};

const JWT_SECRET = process.env.JWT_SECRET || 'vton-secret-2026';

// Р С’РЎвЂљР С•Р СР В°РЎР‚Р Р…Р С• Р С‘Р Р…Р С”РЎР‚Р ВµР СР ВµР Р…РЎвЂљР С‘РЎР‚РЎС“Р ВµРЎвЂљ Р С–Р В»Р С•Р В±Р В°Р В»РЎРЉР Р…РЎвЂ№Р в„– РЎРѓРЎвЂЎРЎвЂРЎвЂљРЎвЂЎР С‘Р С” Р Р† PostgreSQL
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

let generationColumnsCache = null;

async function getGenerationColumns() {
  if (generationColumnsCache) return generationColumnsCache;

  const result = await query(`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'generations'
  `);

  generationColumnsCache = new Map(
    result.rows.map(row => [
      row.column_name,
      {
        dataType: row.data_type || '',
        columnDefault: row.column_default || null,
      },
    ])
  );

  return generationColumnsCache;
}

function getGenerationType(reqBody = {}) {
  if (reqBody?.isUgcMode) return 'ugc';
  if (reqBody?.isModelCard) return 'model';
  if (reqBody?.isQuickCard) return 'quick';
  if (reqBody?.isProductMode || reqBody?.isCardDesign) return 'product';
  if (reqBody?.isCalibration) return 'calibration';
  return 'fashion';
}

async function resolveGenerationUserId(userId, columns) {
  const userColumn = columns.get('user_id');
  if (!userColumn) return undefined;

  const dbUser = await findBillingUser({ uid: userId }).catch(() => null);
  const dataType = userColumn.dataType || '';
  if (dataType.includes('integer') || dataType === 'bigint' || dataType === 'smallint') {
    return dbUser?.id || null;
  }

  return userId || dbUser?.telegram_id || null;
}

function shouldInsertGenerationId(columns) {
  const idColumn = columns.get('id');
  if (!idColumn) return false;
  if (idColumn.columnDefault) return false;
  return /char|text/i.test(idColumn.dataType || '');
}

// Р вЂ”Р В°Р С—Р С‘РЎРѓРЎвЂ№Р Р†Р В°Р ВµРЎвЂљ Р С—Р С•Р Т‘РЎР‚Р С•Р В±Р Р…РЎвЂ№Р в„– Р В»Р С•Р С– Р С–Р ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘Р С‘ Р Р† PostgreSQL
async function saveGenerationLog({ userId, success, imageUrl, error, reqBody, durationMs }) {
  try {
    const generationId = `gen_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const columns = await getGenerationColumns();
    const type = getGenerationType(reqBody);
    const garmentUrls = reqBody?.garmentImageUrls || [];
    const attributes = reqBody?.attributes || null;

    if (columns.size === 0) {
      console.warn('[stats log] generations table has no visible columns; skipping');
      return;
    }

    const metadata = {
      type,
      aspectRatio: reqBody?.aspectRatio || '3:4',
      garmentUrls,
      modelPreset: reqBody?.modelPreset || '',
      posePreset: reqBody?.posePreset || '',
      backgroundPreset: reqBody?.backgroundPreset || '',
      cameraAngle: reqBody?.cameraAngle || '',
      categoryId: reqBody?.categoryId || '',
      withHumanModel: Boolean(reqBody?.withHumanModel),
      isCardDesign: Boolean(reqBody?.isCardDesign),
      cardStyle: reqBody?.quickCardStyle || reqBody?.cardStyle || '',
      isBeautyMode: Boolean(reqBody?.isBeautyMode),
      isPhotoEdit: Boolean(reqBody?.isPhotoEdit),
      editInstruction: reqBody?.editInstruction || '',
      customPoseText: reqBody?.customPoseText || '',
      attributes,
      userProductInfo: reqBody?.userProductInfo || '',
      quickPromptName: reqBody?.quickPromptName || '',
      isPhotoshoot: Boolean(reqBody?.isPhotoshoot),
      photoshootFrameIndex: reqBody?.photoshootFrameIndex || null,
      photoshootBatchSize: reqBody?.photoshootBatchSize || null,
    };

    const userValue = await resolveGenerationUserId(userId, columns);
    const valuesByColumn = {
      id: generationId,
      user_id: userValue,
      success: Boolean(success),
      status: success ? 'success' : 'error',
      duration_ms: durationMs || 0,
      credits_used: getGenerationCreditCost(reqBody),
      type,
      aspect_ratio: metadata.aspectRatio,
      garment_urls: JSON.stringify(garmentUrls),
      model_preset: metadata.modelPreset,
      pose_preset: metadata.posePreset,
      background_preset: metadata.backgroundPreset,
      camera_angle: metadata.cameraAngle,
      category_id: metadata.categoryId,
      with_human_model: metadata.withHumanModel,
      is_card_design: metadata.isCardDesign,
      card_style: metadata.cardStyle,
      is_beauty_mode: metadata.isBeautyMode,
      is_photo_edit: metadata.isPhotoEdit,
      edit_instruction: metadata.editInstruction,
      custom_pose_text: metadata.customPoseText,
      attributes: attributes ? JSON.stringify(attributes) : null,
      user_product_info: metadata.userProductInfo,
      quick_prompt_name: metadata.quickPromptName,
      image_url: imageUrl || null,
      result_url: imageUrl || null,
      prompt: metadata.modelPreset || metadata.posePreset || '',
      model: 'gpt-image-2-image-to-image',
      metadata: JSON.stringify(metadata),
      error: error || null,
    };

    const preferredColumns = [
      'id',
      'user_id',
      'success',
      'status',
      'duration_ms',
      'credits_used',
      'type',
      'aspect_ratio',
      'garment_urls',
      'model_preset',
      'pose_preset',
      'background_preset',
      'camera_angle',
      'category_id',
      'with_human_model',
      'is_card_design',
      'card_style',
      'is_beauty_mode',
      'is_photo_edit',
      'edit_instruction',
      'custom_pose_text',
      'attributes',
      'user_product_info',
      'quick_prompt_name',
      'image_url',
      'result_url',
      'prompt',
      'model',
      'metadata',
      'error',
    ];

    const insertColumns = preferredColumns.filter(column => {
      if (!columns.has(column)) return false;
      if (column === 'id' && !shouldInsertGenerationId(columns)) return false;
      return valuesByColumn[column] !== undefined;
    });

    if (insertColumns.length === 0) {
      console.warn('[stats log] generations insert has no matching columns; skipping');
      return;
    }

    const placeholders = insertColumns.map((_, idx) => `$${idx + 1}`).join(', ');
    const values = insertColumns.map(column => valuesByColumn[column]);

    await query(`
      INSERT INTO generations (${insertColumns.join(', ')})
      VALUES (${placeholders})
    `, values);

    console.log(`СЂСџвЂњР‰ [stats] Logged generation ${generationId} for user ${userId || 'anonymous'} (${success ? 'success' : 'failed'})`);
  } catch (e) {
    console.warn('[stats log] Failed to write generation log:', e.message);
  }
}

// РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’
// SKIN ULTRA-REALISM SYSTEM PROMPT (Р С—РЎР‚Р С‘Р СР ВµР Р…РЎРЏР ВµРЎвЂљРЎРѓРЎРЏ Р вЂњР вЂєР С›Р вЂР С’Р вЂєР В¬Р СњР С›)
// РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’
const SKIN_REALISM_PROMPT = `SKIN & FACE REALISM DIRECTIVE (MANDATORY РІР‚вЂќ HIGHEST PRIORITY):
RAW UNRETOUCHED PHOTOGRAPHY MODE. ZERO skin smoothing. ZERO beauty filters. ZERO frequency separation. ZERO airbrushing.
The skin MUST show real biological texture as captured by a 100mm macro lens at f/2.8:
- Visible individual pores at pixel level, natural sebum micro-shine on T-zone
- Subsurface scattering: blood vessels faintly visible under thin skin (temples, inner wrists, eyelids)
- Natural uneven skin tone, slight redness around nose/cheeks, subtle under-eye circles
- Micro-wrinkles around eyes when smiling, nasolabial folds appropriate to apparent age
- Fine vellus hair ("peach fuzz") visible on cheeks and jawline in side lighting
ANTI-RETOUCHING ENFORCEMENT: If the output skin looks like a magazine cover, porcelain, wax, or has "glow" РІР‚вЂќ it is WRONG. Re-render with MORE texture.
Eyes: natural moisture film with environment reflections, tiny visible capillaries in sclera, natural iris color variation.
The final image must look like an UNEDITED photo from a Canon R5 with 85mm f/1.4 lens РІР‚вЂќ raw, authentic, alive.`;

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
    ? 'MULTIPLE Wardrobe Assets are provided РІР‚вЂќ extract and drape ALL of them onto the New Actor simultaneously.'
    : '';

  // РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’
  // "COGNITIVE OVERRIDE" PROMPT РІР‚вЂќ XML-tagged mannequin illusion
  // РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’
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

const _KIE_API_KEY = process.env.KIE_API_KEY;
const TASK_URL = 'https://api.kie.ai/api/v1/jobs/createTask';
const GET_TASK_URL = 'https://api.kie.ai/api/v1/jobs/recordInfo?taskId=';
const FILE_UPLOAD_URL = 'https://kieai.redpandaai.co/api/file-base64-upload';
// KIE allows 100+ concurrent tasks per account (create limit 20/10s); 5 was our own bottleneck.
// 15 keeps big batches flowing well under KIE's create rate limit and the VPS memory budget.
const MAX_CONCURRENT_KIE_TASKS = Math.max(1, Number.parseInt(process.env.MAX_CONCURRENT_KIE_TASKS || '15', 10) || 15);
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

  if (['generate-missing-angle', 'edit-card'].includes(action)) return 1;
  if (action === 'create-persona') return 3;
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

// Converts any raw/technical/English generation error into a clear, friendly Russian message.
// The raw message is only logged (never shown), so no scary English or mojibake leaks to the UI.
function humanizeGenerationError(rawMessage) {
  const m = String(rawMessage || '').toLowerCase();
  if (/(sensitive|flag|moderation|nsfw|safety|violat|not allowed|content policy|inappropriate|prohibited)/.test(m)) {
    return '🛡️ Изображение не прошло модерацию ИИ: обнаружен чувствительный контент (например, слишком откровенная одежда или обнажённые участки тела). Попробуйте фото в более закрытой одежде или другой кадр.';
  }
  if (/(timed out|timeout|took too long|deadline)/.test(m)) {
    return '⏳ Генерация заняла слишком много времени и была прервана. Попробуйте ещё раз — обычно со второй попытки всё получается. Кредит за неудачную попытку возвращён.';
  }
  if (/(429|quota|resource_exhausted|rate limit|too many)/.test(m)) {
    return '⚡ Сейчас идёт слишком много генераций одновременно. Подождите 1–2 минуты и попробуйте снова.';
  }
  if (/(422|not supported|unsupported)/.test(m)) {
    return '⚠️ Это изображение не поддерживается моделью. Попробуйте другое фото — чёткое, хорошо освещённое, где человек или товар хорошо видны.';
  }
  if (/(400|invalid_argument|invalid request|bad request|malformed)/.test(m)) {
    return '⚠️ Некорректный запрос к генерации. Попробуйте изменить настройки или загрузить другое фото.';
  }
  if (/(network|econnrefused|etimedout|failed to download|fetch failed|socket|dns|enotfound)/.test(m)) {
    return '🌐 Не удалось связаться с сервисом генерации. Проверьте интернет и попробуйте ещё раз через минуту. Кредит возвращён.';
  }
  if (/(kie|task failed|no image|no taskid|resultjson|generation)/.test(m)) {
    return '🎨 Сервис генерации не смог создать изображение с этими данными. Попробуйте ещё раз или измените фото либо настройки.';
  }
  return '😔 Не удалось сгенерировать изображение. Попробуйте ещё раз. Если ошибка повторяется — напишите в поддержку.';
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

  // Client cancelled вЂ” credits already reserved, NOT refunded (user chose to cancel)
  req.on('aborted', () => {
    clientDisconnected = true;
    console.warn('[Client Aborted] generate-image request aborted вЂ” credits NOT refunded (user cancelled)');
  });
  res.on('close', () => {
    if (!res.writableEnded) {
      clientDisconnected = true;
      console.warn('[Client Aborted] generate-image response closed вЂ” credits NOT refunded (user cancelled)');
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

      if (reservation && !reservation.refunded && isJsonObject) {
        if (clientDisconnected && finalBody.success === true) {
          // Generation finished but client is gone вЂ” credits stay consumed
          reservation.completed = true;
          console.log(`[Credit Committed-NoClient] user=${reservation.uid} amount=${reservation.amount} request=${reservation.requestId}`);
          finalBody = { success: false, error: 'Р“РµРЅРµСЂР°С†РёСЏ Р·Р°РІРµСЂС€РёР»Р°СЃСЊ РїРѕСЃР»Рµ РѕС‚РјРµРЅС‹.' };
        } else if (clientDisconnected && finalBody.success === false) {
          // Generation failed AND client is gone вЂ” refund (server-side failure, not user fault)
          const refund = await safeRefundCreditReservation(reservation, 'generation failed after client disconnected');
          finalBody = { ...finalBody, creditsRemaining: refund?.creditsRemaining ?? reservation.creditsRemaining };
        } else if (finalBody.success === false) {
          // Generation failed, client still connected вЂ” refund
          const refund = await safeRefundCreditReservation(reservation, finalBody.error || finalBody.details || 'generation failed');
          if (refund?.creditsRemaining !== undefined) {
            finalBody = { ...finalBody, creditsRemaining: refund.creditsRemaining };
          }
        } else if (finalBody.success === true) {
          // SUCCESS вЂ” commit
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

async function executeKieTask(prompt, imageInputs = [], modelName = "gpt-image-2-image-to-image", aspectRatio = "auto", resolution = "1K") {
  const rawKey = process.env.KIE_API_KEY;
  if (!rawKey) throw new Error("API key missing. Set KIE_API_KEY in .env");
  // Strip BOM, zero-width chars, and whitespace that PowerShell/editors inject
  const apiKey = rawKey.replace(/[\uFEFF\u200B\u200C\u200D\uFFFE\r\n]/g, '').trim();

  // Upload base64 images to KIE File Upload API first (KIE.ai requires URLs, not inline base64)
  let uploadedImageUrls = [];
  if (imageInputs.length > 0) {
    console.log(`   Checking/Uploading ${imageInputs.length} image(s) to KIE File Upload API...\n   ImageInputs: `, imageInputs.map(img => img.substring(0, 60) + '...'));
    // Upload all input images in PARALLEL (was a sequential for-await loop → slow for multi-photo
    // generations). Promise.all preserves order; nulls (failed uploads) are filtered out.
    uploadedImageUrls = (await Promise.all(imageInputs.map((img, idx) => {
      if (img.startsWith('http://') || img.startsWith('https://')) return img;
      return uploadBase64ToKie(img, apiKey, idx);
    }))).filter(Boolean);
    console.log(`   Uploaded ${uploadedImageUrls.length}/${imageInputs.length} images: `, uploadedImageUrls);
  }

  const reqBody = {
    model: modelName,
    input: {
      prompt: prompt,
      input_urls: uploadedImageUrls,
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
  console.log(`РІРЏС– KIE.ai Task created. Model: ${modelName}. TaskID: ${taskId}. Polling...`);

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
      console.warn(`   РІС™В РїС‘РЏ KIE poll network error: ${err.message}`);
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

// в•ђв•ђв•ђ POST-PROCESS: Flip frame [3] to guarantee mirror-opposite angle в•ђв•ђв•ђ
// KIE.ai consistently generates both 3/4 frames facing the same direction.
// This function crops frame [3], flips it horizontally, and pastes it back.
// Layout: TOP ROW = 4 equal portrait frames, BOTTOM = 1 wide full-body frame.
// Frame [3] is the 3rd portrait in the top row (index 2, 0-based).
async function _flipPersonaFrame3(base64Data) {
  try {
    const rawBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const buffer = Buffer.from(rawBase64, 'base64');

    const metadata = await sharp(buffer).metadata();
    const { width, height } = metadata;

    // NEW LAYOUT: LEFT zone = 3 portraits (~70% width), RIGHT = full-body (~30%)
    // Each portrait width в‰€ totalWidth * 0.7 / 3 в‰€ totalWidth * 0.233
    // Frame [3] is the 3rd portrait (index 2, 0-based)
    const portraitWidth = Math.floor(width * 0.233);
    const frame3Left = portraitWidth * 2;

    // Portrait height = roughly 92% of total image height (bottom 8% is padding/footer)
    const portraitHeight = Math.floor(height * 0.92);

    // SMART SPLIT: flip only face area (top 85%), leave label area (bottom 15%) intact
    const labelHeight = Math.floor(portraitHeight * 0.15);
    const faceHeight = portraitHeight - labelHeight;

    // Extract ONLY the face area of frame [3] (no label)
    const faceArea = await sharp(buffer)
      .extract({ left: frame3Left, top: 0, width: portraitWidth, height: faceHeight })
      .toBuffer();

    // Flip the face horizontally
    const flippedFace = await sharp(faceArea).flop().toBuffer();

    // Paste only the flipped face back вЂ” label at bottom stays untouched
    const result = await sharp(buffer)
      .composite([{ input: flippedFace, left: frame3Left, top: 0 }])
      .toBuffer();

    console.log('[PostProcess] Frame [3] face flipped (label preserved). w=%d h=%d fw=%d fh=%d', width, height, portraitWidth, faceHeight);
    return result.toString('base64');
  } catch (err) {
    console.warn('[PostProcess] flipPersonaFrame3 failed, returning original:', err.message);
    return base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  }
}

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
    console.warn(`РІС™В РїС‘РЏ Failed to download image from ${url.substring(0, 50)}...:`, err.message);
    return null;
  }
};

// РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’
// BODY TYPE METRIC INJECTOR
// Converts vague artistic body descriptions into hard clinical metrics
// that Gemini can't "smooth away" into average proportions.
// РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’

// РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’

// РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’
// GENDER-ISOLATED ATTRIBUTE DICTIONARIES
// РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’
const DICT_FEMALE = {
  'Р ТђРЎС“Р Т‘Р С•РЎвЂ°Р В°Р Р†Р С•Р Вµ': '<BODY_OVERRIDE>TARGET: SLENDER PETITE FEMALE. Very thin feminine frame, delicate narrow shoulders, slender limbs, visible collarbones. Deform clothing to drape over a noticeably thin female body.</BODY_OVERRIDE>',
  'Р РЋР С—Р С•РЎР‚РЎвЂљР С‘Р Р†Р Р…Р С•Р Вµ': '<BODY_OVERRIDE>TARGET: FIT FEMALE / YOGA BODY. Toned feminine figure, subtle healthy muscle definition on arms and core. Maintain soft feminine curves and female breast contour. Adjust clothing for an active female fit.</BODY_OVERRIDE>',
  'Р РЋРЎР‚Р ВµР Т‘Р Р…Р ВµР Вµ': '<BODY_OVERRIDE>TARGET: AVERAGE NORMAL FEMALE. Standard healthy feminine proportions, natural female curves, soft body lines.</BODY_OVERRIDE>',
  'Р СџР С•Р В»Р Р…Р С•Р Вµ': '<BODY_OVERRIDE>TARGET: OBESE PLUS-SIZE FEMALE. Very heavy-set, visibly fat body, thick heavy neck, prominent double chin, chubby cheeks, round chubby face, wide thick waist, large round belly, heavy arms, thick thighs. Expand all clothing extremely to fit a very heavy plus-size woman (US clothing size 3XL, BMI 35+). Do NOT make her waist slim or face thin. She must look explicitly fat.</BODY_OVERRIDE>',
  'Р СљРЎС“РЎРѓР С”РЎС“Р В»Р С‘РЎРѓРЎвЂљР С•Р Вµ': '<BODY_OVERRIDE>TARGET: STRONG FEMALE ATHLETE / CROSSFIT BUILD. Strictly retain FEMININE body structure. Defined abdominal muscles, strong toned female arms. ABSOLUTELY NO masculine chest, NO thick male neck. Deform clothing to fit a very muscular BIOLOGICAL WOMAN.</BODY_OVERRIDE>',
  'Р вЂРЎР‚РЎР‹Р Р…Р ВµРЎвЂљР С”Р В°': '<HAIR_COLOR>Deep rich dark brunette brown female hair</HAIR_COLOR>',
  'Р РЃР В°РЎвЂљР ВµР Р…Р С”Р В°': '<HAIR_COLOR>Warm chestnut brown female hair</HAIR_COLOR>',
  'Р вЂР В»Р С•Р Р…Р Т‘Р С‘Р Р…Р С”Р В°': '<HAIR_COLOR>Bright golden blonde female hair</HAIR_COLOR>',
  'Р В РЎвЂ№Р В¶Р В°РЎРЏ': '<HAIR_COLOR>Vibrant copper ginger red female hair</HAIR_COLOR>',
  'Р В§РЎвЂРЎР‚Р Р…РЎвЂ№Р Вµ': '<HAIR_COLOR>Jet black female hair, pure dark</HAIR_COLOR>',
  'Р РЋР ВµР Т‘РЎвЂ№Р Вµ': '<HAIR_COLOR>Elegant silver-gray white mature female hair</HAIR_COLOR>',
  'Р С™Р С•РЎР‚Р С•РЎвЂљР С”Р С‘Р Вµ': '<HAIR_LENGTH>Chic short feminine haircut, pixie cut or short bob framing a female face.</HAIR_LENGTH>',
  'Р РЋРЎР‚Р ВµР Т‘Р Р…Р С‘Р Вµ': '<HAIR_LENGTH>Medium-length elegant female hair, reaching the collarbones.</HAIR_LENGTH>',
  'Р вЂќР В»Р С‘Р Р…Р Р…РЎвЂ№Р Вµ': '<HAIR_LENGTH>Long, beautiful flowing feminine hair cascading well past the chest.</HAIR_LENGTH>',
  'Р вЂРЎР‚Р С‘РЎвЂљР В°РЎРЏ': '<HAIR_LENGTH>TARGET: COMPLETELY BALD FEMALE / SHAVED HEAD. Bare scalp on a biological woman. CRITICAL: Maintain highly elegant, delicate FEMININE facial bone structure and flawless makeup. Do NOT make her look masculine.</HAIR_LENGTH>',
  'Р СњР ВµР в„–РЎвЂљРЎР‚Р В°Р В»РЎРЉР Р…Р В°РЎРЏ': '<EXPRESSION>Calm, relaxed feminine face, soft neutral gaze, relaxed lips.</EXPRESSION>',
  'Р вЂєРЎвЂР С–Р С”Р В°РЎРЏ РЎС“Р В»РЎвЂ№Р В±Р С”Р В°': '<EXPRESSION>Gentle, warm, inviting feminine smile, soft friendly eyes.</EXPRESSION>',
  'Р РЋР ВµРЎР‚РЎРЉРЎвЂР В·Р Р…Р В°РЎРЏ': '<EXPRESSION>Intense high-fashion editorial female look, striking feminine features, slight pout, no smile.</EXPRESSION>',
  'Р Р€Р Р†Р ВµРЎР‚Р ВµР Р…Р Р…Р В°РЎРЏ': '<EXPRESSION>Powerful, confident woman, chin slightly raised, commanding gaze.</EXPRESSION>',
  'Р вЂќР ВµРЎР‚Р В·Р С”Р В°РЎРЏ': '<EXPRESSION>Fierce femme-fatale attitude, seductive or playful smirk, bold confident female energy.</EXPRESSION>',
  'Р Р€РЎв‚¬Р С‘': '<PIERCING>MANDATORY RENDER: Shiny metallic earrings clearly visible in the woman\'s earlobes.</PIERCING>',
  'Р СњР С•РЎРѓ': '<PIERCING>MANDATORY RENDER: Delicate female nose ring/stud piercing clearly visible on her nostril.</PIERCING>',
  'Р Р€РЎв‚¬Р С‘ + Р СњР С•РЎРѓ': '<PIERCING>MANDATORY RENDER: Feminine earrings AND a delicate nostril nose ring clearly visible.</PIERCING>',
  'Р СљР С‘Р Р…Р С‘Р СР В°Р В»Р С‘Р В·Р С': '<TATTOO>MANDATORY RENDER: Elegant minimalist fine-line black ink tattoos visible on exposed female skin.</TATTOO>',
  'Р В РЎС“Р С”Р В°Р Р†': '<TATTOO>MANDATORY RENDER: Detailed artistic tattoo sleeve fully covering one of the woman\'s arms.</TATTOO>',
  'Р РЃР ВµРЎРЏ': '<TATTOO>MANDATORY RENDER: Prominent artistic dark ink tattoo strictly located on the woman\'s neck/throat area. Do NOT thicken the neck!</TATTOO>',
};

const DICT_MALE = {
  'Р ТђРЎС“Р Т‘Р С•РЎвЂ°Р В°Р Р†Р С•Р Вµ': '<BODY_OVERRIDE>TARGET: LEAN/SLIM MALE. Lanky boyish build, narrow shoulders, thin masculine arms, low body fat. Force clothing to drape loosely on a thin male frame.</BODY_OVERRIDE>',
  'Р РЋР С—Р С•РЎР‚РЎвЂљР С‘Р Р†Р Р…Р С•Р Вµ': '<BODY_OVERRIDE>TARGET: FIT ATHLETIC MALE. Gym-goer / swimmer physique, defined masculine chest and arms, flat core, broad shoulders. Reshape clothing to highlight athletic male contours.</BODY_OVERRIDE>',
  'Р РЋРЎР‚Р ВµР Т‘Р Р…Р ВµР Вµ': '<BODY_OVERRIDE>TARGET: AVERAGE MALE. Standard everyday male body, regular build, healthy proportions.</BODY_OVERRIDE>',
  'Р СџР С•Р В»Р Р…Р С•Р Вµ': '<BODY_OVERRIDE>TARGET: OBESE HEAVY-SET MALE. Visibly overweight fat man, thick heavy neck, prominent double chin, round chubby face, large portly belly, broad heavy waist, thick arms. Expand all clothing extremely to fit a very heavy male figure (US clothing size 3XL, BMI 35+). He must look explicitly fat.</BODY_OVERRIDE>',
  'Р СљРЎС“РЎРѓР С”РЎС“Р В»Р С‘РЎРѓРЎвЂљР С•Р Вµ': '<BODY_OVERRIDE>TARGET: HYPER-MUSCULAR MALE BODYBUILDER. Massive masculine build. Hyper-defined biceps, broad powerful shoulders (V-taper), thick masculine neck, heavy chest muscles. Stretch clothing extremely tightly across massive male muscles.</BODY_OVERRIDE>',
  'Р вЂРЎР‚РЎР‹Р Р…Р ВµРЎвЂљ': '<HAIR_COLOR>Deep rich dark brunette brown male hair</HAIR_COLOR>',
  'Р РЃР В°РЎвЂљР ВµР Р…': '<HAIR_COLOR>Warm chestnut brown male hair</HAIR_COLOR>',
  'Р вЂР В»Р С•Р Р…Р Т‘Р С‘Р Р…': '<HAIR_COLOR>Bright golden blonde male hair</HAIR_COLOR>',
  'Р В РЎвЂ№Р В¶Р С‘Р в„–': '<HAIR_COLOR>Vibrant copper ginger red male hair</HAIR_COLOR>',
  'Р В§РЎвЂРЎР‚Р Р…РЎвЂ№Р Вµ': '<HAIR_COLOR>Jet black male hair, pure dark</HAIR_COLOR>',
  'Р РЋР ВµР Т‘РЎвЂ№Р Вµ': '<HAIR_COLOR>Silver fox, sophisticated silver-gray white mature male hair</HAIR_COLOR>',
  'Р С™Р С•РЎР‚Р С•РЎвЂљР С”Р С‘Р Вµ': '<HAIR_LENGTH>Classic short male haircut, neat fade or styled crop.</HAIR_LENGTH>',
  'Р РЋРЎР‚Р ВµР Т‘Р Р…Р С‘Р Вµ': '<HAIR_LENGTH>Medium-length male hair, stylish modern flow or surfer look.</HAIR_LENGTH>',
  'Р вЂќР В»Р С‘Р Р…Р Р…РЎвЂ№Р Вµ': '<HAIR_LENGTH>Long masculine hair, reaching shoulders, Viking or rockstar aesthetic.</HAIR_LENGTH>',
  'Р вЂРЎР‚Р С‘РЎвЂљРЎвЂ№Р в„–': '<HAIR_LENGTH>TARGET: COMPLETELY BALD MALE. Clean shaved masculine scalp, strong skull shape, sharp male jawline.</HAIR_LENGTH>',
  'Р СњР ВµР в„–РЎвЂљРЎР‚Р В°Р В»РЎРЉР Р…Р В°РЎРЏ': '<EXPRESSION>Calm, stoic masculine face, relaxed strong jaw, steady gaze.</EXPRESSION>',
  'Р вЂєРЎвЂР С–Р С”Р В°РЎРЏ РЎС“Р В»РЎвЂ№Р В±Р С”Р В°': '<EXPRESSION>Approachable, friendly male smile, warm eyes.</EXPRESSION>',
  'Р РЋР ВµРЎР‚РЎРЉРЎвЂР В·Р Р…РЎвЂ№Р в„–': '<EXPRESSION>Intense, sharp masculine gaze, serious focused editorial look, furrowed brow.</EXPRESSION>',
  'Р Р€Р Р†Р ВµРЎР‚Р ВµР Р…Р Р…РЎвЂ№Р в„–': '<EXPRESSION>Strong alpha presence, self-assured male expression, solid eye contact.</EXPRESSION>',
  'Р вЂќР ВµРЎР‚Р В·Р С”Р С‘Р в„–': '<EXPRESSION>Rebellious, edgy masculine attitude, defiant smirk, squinted challenging eyes.</EXPRESSION>',
  'Р Р€РЎв‚¬Р С‘': '<PIERCING>MANDATORY RENDER: Shiny metallic stud/hoop earrings clearly visible in the man\'s earlobes.</PIERCING>',
  'Р СњР С•РЎРѓ': '<PIERCING>MANDATORY RENDER: Masculine nose ring/stud piercing clearly visible on his nostril.</PIERCING>',
  'Р Р€РЎв‚¬Р С‘ + Р СњР С•РЎРѓ': '<PIERCING>MANDATORY RENDER: Male earrings AND a nostril nose ring clearly visible.</PIERCING>',
  'Р СљР С‘Р Р…Р С‘Р СР В°Р В»Р С‘Р В·Р С': '<TATTOO>MANDATORY RENDER: Sharp minimalist fine-line black ink tattoos visible on exposed male skin.</TATTOO>',
  'Р В РЎС“Р С”Р В°Р Р†': '<TATTOO>MANDATORY RENDER: Dense, dark ink FULL TATTOO SLEEVE completely covering ONE ENTIRE ARM.</TATTOO>',
  'Р РЃР ВµРЎРЏ': '<TATTOO>MANDATORY RENDER: Prominent artistic dark ink tattoo strictly located on the man\'s neck/throat area.</TATTOO>',
};

// РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’
// POSE LIBRARIES (50 female + 50 male)
// РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’
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

// РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’
// BIOMETRIC NOISE + POSE SELECTOR
// РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’
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
  if (/\b(male|man|boy|guy|old man|мужчина|парень|дед|мальчик|дедушка|мужск|мужской|славянин|азиат|европеец|африканец|латиноамериканец)\b/i.test(lower)) return 'male';
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
    : '<GENDER_LOCK>BIOLOGICAL FEMALE. You MUST strictly enforce 100% biological female anatomy: female breast contour, narrow waist, highly feminine facial features, DELICATE FEMININE HANDS (slender fingers, narrow wrists, soft skin, NO masculine knuckles or veins), and elegant feminine posture. Under NO circumstances should ANY body part РІР‚вЂќ especially hands and arms РІР‚вЂќ look masculine, even if she is muscular or bald. Every visible limb must read as unmistakably female.</GENDER_LOCK>';
}

// РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’
// SKIN RENDER MODES
// РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’
const SKIN_BEAUTY_PROMPT = `<RENDER_PIPELINE>
MODE: HIGH-END BEAUTY FASHION EDITORIAL.
DIRECTIVE: Apply high-end commercial fashion retouching. Flawless, perfectly smooth, airbrushed skin. Glowing complexion, perfectly even skin tone, soft flattering studio lighting. Idealized model features.
</RENDER_PIPELINE>`;

// РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’
// ATTRIBUTE DIRECTIVE BUILDER (gender-aware)
// РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’
function buildAttributeDirectives(attributes, gender) {
  if (!attributes || typeof attributes !== 'object') return '';
  const dict = gender === 'male' ? DICT_MALE : DICT_FEMALE;
  const directives = [];
  Object.entries(attributes).forEach(([key, val]) => {
    if (!val) return;
    if (val === 'Р СњР ВµРЎвЂљ' || (Array.isArray(val) && val.length === 1 && val[0] === 'Р СњР ВµРЎвЂљ')) {
      if (key === 'tattoo') directives.push('<TATTOO_CONSTRAINT>ABSOLUTELY NO TATTOOS. Completely pure, clean, unblemished skin. Zero ink anywhere.</TATTOO_CONSTRAINT>');
      if (key === 'piercing') directives.push('<PIERCING_CONSTRAINT>ABSOLUTELY NO PIERCINGS. Clean unadorned face and ears, zero metal.</PIERCING_CONSTRAINT>');
      return;
    }
    if (Array.isArray(val)) {
      val.filter(x => x !== 'Р СњР ВµРЎвЂљ').forEach(item => { if (dict[item]) directives.push(dict[item]); });
    } else {
      if (dict[val]) directives.push(dict[val]);
    }
  });
  return directives.join('\n');
}

function enhanceBodyMetrics(preset, editCmd) {
  let enhanced = preset || '';
  if (editCmd && editCmd.trim()) {
    enhanced += `\nСЂСџвЂќТ‘ PRIORITY EDIT OVERRIDE: "${editCmd.trim()}". Apply this transformation flawlessly.`;
  }
  return enhanced;
}
// РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’
// GARMENT SANITIZER РІР‚вЂќ destroys facial data with solid black box
// Gaussian blur leaves low-frequency data (skull shape, jawline shadows)
// that Gemini can reconstruct. Solid black box = total pixel destruction.
// РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’
async function sanitizeGarmentImage(imageBase64, index) {
  // Sanitization skipped РІР‚вЂќ nano-banana-2 handles garment reference via text prompt.
  // Direct image editing requires separate model which is deprecated.
  console.log(`   РІвЂћв„–РїС‘РЏ Garment ${index + 1}: sanitization skipped (using direct reference)`);
  return imageBase64;
}

// РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’
// PRODUCT MODE РІР‚вЂќ XML-РЎвЂљР ВµР С–Р С‘РЎР‚Р С•Р Р†Р В°Р Р…Р Р…Р В°РЎРЏ РЎРѓР С‘РЎРѓРЎвЂљР ВµР СР В° Р С—РЎР‚Р С•Р СР С—РЎвЂљР С•Р Р† Р Т‘Р В»РЎРЏ Р С—РЎР‚Р ВµР Т‘Р СР ВµРЎвЂљР Р…Р С•Р в„– РЎРѓРЎР‰Р ВµР СР С”Р С‘
// Р С’Р Р…Р В°Р В»Р С•Р С– Fashion Mode cognitive_override, Р Р…Р С• РЎРѓ Р С›Р вЂР В Р С’Р СћР СњР С›Р в„ў Р В»Р С•Р С–Р С‘Р С”Р С•Р в„–:
// "Р ВРЎРѓРЎвЂ¦Р С•Р Т‘Р Р…РЎвЂ№Р в„– РЎвЂљР С•Р Р†Р В°РЎР‚ = Sacred Blueprint, Р В·Р В°Р СР С•РЎР‚Р С•Р В·РЎРЉ Р ВµР С–Р С• Р С—Р С‘Р С”РЎРѓР ВµР В»Р С‘ 1:1"
// РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’

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

  // РІвЂќР‚РІвЂќР‚ Full CGI configs from Deep Think Parts 1-3 РІвЂќР‚РІвЂќР‚
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

  // Р В¤Р С•Р В»Р В±РЎРЊР С” Р Т‘Р В»РЎРЏ Р Р…Р ВµР С‘Р В·Р Р†Р ВµРЎРѓРЎвЂљР Р…РЎвЂ№РЎвЂ¦ Р С”Р В°РЎвЂљР ВµР С–Р С•РЎР‚Р С‘Р в„–
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
 * Р РЋР С•Р В±Р С‘РЎР‚Р В°Р ВµРЎвЂљ Р С—Р С•Р В»Р Р…РЎвЂ№Р в„– XML-Р С—РЎР‚Р С•Р СР С—РЎвЂљ Р Т‘Р В»РЎРЏ Р С—РЎР‚Р ВµР Т‘Р СР ВµРЎвЂљР Р…Р С•Р в„– РЎвЂћР С•РЎвЂљР С•РЎРѓРЎР‰Р ВµР СР С”Р С‘ РЎвЂљР С•Р Р†Р В°РЎР‚Р С•Р Р†
 * Р С’Р Р…Р В°Р В»Р С•Р С– buildMasterPrompt() Р Т‘Р В»РЎРЏ Fashion Mode, Р Р…Р С• РЎРѓ Р С•Р В±РЎР‚Р В°РЎвЂљР Р…Р С•Р в„– Р В»Р С•Р С–Р С‘Р С”Р С•Р в„–
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

  // РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’
  // COMPOSITION-SPECIFIC DIRECTIVES РІР‚вЂќ Р В¶РЎвЂРЎРѓРЎвЂљР С”Р С‘Р Вµ Р В±Р В»Р С•Р С”Р С‘ Р Т‘Р В»РЎРЏ Р С”Р В°Р В¶Р Т‘Р С•Р С–Р С• РЎвЂљР С‘Р С—Р В° Р С”Р В°Р Т‘РЎР‚Р В°
  // РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’
  const COMPOSITION_DIRECTIVES = {
    in_hand: `<composition_directive type="IN_HAND">
MANDATORY HAND-HELD PRODUCT SHOT. THIS OVERRIDES ALL OTHER COMPOSITION INSTRUCTIONS.
- A realistic human HAND must be the PRIMARY visual element alongside the product. The hand physically GRIPS and HOLDS the product.
- FRAMING: Close-up shot. Only the hand, wrist, and product are in frame. Do NOT show full body, do NOT show legs, do NOT show a person standing.
- The product MUST be held UP in the hand РІР‚вЂќ NOT placed on any surface, pedestal, podium, platform, table, or stand.
- NO PODIUMS. NO PEDESTALS. NO MARBLE PLATFORMS. The product is AIRBORNE, held by the human hand.
- Show accurate scale: the product size must be proportional to the human hand.
- Background: soft blurred bokeh (shallow depth of field, f/1.8). The background is abstract and out of focus.
- The hand enters the frame naturally from the bottom or side of the composition.
- Hand must have natural skin texture, visible knuckles, realistic finger positioning, and honest material physics.
- If the product is a pillow, bag, bottle, or any non-wearable item РІР‚вЂќ the hand HOLDS it up, does NOT wear it, drape it, or place it on the body.
</composition_directive>`,

    macro: `<composition_directive type="MACRO">
MANDATORY: Extreme close-up macro photography.
- Fill 80-90% of the frame with the product РІР‚вЂќ show intricate surface details, textures, labels, and micro-features.
- Ultra-shallow depth of field (f/2.0 or wider) РІР‚вЂќ razor-sharp focus on the product surface, everything else melts into creamy bokeh.
- Show material micro-texture: fabric weave, plastic grain, metal brushing, glass refraction.
- Camera distance: extremely close, as if using a dedicated macro lens.
- No full product silhouette РІР‚вЂќ this is about DETAIL, not overview.
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
- This angle reveals the product's three-dimensional volume РІР‚вЂќ showing both the front label AND the side profile.
- Elegant volumetric lighting with dramatic depth of field.
- The product appears sculptural and premium from this dynamic viewing angle.
</composition_directive>`,

    still_life: `<composition_directive type="STILL_LIFE">
MANDATORY: Classic front-facing product portrait (Р Р…Р В°РЎвЂљРЎР‹РЎР‚Р СР С•РЎР‚РЎвЂљ).
- Centered composition, eye-level camera aligned with the product's center of mass.
- The product faces the camera directly РІР‚вЂќ full label visibility, symmetrical framing.
- Professional studio lighting with clean backdrop.
- Standard e-commerce product hero shot.
</composition_directive>`
  };

  const compositionDirective = COMPOSITION_DIRECTIVES[compositionId] || COMPOSITION_DIRECTIVES.still_life;

  // Р вЂР В»Р С•Р С” Р СР С•Р Т‘Р ВµР В»Р С‘-РЎвЂЎР ВµР В»Р С•Р Р†Р ВµР С”Р В°: Р С”Р С•Р С–Р Т‘Р В° Р С—РЎР‚Р С•Р Т‘Р В°Р Р†Р ВµРЎвЂ  РЎвЂ¦Р С•РЎвЂЎР ВµРЎвЂљ Р С—Р С•Р С”Р В°Р В·Р В°РЎвЂљРЎРЉ РЎвЂљР С•Р Р†Р В°РЎР‚ Р Р†Р СР ВµРЎРѓРЎвЂљР Вµ РЎРѓ Р В¶Р С‘Р Р†Р С•Р в„– Р СР С•Р Т‘Р ВµР В»РЎРЉРЎР‹
  const humanModelBlock = withHumanModel && humanModelPrompt ? `
<human_model_integration>
CRITICAL DUAL-SUBJECT PROTOCOL:
This shot contains TWO subjects: the PRODUCT and a LIVING HUMAN MODEL.

HUMAN MODEL PROFILE: "${humanModelPrompt}"
- Generate a photorealistic living human model matching the profile above.
- The model must naturally interact with the product: holding it, demonstrating it, using it, or presenting it.
- The PRODUCT remains the HERO РІР‚вЂќ the model is the SUPPORTING ACTOR. The product must be clearly visible, unobstructed, and prominently featured.
- Do NOT let the model's hands, arms, or body obscure the product label, brand, or key visual features.

<ANATOMICAL_INTEGRITY РІР‚вЂќ ABSOLUTE RULE>
The human model has EXACTLY TWO hands and EXACTLY TWO arms.
ALL visible hands in the image MUST be anatomically connected to the model's body РІР‚вЂќ attached at the wrist, forearm, and shoulder.
Do NOT generate any disembodied, floating, detached, or extra hands/arms.
NO phantom limbs. NO third hand. Every hand visible in the frame belongs to the single human model.
If the product needs to be held РІР‚вЂќ the model holds it with ONE or BOTH of her own two hands.
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

  // Р вЂќР В»РЎРЏ Р’В«Р СћР С•Р Р†Р В°РЎР‚ Р Р† РЎР‚РЎС“Р С”Р ВµР’В» РІР‚вЂќ Р С•РЎвЂЎР С‘РЎвЂ°Р В°Р ВµР С РЎвЂћР С•Р Р… Р С•РЎвЂљ Р С—Р С•Р Т‘Р С‘РЎС“Р СР С•Р Р†/Р С—Р В»Р В°РЎвЂљРЎвЂћР С•РЎР‚Р С, Р С”Р С•РЎвЂљР С•РЎР‚РЎвЂ№Р Вµ Р С”Р С•Р Р…РЎвЂћР В»Р С‘Р С”РЎвЂљРЎС“РЎР‹РЎвЂљ РЎРѓ Р С”Р С•Р СР С—Р С•Р В·Р С‘РЎвЂ Р С‘Р ВµР в„–
  const sanitizedBg = compositionId === 'in_hand'
    ? bgPrompt.replace(/,?\s*(elegant\s+)?marble\s+podium\s+platform/gi, '').replace(/,?\s*pedestal/gi, '').replace(/,?\s*platform/gi, '').replace(/,?\s*podium/gi, '').trim()
    : bgPrompt;

  const integrationText = withHumanModel
    ? 'The human model holds and interacts with the product naturally. The product is supported by the model\'s own hands РІР‚вЂќ NOT placed on any surface. All hands visible belong to one single human body.'
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
- The FIRST input image(s) are PRODUCT REFERENCE photos ("Sacred Blueprint") РІР‚вЂќ preserve their appearance 1:1.
- Any SUBSEQUENT input image(s) are HUMAN MODEL APPEARANCE REFERENCE РІР‚вЂќ use ONLY for the model's face, hair, body type. Do NOT extract hands, limbs, or body parts from these reference images into the scene separately.
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


const _QUICK_CARD_PROMPT_NATURAL = `You are an elite marketplace creative director, product photographer, conversion designer, Russian e-commerce copywriter, visual merchandising expert, and premium e-commerce art director.

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
The product must be the hero and occupy approximately 60РІР‚вЂњ72% of the composition.
The design must remain readable as a small marketplace thumbnail.

Use a clean composition with strong hierarchy:

1. Hero product image
2. Main Russian headline
3. 3РІР‚вЂњ5 short benefit chips
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
The headline must be 2РІР‚вЂњ6 words.
Each benefit chip must be 1РІР‚вЂњ4 words.
Total visible text should be minimal and premium.

The copy must instantly explain:

* what the product is;
* why it looks desirable;
* what practical or emotional benefit it gives;
* why the buyer should click.

Use benefit language like:
"Р вЂќР В»РЎРЏ Р Т‘Р С•Р СР В°"
"Р СњР В° Р С”Р В°Р В¶Р Т‘РЎвЂ№Р в„– Р Т‘Р ВµР Р…РЎРЉ"
"Р РЋРЎвЂљР С‘Р В»РЎРЉР Р…РЎвЂ№Р в„– Р В°Р С”РЎвЂ Р ВµР Р…РЎвЂљ"
"Р СџРЎР‚Р С•Р Т‘РЎС“Р СР В°Р Р…Р Р…РЎвЂ№Р Вµ Р Т‘Р ВµРЎвЂљР В°Р В»Р С‘"
"Р Р€Р Т‘Р С•Р В±Р Р…Р С• Р С‘РЎРѓР С—Р С•Р В»РЎРЉР В·Р С•Р Р†Р В°РЎвЂљРЎРЉ"
"Р вЂєР ВµР С–Р С”Р С• РЎРѓР С•РЎвЂЎР ВµРЎвЂљР В°РЎвЂљРЎРЉ"
"Р СџРЎР‚Р ВµР СР С‘Р В°Р В»РЎРЉР Р…РЎвЂ№Р в„– Р Р†Р С‘Р Т‘"
"Р С™Р С•Р СР С—Р В°Р С”РЎвЂљР Р…РЎвЂ№Р в„– РЎвЂћР С•РЎР‚Р СР В°РЎвЂљ"
"Р СљРЎРЏР С–Р С”Р В°РЎРЏ РЎвЂћР В°Р С”РЎвЂљРЎС“РЎР‚Р В°"
"Р В§Р С‘РЎРѓРЎвЂљРЎвЂ№Р в„– РЎРѓР С‘Р В»РЎС“РЎРЊРЎвЂљ"
"Р С’Р С”Р С”РЎС“РЎР‚Р В°РЎвЂљР Р…Р С•Р Вµ РЎвЂ¦РЎР‚Р В°Р Р…Р ВµР Р…Р С‘Р Вµ"
"Р вЂќР В»РЎРЏ Р С—Р С•Р Т‘Р В°РЎР‚Р С”Р В°"
"Р вЂР ВµР В· Р В»Р С‘РЎв‚¬Р Р…Р ВµР С–Р С• РЎв‚¬РЎС“Р СР В°"
"Р вЂ™РЎРѓРЎвЂ Р С—Р С•Р Т‘ РЎР‚РЎС“Р С”Р С•Р в„–"
"Р СњР ВµР В¶Р Р…РЎвЂ№Р в„– РЎС“РЎвЂ¦Р С•Р Т‘"
"Р С™Р С•Р СРЎвЂћР С•РЎР‚РЎвЂљР Р…Р В°РЎРЏ Р С—Р С•РЎРѓР В°Р Т‘Р С”Р В°"
"Р вЂєРЎвЂР С–Р С”Р С‘Р в„– РЎС“РЎвЂ¦Р С•Р Т‘"
"Р СџРЎР‚Р С‘РЎРЏРЎвЂљР Р…Р С• Р Т‘Р ВµРЎР‚Р В¶Р В°РЎвЂљРЎРЉ"
"Р вЂќР В»РЎРЏ Р С”РЎС“РЎвЂ¦Р Р…Р С‘"
"Р вЂќР В»РЎРЏ Р С—Р С•Р ВµР В·Р Т‘Р С•Р С”"
"Р вЂќР В»РЎРЏ Р С‘Р Р…РЎвЂљР ВµРЎР‚РЎРЉР ВµРЎР‚Р В°"
"Р РЋР СР С•РЎвЂљРЎР‚Р С‘РЎвЂљРЎРѓРЎРЏ Р Т‘Р С•РЎР‚Р С•Р С–Р С•"

Adapt the text to the actual product.
Do not use generic text if a more specific safe benefit is visible.

STRICTLY AVOID THESE RUSSIAN WORDS AND CLAIMS UNLESS EXPLICITLY PROVIDED:
"РЎРѓР С”Р С‘Р Т‘Р С”Р В°", "Р В°Р С”РЎвЂ Р С‘РЎРЏ", "РЎР‚Р В°РЎРѓР С—РЎР‚Р С•Р Т‘Р В°Р В¶Р В°", "РЎвЂљР С•Р В»РЎРЉР С”Р С• РЎРѓР ВµР С–Р С•Р Т‘Р Р…РЎРЏ", "РЎвЂћР С‘Р Р…Р В°Р В»РЎРЉР Р…Р В°РЎРЏ РЎвЂ Р ВµР Р…Р В°", "Р В»РЎС“РЎвЂЎРЎв‚¬Р В°РЎРЏ РЎвЂ Р ВµР Р…Р В°", "Р СР ВµР С–Р В° РЎвЂ Р ВµР Р…Р В°", "РЎвЂ¦Р С‘РЎвЂљ Р С—РЎР‚Р С•Р Т‘Р В°Р В¶", "РЎвЂљР С•Р С— Р С—РЎР‚Р С•Р Т‘Р В°Р В¶", "РІвЂћвЂ“1", "Р В»РЎС“РЎвЂЎРЎв‚¬Р С‘Р в„–", "Р С–Р В°РЎР‚Р В°Р Р…РЎвЂљР С‘РЎРЏ", "Р Р†Р ВµРЎР‚Р Р…РЎвЂР С Р Т‘Р ВµР Р…РЎРЉР С–Р С‘", "РЎРѓР ВµРЎР‚РЎвЂљР С‘РЎвЂћР С‘РЎвЂ Р С‘РЎР‚Р С•Р Р†Р В°Р Р…Р С•", "Р В»Р ВµРЎвЂЎР С‘РЎвЂљ", "100% РЎРЊРЎвЂћРЎвЂћР ВµР С”РЎвЂљ", "Р Р†Р С•Р Т‘Р С•Р Р…Р ВµР С—РЎР‚Р С•Р Р…Р С‘РЎвЂ Р В°Р ВµР СРЎвЂ№Р в„–", "Р С–Р С‘Р С—Р С•Р В°Р В»Р В»Р ВµРЎР‚Р С–Р ВµР Р…Р Р…РЎвЂ№Р в„–", "Р С•РЎР‚Р С‘Р С–Р С‘Р Р…Р В°Р В»", "Р С—РЎР‚Р ВµР СР С‘РЎС“Р С Р С”Р В°РЎвЂЎР ВµРЎРѓРЎвЂљР Р†Р С•", fake ratings, fake reviews, fake marketplace badges.

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

* use 3РІР‚вЂњ5 chips only;
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

const _QUICK_CARD_PROMPT_EPIC = `You are a world-class marketplace art director, cinematic advertising designer, conversion-focused e-commerce strategist, Russian copywriter, and AI visual director.

Your task is to transform the provided product image into an extremely eye-catching, high-impact, scroll-stopping marketplace product card for Russian marketplaces such as Wildberries and Ozon.

The result must look like a powerful premium product poster, not a boring catalog photo.
It must instantly dominate the marketplace feed, create a "wow" effect, and make the buyer stop scrolling.

The style must be bold, dramatic, cinematic, slightly grotesque, highly commercial, and visually magnetic РІР‚вЂќ but still tasteful, clean, readable, and trustworthy.

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
The product should occupy approximately 60РІР‚вЂњ75% of the composition.
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
4. 3РІР‚вЂњ4 short benefit chips around the product.
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
- 2РІР‚вЂњ5 words;
- strong and memorable;
- adapted to the product;
- emotional but not fake.

Examples of headline style:
"Р РЋР С‘Р В»Р В° Р Р† Р Т‘Р ВµРЎвЂљР В°Р В»РЎРЏРЎвЂ¦"
"Р СљР В°Р С”РЎРѓР С‘Р СРЎС“Р С РЎРЊРЎвЂћРЎвЂћР ВµР С”РЎвЂљР В°"
"Р РЋР С•Р В·Р Т‘Р В°Р Р…Р С• Р Р†РЎвЂ№Р Т‘Р ВµР В»РЎРЏРЎвЂљРЎРЉРЎРѓРЎРЏ"
"Р вЂ™ РЎвЂ Р ВµР Р…РЎвЂљРЎР‚Р Вµ Р Р†Р Р…Р С‘Р СР В°Р Р…Р С‘РЎРЏ"
"Р СљР С•РЎвЂ°Р Р…РЎвЂ№Р в„– Р В°Р С”РЎвЂ Р ВµР Р…РЎвЂљ"
"Р Р‡РЎР‚Р С”Р С‘Р в„– РЎвЂ¦Р В°РЎР‚Р В°Р С”РЎвЂљР ВµРЎР‚"
"Р РЋРЎвЂљР С‘Р В»РЎРЉ Р В±Р ВµР В· Р С”Р С•Р СР С—РЎР‚Р С•Р СР С‘РЎРѓРЎРѓР С•Р Р†"
"Р В­РЎвЂћРЎвЂћР ВµР С”РЎвЂљ РЎРѓ Р С—Р ВµРЎР‚Р Р†Р С•Р С–Р С• Р Р†Р В·Р С–Р В»РЎРЏР Т‘Р В°"
"Р вЂ”Р В°Р СР ВµРЎвЂљР Р…Р С• РЎРѓРЎР‚Р В°Р В·РЎС“"
"Р вЂ™РЎвЂ№Р С–Р В»РЎРЏР Т‘Р С‘РЎвЂљ Р Т‘Р С•РЎР‚Р С•Р С–Р С•"
"Р вЂќР В»РЎРЏ РЎРѓР С‘Р В»РЎРЉР Р…Р С•Р С–Р С• Р С•Р В±РЎР‚Р В°Р В·Р В°"
"Р СћР Р†Р С•Р в„– Р С–Р В»Р В°Р Р†Р Р…РЎвЂ№Р в„– Р В°Р С”РЎвЂ Р ВµР Р…РЎвЂљ"
"Р С™Р С•Р С–Р Т‘Р В° Р Р…РЎС“Р В¶Р ВµР Р… РЎРЊРЎвЂћРЎвЂћР ВµР С”РЎвЂљ"
"Р СџРЎР‚Р С‘РЎвЂљРЎРЏР С–Р С‘Р Р†Р В°Р ВµРЎвЂљ Р Р†Р В·Р С–Р В»РЎРЏР Т‘"
"Р РЋРЎР‚Р В°Р В·РЎС“ Р Р† РЎвЂћР С•Р С”РЎС“РЎРѓР Вµ"

Benefit chips:
Use 3РІР‚вЂњ4 short Russian benefit chips, each 1РІР‚вЂњ3 words.
They must be visually supported by the product or safe and general.

Examples:
"Р Р‡РЎР‚Р С”Р С‘Р в„– Р Т‘Р С‘Р В·Р В°Р в„–Р Р…"
"Р СџРЎР‚Р ВµР СР С‘Р В°Р В»РЎРЉР Р…РЎвЂ№Р в„– Р Р†Р С‘Р Т‘"
"Р РЋР С‘Р В»РЎРЉР Р…РЎвЂ№Р в„– Р В°Р С”РЎвЂ Р ВµР Р…РЎвЂљ"
"Р СњР В° Р С”Р В°Р В¶Р Т‘РЎвЂ№Р в„– Р Т‘Р ВµР Р…РЎРЉ"
"Р вЂќР В»РЎРЏ Р С—Р С•Р Т‘Р В°РЎР‚Р С”Р В°"
"Р Р€Р Т‘Р С•Р В±Р Р…РЎвЂ№Р в„– РЎвЂћР С•РЎР‚Р СР В°РЎвЂљ"
"Р СџРЎР‚Р С‘РЎРЏРЎвЂљР Р…Р С• Р Т‘Р ВµРЎР‚Р В¶Р В°РЎвЂљРЎРЉ"
"Р вЂєР ВµР С–Р С”Р С• Р С‘РЎРѓР С—Р С•Р В»РЎРЉР В·Р С•Р Р†Р В°РЎвЂљРЎРЉ"
"Р РЋРЎвЂљР С‘Р В»РЎРЉР Р…Р С• РЎРѓР СР С•РЎвЂљРЎР‚Р С‘РЎвЂљРЎРѓРЎРЏ"
"Р вЂ™РЎвЂ№Р Т‘Р ВµР В»РЎРЏР ВµРЎвЂљ Р С•Р В±РЎР‚Р В°Р В·"
"Р В§Р С‘РЎРѓРЎвЂљРЎвЂ№Р в„– РЎРѓР С‘Р В»РЎС“РЎРЊРЎвЂљ"
"Р вЂњР В»РЎС“Р В±Р С•Р С”Р С‘Р в„– РЎвЂ Р Р†Р ВµРЎвЂљ"
"Р В­РЎвЂћРЎвЂћР ВµР С”РЎвЂљР Р…Р В°РЎРЏ Р С—Р С•Р Т‘Р В°РЎвЂЎР В°"
"Р РЋР СР С•РЎвЂљРЎР‚Р С‘РЎвЂљРЎРѓРЎРЏ Р Т‘Р С•РЎР‚Р С•Р С–Р С•"
"Р вЂќР В»РЎРЏ Р Т‘Р С•Р СР В°"
"Р вЂќР В»РЎРЏ Р С—Р С•Р ВµР В·Р Т‘Р С•Р С”"
"Р вЂќР В»РЎРЏ РЎС“РЎвЂ¦Р С•Р Т‘Р В°"
"Р вЂќР В»РЎРЏ Р Р…Р В°РЎРѓРЎвЂљРЎР‚Р С•Р ВµР Р…Р С‘РЎРЏ"

If the product category is clear, generate more specific Russian text.
If the product is perfume, use words like:
"Р вЂњР В»РЎС“Р В±Р С•Р С”Р С‘Р в„– Р В°РЎР‚Р С•Р СР В°РЎвЂљ"
"Р РЋРЎвЂљР С•Р в„–Р С”Р С‘Р в„– РЎв‚¬Р В»Р ВµР в„–РЎвЂћ" only if provided or clearly allowed
"Р СљРЎС“Р В¶РЎРѓР С”Р С•Р в„– РЎвЂ¦Р В°РЎР‚Р В°Р С”РЎвЂљР ВµРЎР‚"
"Р РЋР С‘Р В»Р В° РЎРѓРЎвЂљР С‘РЎвЂ¦Р С‘Р в„–"
"Р вЂ™ РЎвЂ Р ВµР Р…РЎвЂљРЎР‚Р Вµ Р Р†Р Р…Р С‘Р СР В°Р Р…Р С‘РЎРЏ"
"Р В­РЎвЂћРЎвЂћР ВµР С”РЎвЂљР Р…РЎвЂ№Р в„– РЎвЂћР В»Р В°Р С”Р С•Р Р…"
"Р вЂќР В»РЎРЏ Р Р†Р ВµРЎвЂЎР ВµРЎР‚Р В°"
"Р вЂќР В»РЎРЏ Р С—Р С•Р Т‘Р В°РЎР‚Р С”Р В°"

If the product is cosmetics:
"Р СњР ВµР В¶Р Р…РЎвЂ№Р в„– РЎС“РЎвЂ¦Р С•Р Т‘"
"Р РЋР С‘РЎРЏРЎР‹РЎвЂ°Р С‘Р в„– Р Р†Р С‘Р Т‘"
"Р С™Р В°Р В¶Р Т‘РЎвЂ№Р в„– Р Т‘Р ВµР Р…РЎРЉ"
"Р В§Р С‘РЎРѓРЎвЂљР В°РЎРЏ Р С”Р С•Р В¶Р В°" only if safe
"Р С™РЎР‚Р В°РЎРѓР С‘Р Р†РЎвЂ№Р в„– РЎР‚Р С‘РЎвЂљРЎС“Р В°Р В»"

If the product is electronics:
"Р вЂРЎвЂ№РЎРѓРЎвЂљРЎР‚РЎвЂ№Р в„– Р Т‘Р С•РЎРѓРЎвЂљРЎС“Р С—"
"Р В§РЎвЂРЎвЂљР С”Р С‘Р в„– Р В·Р Р†РЎС“Р С”"
"Р СљР С•РЎвЂ°Р Р…РЎвЂ№Р в„– Р В·Р В°РЎР‚РЎРЏР Т‘"
"Р Р€Р СР Р…РЎвЂ№Р в„– РЎвЂћР С•РЎР‚Р СР В°РЎвЂљ"
"Р вЂ™РЎРѓР ВµР С–Р Т‘Р В° РЎР‚РЎРЏР Т‘Р С•Р С"

If the product is clothing:
"Р РЋР С‘Р В»РЎРЉР Р…РЎвЂ№Р в„– Р С•Р В±РЎР‚Р В°Р В·"
"Р С™Р С•Р СРЎвЂћР С•РЎР‚РЎвЂљР Р…Р В°РЎРЏ Р С—Р С•РЎРѓР В°Р Т‘Р С”Р В°"
"Р вЂєР ВµР С–Р С”Р С• РЎРѓР С•РЎвЂЎР ВµРЎвЂљР В°РЎвЂљРЎРЉ"
"Р СњР В° Р С”Р В°Р В¶Р Т‘РЎвЂ№Р в„– Р Т‘Р ВµР Р…РЎРЉ"
"Р РЋРЎвЂљР С‘Р В»РЎРЉР Р…РЎвЂ№Р в„– РЎРѓР С‘Р В»РЎС“РЎРЊРЎвЂљ"

If the product is home decor:
"Р Р€РЎР‹РЎвЂљР Р…РЎвЂ№Р в„– Р В°Р С”РЎвЂ Р ВµР Р…РЎвЂљ"
"Р вЂќР В»РЎРЏ Р С‘Р Р…РЎвЂљР ВµРЎР‚РЎРЉР ВµРЎР‚Р В°"
"Р РЋР СР С•РЎвЂљРЎР‚Р С‘РЎвЂљРЎРѓРЎРЏ Р Т‘Р С•РЎР‚Р С•Р С–Р С•"
"Р СћРЎвЂР С—Р В»Р В°РЎРЏ Р В°РЎвЂљР СР С•РЎРѓРЎвЂћР ВµРЎР‚Р В°"
"Р С™РЎР‚Р В°РЎРѓР С‘Р Р†РЎвЂ№Р в„– Р Т‘Р С•Р С"

BADGE RULE:
You may create one small dramatic badge only if it is safe and not misleading.

Safe badge examples:
"Р Р‡РЎР‚Р С”Р С‘Р в„– Р Р†РЎвЂ№Р В±Р С•РЎР‚"
"Р вЂ™Р В°РЎС“-РЎРЊРЎвЂћРЎвЂћР ВµР С”РЎвЂљ"
"Р вЂќР В»РЎРЏ Р С—Р С•Р Т‘Р В°РЎР‚Р С”Р В°"
"Р СњР С•Р Р†РЎвЂ№Р в„– Р В°Р С”РЎвЂ Р ВµР Р…РЎвЂљ"
"Р РЋРЎвЂљР С‘Р В»РЎРЉР Р…РЎвЂ№Р в„– РЎвЂћР С•РЎР‚Р СР В°РЎвЂљ"
"Р вЂ™ РЎвЂ Р ВµР Р…РЎвЂљРЎР‚Р Вµ Р Р†Р Р…Р С‘Р СР В°Р Р…Р С‘РЎРЏ"

Avoid fake badges unless provided:
"Р ТђР С‘РЎвЂљ Р С—РЎР‚Р С•Р Т‘Р В°Р В¶"
"Р СћР С•Р С— Р С—РЎР‚Р С•Р Т‘Р В°Р В¶"
"РІвЂћвЂ“1"
"Р вЂєРЎС“РЎвЂЎРЎв‚¬Р С‘Р в„– РЎвЂљР С•Р Р†Р В°РЎР‚"
"Р вЂ™РЎвЂ№Р В±Р С•РЎР‚ Р С—Р С•Р С”РЎС“Р С—Р В°РЎвЂљР ВµР В»Р ВµР в„–"
"Р вЂњР В°РЎР‚Р В°Р Р…РЎвЂљР С‘РЎРЏ"
"Р С›РЎР‚Р С‘Р С–Р С‘Р Р…Р В°Р В»"
"Р РЋР С”Р С‘Р Т‘Р С”Р В°"
"Р С’Р С”РЎвЂ Р С‘РЎРЏ"
"Р В Р В°РЎРѓР С—РЎР‚Р С•Р Т‘Р В°Р В¶Р В°"

If the user explicitly asks for an aggressive bestseller-like design, visually create the feeling of a bestseller, but do not use false claims unless they are provided.

TEXT HIERARCHY:
Use:
- one large bold headline;
- one smaller descriptive line if necessary;
- 3РІР‚вЂњ4 benefit chips;
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
Use "РІвЂљР…" symbol.
Example:
"4 990 РІвЂљР…"

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
"Р РЋР С‘Р В»Р В° РЎвЂ¦Р В°РЎР‚Р В°Р С”РЎвЂљР ВµРЎР‚Р В°"
"Р вЂњР В»РЎС“Р В±Р С•Р С”Р С‘Р в„– Р В°РЎР‚Р С•Р СР В°РЎвЂљ"
"Р В­РЎвЂћРЎвЂћР ВµР С”РЎвЂљР Р…РЎвЂ№Р в„– РЎвЂћР В»Р В°Р С”Р С•Р Р…"
"Р вЂќР В»РЎРЏ Р Р†Р ВµРЎвЂЎР ВµРЎР‚Р В°"
"Р вЂ™ РЎвЂ Р ВµР Р…РЎвЂљРЎР‚Р Вµ Р Р†Р Р…Р С‘Р СР В°Р Р…Р С‘РЎРЏ"
"Р СљР С•РЎвЂ°Р Р…РЎвЂ№Р в„– РЎв‚¬Р В»Р ВµР в„–РЎвЂћ" only if provided or allowed
"Р вЂќР В»РЎРЏ Р С—Р С•Р Т‘Р В°РЎР‚Р С”Р В°"
"Р РЋРЎвЂљР С‘Р В»РЎРЉР Р…РЎвЂ№Р в„– Р В°Р С”РЎвЂ Р ВµР Р…РЎвЂљ"

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
const _QUICK_UGC_PROMPT = `You are an expert at creating hyper-realistic smartphone photographs that look exactly like real customer review photos on Russian marketplaces (Wildberries, Ozon, AliExpress).

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
- Slightly imperfect composition РІР‚вЂќ product NOT perfectly centered, camera at a slight casual angle (2-5 degrees tilt)
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
7. IN USE: If it's clothing РІР‚вЂќ worn casually (mirror selfie vibe). If it's kitchenware РІР‚вЂќ on a kitchen counter. If it's electronics РІР‚вЂќ plugged in, being used.
8. COMPARISON: Product next to a familiar object (hand, pen, phone) to show real scale.

ANTI-DETECTION RULES (critical for believability):
- NEVER use white cyclorama or solid color backgrounds
- NEVER use professional studio lighting
- NEVER make the photo look too polished or retouched
- NEVER add text, watermarks, or any overlay
- NEVER show the product floating or in an unnatural position
- The background MUST be a real, lived-in domestic environment
- Include small realistic details: visible furniture edges, carpet textures, a cable, a crumb, a pet toy РІР‚вЂќ micro-imperfections that make it believable
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

// РІвЂўС’РІвЂўС’РІвЂўС’ MODEL PHOTO PROMPT РІР‚вЂќ Р С”РЎР‚Р В°РЎРѓР С‘Р Р†Р С•Р Вµ РЎвЂћР С•РЎвЂљР С• РЎвЂљР С•Р Р†Р В°РЎР‚Р В° РЎРѓ Р СР С•Р Т‘Р ВµР В»РЎРЉРЎР‹ (Р В±Р ВµР В· Р С‘Р Р…РЎвЂћР С•Р С–РЎР‚Р В°РЎвЂћР С‘Р С”Р С‘) РІвЂўС’РІвЂўС’РІвЂўС’
const _MODEL_PHOTO_PROMPT = `You are an elite product photographer and creative director.

Your task: Create a stunning, high-quality PHOTOGRAPH of a HUMAN MODEL naturally interacting with the product shown in the reference image(s).

STEP 1 РІР‚вЂќ PRODUCT ANALYSIS:
Analyze the product image(s). Determine:
- What category? (clothing, electronics, cosmetics, furniture, food, sport, bags, jewelry, etc.)
- How should a person naturally wear, hold, use, or demonstrate this product?

STEP 2 РІР‚вЂќ MODEL SELECTION:
Auto-select the perfect model for this product:
- Gender matching the product's target audience
- Age 22-35, attractive but natural
- Warm, confident expression
- Clothing that complements (not overshadows) the product

STEP 3 РІР‚вЂќ SCENE & PHOTOGRAPHY:
- Choose the ideal setting: studio, lifestyle indoor, outdoor РІР‚вЂќ whatever best showcases this product with a person
- Professional commercial photography lighting
- The PRODUCT must be clearly visible and be the hero
- Model complements the product naturally
- Composition: vertical 3:4, clean and balanced
- High-end fashion/commercial photography quality

STRICT RULES:
- NO text, NO typography, NO infographic elements, NO badges, NO benefit chips
- NO marketplace card layout РІР‚вЂќ this is a PHOTO, not a card
- NO distorted product РІР‚вЂќ preserve exact shape, color, details
- NO uncanny valley РІР‚вЂќ model must look natural and photorealistic
- Product should be recognizable as the exact item from the reference

OUTPUT: One finished vertical product photo with a human model. No explanations. No text overlays.`;

// РІвЂўС’РІвЂўС’РІвЂўС’ MODEL CARD PROMPTS РІР‚вЂќ Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”Р С‘ Р СР В°РЎР‚Р С”Р ВµРЎвЂљР С—Р В»Р ВµР в„–РЎРѓР В° РЎРѓ РЎвЂЎР ВµР В»Р С•Р Р†Р ВµР С”Р С•Р С-Р СР С•Р Т‘Р ВµР В»РЎРЉРЎР‹ РІвЂўС’РІвЂўС’РІвЂўС’
const _MODEL_CARD_PROMPT_NATURAL = `You are an elite marketplace creative director, product photographer, and Russian copywriter.

Your task: Create a premium, clean, minimalist marketplace product card for Russian marketplaces (Wildberries, Ozon) that features a HUMAN MODEL holding, wearing, demonstrating, or using the product.

CRITICAL: HUMAN MODEL INTEGRATION
First, analyze what the product is, then determine HOW a human should interact with it:
- Clothing/accessories РІвЂ вЂ™ model WEARING the item, natural standing or walking pose
- Furniture РІвЂ вЂ™ model SITTING on/LEANING against the product, casual lifestyle pose
- Kitchen/home items РІвЂ вЂ™ model USING the item in a kitchen/home setting
- Electronics РІвЂ вЂ™ model HOLDING the device, demonstrating the product in use
- Beauty/cosmetics РІвЂ вЂ™ model APPLYING or holding the product near face
- Fitness/sport РІвЂ вЂ™ model in active or athletic pose with the product
- Other РІвЂ вЂ™ model holding/presenting the product naturally

MODEL REQUIREMENTS:
- Attractive but natural-looking person (no uncanny valley)
- Age 25-35, well-groomed, clean appearance
- Natural expression РІР‚вЂќ slight smile or neutral
- Professional but approachable look
- Clothing should complement the product (neutral tones for most products)
- Model should NOT overpower the product РІР‚вЂќ product is the hero

DESIGN STYLE (NATURAL/MINIMAL):
- Clean, minimal background (solid color, soft gradient, or simple texture)
- The background color should complement the product
- Soft, even studio lighting, no harsh shadows
- Elegant, balanced composition
- Product is clearly visible and well-lit
- Modern sans-serif Russian typography
- 1 headline in Russian (product name or key benefit)
- 1 subheadline (short descriptive line)
- 3РІР‚вЂњ4 benefit chips with icons at the bottom
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

const _MODEL_CARD_PROMPT_EPIC = `You are a world-class marketplace art director, cinematic advertising designer, and Russian copywriter.

Your task: Create an EPIC, cinematic, scroll-stopping marketplace product card for Russian marketplaces (Wildberries, Ozon) that features a HUMAN MODEL dramatically interacting with the product.

CRITICAL: HUMAN MODEL + DRAMATIC INTERACTION
First, analyze what the product is, then create a DRAMATIC scene:
- Clothing/accessories РІвЂ вЂ™ model in a powerful pose, wind in hair, dramatic lighting, fashion editorial vibe
- Furniture РІвЂ вЂ™ model in cinematic luxury interior, dramatic shadows, lifestyle aspiration
- Kitchen/home items РІвЂ вЂ™ model in a styled, atmospheric kitchen scene with dramatic light
- Electronics РІвЂ вЂ™ model in a futuristic or tech-noir setting, dramatic reflections
- Beauty/cosmetics РІвЂ вЂ™ model in close-up beauty shot, dramatic lighting, editorial quality
- Fitness/sport РІвЂ вЂ™ model in powerful athletic pose, energy, motion blur, epic atmosphere
- Other РІвЂ вЂ™ model in a dramatic, cinematic scene that elevates the product

MODEL REQUIREMENTS:
- Strikingly attractive person with presence
- Confident, powerful expression
- Dramatic pose that creates energy
- Professional styling that matches the productРІР‚в„ўs mood
- Model and product should feel like one cinematic moment

DESIGN STYLE (EPIC/CINEMATIC):
- Dramatic, cinematic atmosphere (fire, smoke, neon, lightning, golden light, deep shadows)
- Bold, vibrant color world (deep blacks, electric blues, golden ambers, rich contrasts)
- Dramatic lighting РІР‚вЂќ rim lights, volumetric rays, lens flares
- Powerful composition with strong leading lines
- Product is clearly visible and featured prominently
- Bold, impactful Russian typography
- 1 dramatic headline in Russian
- 1 subtitle or tagline
- 3РІР‚вЂњ4 benefit chips
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

  // РЇР·С‹Рє РїСЂРѕРјРїС‚РѕРІ (ru/en), С‡РёС‚Р°РµС‚СЃСЏ РёР· Р‘Р” СЃ РєРµС€РµРј 60СЃ
  const _promptLang = await getPromptLang();
  const _P = PROMPTS[_promptLang] || PROMPTS.en;

  // РІвЂўС’РІвЂўС’РІвЂўС’ AUTH: JWT + Firebase Token Verification РІвЂўС’РІвЂўС’РІвЂўС’
  // Р РЋР Р…Р В°РЎвЂЎР В°Р В»Р В° Р С—РЎР‚Р С•Р В±РЎС“Р ВµР С JWT (Р Р…Р С•Р Р†Р В°РЎРЏ РЎРѓР С‘РЎРѓРЎвЂљР ВµР СР В°), Р С—Р С•РЎвЂљР С•Р С Firebase (legacy)
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

    // REFUND CREDITS (РґР»СЏ РІРѕР·РІСЂР°С‚Р° РєСЂРµРґРёС‚РѕРІ РїСЂРё РЅРµСѓРґР°С‡РЅС‹С… РіРµРЅРµСЂР°С†РёСЏС…)
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

    // РІвЂўС’РІвЂўС’РІвЂўС’ DETECT ALL ELEMENTS (Gemini Vision РІР‚вЂќ bounding boxes) РІвЂўС’РІвЂўС’РІвЂўС’
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
              { text: `Р СћРЎвЂ№ Р Р†Р С‘Р Т‘Р С‘РЎв‚¬РЎРЉ Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”РЎС“ РЎвЂљР С•Р Р†Р В°РЎР‚Р В° Р СР В°РЎР‚Р С”Р ВµРЎвЂљР С—Р В»Р ВµР в„–РЎРѓР В°. Р СњР В°Р в„–Р Т‘Р С‘ Р вЂ™Р РЋР вЂў Р Р†Р С‘Р В·РЎС“Р В°Р В»РЎРЉР Р…РЎвЂ№Р Вµ РЎРЊР В»Р ВµР СР ВµР Р…РЎвЂљРЎвЂ№ Р Р…Р В° Р С”Р В°РЎР‚РЎвЂљР С‘Р Р…Р С”Р Вµ.

Р вЂќР В»РЎРЏ Р С”Р В°Р В¶Р Т‘Р С•Р С–Р С• РЎРЊР В»Р ВµР СР ВµР Р…РЎвЂљР В° Р С•Р С—РЎР‚Р ВµР Т‘Р ВµР В»Р С‘:
- name: Р С”Р С•РЎР‚Р С•РЎвЂљР С”Р С•Р Вµ Р Р…Р В°Р В·Р Р†Р В°Р Р…Р С‘Р Вµ Р Р…Р В° РЎР‚РЎС“РЎРѓРЎРѓР С”Р С•Р С (2-4 РЎРѓР В»Р С•Р Р†Р В°) 
- bbox: Р С”Р С•Р С•РЎР‚Р Т‘Р С‘Р Р…Р В°РЎвЂљРЎвЂ№ Р С—РЎР‚РЎРЏР СР С•РЎС“Р С–Р С•Р В»РЎРЉР Р…Р С‘Р С”Р В° [x%, y%, width%, height%] Р С•РЎвЂљ РЎР‚Р В°Р В·Р СР ВµРЎР‚Р С•Р Р† Р С”Р В°РЎР‚РЎвЂљР С‘Р Р…Р С”Р С‘ (0-100)

Р СћР С‘Р С—РЎвЂ№ РЎРЊР В»Р ВµР СР ВµР Р…РЎвЂљР С•Р Р† Р С”Р С•РЎвЂљР С•РЎР‚РЎвЂ№Р Вµ Р Р…РЎС“Р В¶Р Р…Р С• Р С‘РЎРѓР С”Р В°РЎвЂљРЎРЉ:
- Р вЂ”Р В°Р С–Р С•Р В»Р С•Р Р†Р С•Р С” (РЎвЂљР ВµР С”РЎРѓРЎвЂљ)
- Р СџР С•Р Т‘Р В·Р В°Р С–Р С•Р В»Р С•Р Р†Р С•Р С” (РЎвЂљР ВµР С”РЎРѓРЎвЂљ)
- Р вЂР ВµР в„–Р Т‘Р В¶/Р С—Р С‘Р В»Р В» (Р С”Р Р…Р С•Р С—Р С”Р В° РЎРѓ РЎвЂ¦Р В°РЎР‚Р В°Р С”РЎвЂљР ВµРЎР‚Р С‘РЎРѓРЎвЂљР С‘Р С”Р С•Р в„–)
- Р В¤Р С•РЎвЂљР С• РЎвЂљР С•Р Р†Р В°РЎР‚Р В°
- Р вЂќР ВµР С”Р С•РЎР‚Р В°РЎвЂљР С‘Р Р†Р Р…РЎвЂ№Р Вµ РЎРЊР В»Р ВµР СР ВµР Р…РЎвЂљРЎвЂ№ (РЎвЂЎР ВµР СР С•Р Т‘Р В°Р Р…, Р С—Р В»Р ВµР Т‘ Р С‘ РЎвЂљ.Р С—.)
- Р В¤Р С•Р Р…
- Р В¦Р ВµР Р…Р В° (Р ВµРЎРѓР В»Р С‘ Р ВµРЎРѓРЎвЂљРЎРЉ)
- Р ВР С”Р С•Р Р…Р С”Р С‘

Р вЂ™Р ВµРЎР‚Р Р…Р С‘ Р СћР С›Р вЂєР В¬Р С™Р С› JSON Р СР В°РЎРѓРЎРѓР С‘Р Р† Р В±Р ВµР В· Р С—Р С•РЎРЏРЎРѓР Р…Р ВµР Р…Р С‘Р в„–:
[{"name":"...","bbox":[x,y,w,h]},...]
Р С›РЎвЂљР Р†Р ВµРЎвЂљ Р Т‘Р С•Р В»Р В¶Р ВµР Р… Р В±РЎвЂ№РЎвЂљРЎРЉ РЎвЂљР С•Р В»РЎРЉР С”Р С• JSON, Р Р…Р С‘Р С”Р В°Р С”Р С•Р С–Р С• Р Т‘РЎР‚РЎС“Р С–Р С•Р С–Р С• РЎвЂљР ВµР С”РЎРѓРЎвЂљР В°.` }
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

    // РІвЂўС’РІвЂўС’РІвЂўС’ IDENTIFY ELEMENT (Gemini Vision) РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’
    if (req.body?.action === 'identify-element') {
      const { imageBase64 } = req.body;
      if (!imageBase64) return res.status(400).json({ success: false, error: 'imageBase64 required' });

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(200).json({ success: true, hint: 'Р СњР В°Р В¶Р СР С‘РЎвЂљР Вµ Р Р…Р В° Р Т‘Р ВµР в„–РЎРѓРЎвЂљР Р†Р С‘Р Вµ Р Т‘Р В»РЎРЏ РЎР‚Р ВµР Т‘Р В°Р С”РЎвЂљР С‘РЎР‚Р С•Р Р†Р В°Р Р…Р С‘РЎРЏ' });
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
              { text: `Р СћРЎвЂ№ Р Р†Р С‘Р Т‘Р С‘РЎв‚¬РЎРЉ РЎвЂћРЎР‚Р В°Р С–Р СР ВµР Р…РЎвЂљ Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”Р С‘ РЎвЂљР С•Р Р†Р В°РЎР‚Р В° Р СР В°РЎР‚Р С”Р ВµРЎвЂљР С—Р В»Р ВµР в„–РЎРѓР В°.
Р С›Р С—РЎР‚Р ВµР Т‘Р ВµР В»Р С‘ РЎвЂЎРЎвЂљР С• РЎРЊРЎвЂљР С• Р В·Р В° РЎРЊР В»Р ВµР СР ВµР Р…РЎвЂљ. Р С›РЎвЂљР Р†Р ВµРЎвЂљРЎРЉ Р С›Р вЂќР СњР С›Р в„ў РЎвЂћРЎР‚Р В°Р В·Р С•Р в„– Р Р…Р В° РЎР‚РЎС“РЎРѓРЎРѓР С”Р С•Р С РЎРЏР В·РЎвЂ№Р С”Р Вµ (Р СР В°Р С”РЎРѓР С‘Р СРЎС“Р С 15 РЎРѓР В»Р С•Р Р†).
Р СџРЎР‚Р С‘Р СР ВµРЎР‚РЎвЂ№:
- "Р вЂ”Р В°Р С–Р С•Р В»Р С•Р Р†Р С•Р С” РЎРѓ Р Р…Р В°Р В·Р Р†Р В°Р Р…Р С‘Р ВµР С РЎвЂљР С•Р Р†Р В°РЎР‚Р В°"
- "Р вЂР ВµР в„–Р Т‘Р В¶-РЎвЂ¦Р В°РЎР‚Р В°Р С”РЎвЂљР ВµРЎР‚Р С‘РЎРѓРЎвЂљР С‘Р С”Р В° РЎвЂљР С•Р Р†Р В°РЎР‚Р В°, Р СР С•Р В¶Р Р…Р С• Р С‘Р В·Р СР ВµР Р…Р С‘РЎвЂљРЎРЉ РЎвЂљР ВµР С”РЎРѓРЎвЂљ"
- "Р В¤Р С•Р Р…Р С•Р Р†РЎвЂ№Р в„– Р Т‘Р ВµР С”Р С•РЎР‚, Р СР С•Р В¶Р Р…Р С• Р С‘Р В·Р СР ВµР Р…Р С‘РЎвЂљРЎРЉ РЎвЂ Р Р†Р ВµРЎвЂљ Р С‘Р В»Р С‘ РЎС“Р В±РЎР‚Р В°РЎвЂљРЎРЉ"
- "Р В¦Р ВµР Р…Р В° РЎвЂљР С•Р Р†Р В°РЎР‚Р В°"
- "Р В¤Р С•РЎвЂљР С• РЎвЂљР С•Р Р†Р В°РЎР‚Р В°"
- "CTA-Р С”Р Р…Р С•Р С—Р С”Р В°"
Р С›РЎвЂљР Р†Р ВµРЎвЂљРЎРЉ Р СћР С›Р вЂєР В¬Р С™Р С› Р С•Р С—Р С‘РЎРѓР В°Р Р…Р С‘Р ВµР С, Р В±Р ВµР В· Р С”Р В°Р Р†РЎвЂ№РЎвЂЎР ВµР С”.` }
            ]
          }],
          config: { temperature: 0.1, maxOutputTokens: 60 },
        });

        const hint = resp.text?.trim() || 'Р СњР В°Р В¶Р СР С‘РЎвЂљР Вµ Р Р…Р В° Р Т‘Р ВµР в„–РЎРѓРЎвЂљР Р†Р С‘Р Вµ Р Т‘Р В»РЎРЏ РЎР‚Р ВµР Т‘Р В°Р С”РЎвЂљР С‘РЎР‚Р С•Р Р†Р В°Р Р…Р С‘РЎРЏ';
        return res.status(200).json({ success: true, hint });
      } catch (err) {
        console.error('[identify-element]', err.message);
        return res.status(200).json({ success: true, hint: 'Р вЂ™РЎвЂ№Р В±Р ВµРЎР‚Р С‘РЎвЂљР Вµ Р Т‘Р ВµР в„–РЎРѓРЎвЂљР Р†Р С‘Р Вµ Р Т‘Р В»РЎРЏ РЎР‚Р ВµР Т‘Р В°Р С”РЎвЂљР С‘РЎР‚Р С•Р Р†Р В°Р Р…Р С‘РЎРЏ' });
      }
    }


    // РІвЂўС’РІвЂўС’РІвЂўС’ CREATE PERSONA РІР‚вЂќ Р С–Р ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘РЎРЏ 5-frame casting card Р С—Р С• Р С•Р С—Р С‘РЎРѓР В°Р Р…Р С‘РЎР‹ + Р С•Р С—РЎвЂ Р С‘Р С•Р Р…Р В°Р В»РЎРЉР Р…РЎвЂ№Р Вµ РЎвЂћР С•РЎвЂљР С• РІвЂўС’РІвЂўС’РІвЂўС’
    if (req.body?.action === 'create-persona') {
      const { photos, personaDescription, modelName: personaName } = req.body;
      const photoKeys = photos && typeof photos === 'object' ? Object.keys(photos).filter(k => photos[k]) : [];
      const hasDescription = personaDescription && personaDescription.trim().length > 5;
      const hasPhotos = photoKeys.length > 0;

      // Р СњРЎС“Р В¶Р Р…Р С• РЎвЂ¦Р С•РЎвЂљРЎРЏ Р В±РЎвЂ№ Р С•Р С—Р С‘РЎРѓР В°Р Р…Р С‘Р Вµ Р ВР вЂєР В РЎвЂћР С•РЎвЂљР С•
      if (!hasDescription && !hasPhotos) {
        return res.status(400).json({ success: false, error: 'Р СњРЎС“Р В¶Р Р…Р С• Р С•Р С—Р С‘РЎРѓР В°Р Р…Р С‘Р Вµ Р С—Р ВµРЎР‚РЎРѓР С•Р Р…Р В°Р В¶Р В° Р С‘Р В»Р С‘ РЎвЂ¦Р С•РЎвЂљРЎРЏ Р В±РЎвЂ№ Р С•Р Т‘Р Р…Р В° РЎвЂћР С•РЎвЂљР С•Р С–РЎР‚Р В°РЎвЂћР С‘РЎРЏ' });
      }

      const elapsed = () => ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`СЂСџВ§вЂ [${elapsed()}s] Create Persona: name="${personaName || 'unknown'}", photos=${photoKeys.length}, hasDesc=${hasDescription}`);

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
        // РІвЂќР‚РІвЂќР‚ Build persona prompt based on available inputs РІвЂќР‚РІвЂќР‚
        const descBlock = hasDescription
          ? `\nРІвЂўС’РІвЂўС’РІвЂўС’ CHARACTER DESCRIPTION (PRIMARY SUBJECT) РІвЂўС’РІвЂўС’РІвЂўС’\n${personaDescription.trim()}${personaName ? `\nName: ${personaName}` : ''}\n`
          : '';
        const refBlock = hasPhotos
          ? `\nРІвЂўС’РІвЂўС’РІвЂўС’ REFERENCE PHOTOS PROVIDED РІвЂўС’РІвЂўС’РІвЂўС’\nYou have received ${imageInputs.length} reference photo(s). Use them to match the person's EXACT facial features, skin tone, hair, and body type. The generated character MUST look like the person in the reference photos.\n`
          : '';
        const subjectInstruction = hasPhotos
          ? `REPLICATE the EXACT facial features from the reference photos. ZERO creative liberty with the face.`
          : `CREATE this character FROM SCRATCH based on the description above. Generate a unique, photorealistic human being matching the description exactly.`;

        const personaPrompt = _P.CREATE_PERSONA_PROMPT(descBlock, refBlock, subjectInstruction);
        const _personaPromptOLD_REMOVED = `REMOVED вЂ” now using _P.CREATE_PERSONA_PROMPT()
        // OLD PROMPT BELOW вЂ” DELETE AFTER TESTING
        You are an elite fashion agency photographer and casting director creating a PROFESSIONAL MODEL CASTING CARD.
${descBlock}${refBlock}
=== LAYOUT: 3 FACE PORTRAITS (LEFT) + 1 FULL-BODY (RIGHT COLUMN) ===

This card has TWO ZONES side by side:

LEFT ZONE (approximately 70% of total width) - 3 face portrait frames in ONE HORIZONTAL ROW at the top:

  FRAME [1] вЂ” FRONT FACE (Р›РёС†Рѕ Р°РЅС„Р°СЃ):
  Head and shoulders. Face pointing DIRECTLY INTO the camera lens.
  Both eyes look straight ahead. Face is perfectly symmetrical.
  Nose points straight toward camera. Both ears equally visible.

  FRAME [2] вЂ” TURNED LEFT (Р›РёС†Рѕ 3/4 РІР»РµРІРѕ):
  Head and shoulders. The subject has turned their head to THEIR LEFT.
  ANATOMY CHECK for frame [2]:
  вЂў Subject's LEFT EAR: NOT VISIBLE (hidden behind head)
  вЂў Subject's RIGHT EAR: CLEARLY VISIBLE on the right side of the head
  вЂў Nose tip direction in the frame: pointing toward LEFT edge of frame
  вЂў Cheek closest to camera: LEFT CHEEK is prominent, RIGHT CHEEK is hidden
  вЂў The subject appears to be looking at something to THEIR LEFT.

  FRAME [3] вЂ” TURNED RIGHT (Р›РёС†Рѕ 3/4 РІРїСЂР°РІРѕ):
  Head and shoulders. The subject has turned their head to THEIR RIGHT.
  THIS IS THE EXACT MIRROR OPPOSITE OF FRAME [2].
  ANATOMY CHECK for frame [3]:
  вЂў Subject's RIGHT EAR: NOT VISIBLE (hidden behind head)
  вЂў Subject's LEFT EAR: CLEARLY VISIBLE on the left side of the head
  вЂў Nose tip direction in the frame: pointing toward RIGHT edge of frame
  вЂў Cheek closest to camera: RIGHT CHEEK is prominent, LEFT CHEEK is hidden
  вЂў The subject appears to be looking at something to THEIR RIGHT.

  MANDATORY VERIFICATION:
  In frame [2]: nose points LEFT in frame, RIGHT ear visible.
  In frame [3]: nose points RIGHT in frame, LEFT ear visible.
  If frames [2] and [3] show the nose pointing the same direction вЂ” GENERATION IS INVALID.

RIGHT ZONE (approximately 30% of total width) - 1 TALL full-body frame spanning the ENTIRE HEIGHT of the card:
  [4] Full body standing - standing straight, arms relaxed at sides, facing camera, showing COMPLETE body from crown of head to shoes/feet. This frame is TALL and NARROW, occupying the RIGHT EDGE of the image from TOP to BOTTOM.

TOTAL: Exactly 4 frames. NO MORE, NO LESS. 3 small portraits on the left + 1 tall full-body on the right.
DO NOT place the full-body frame at the bottom. It MUST be a VERTICAL COLUMN on the RIGHT SIDE.

=== PHOTOGRAPHIC REALISM (CRITICAL - NO PLASTIC SKIN) ===
- DO NOT apply AI smoothing, plastic skin filters, or generic CGI rendering
- PRESERVE raw photographic texture: skin pores, micro-details, natural imperfections
- Lighting: cinematic, dramatic with depth and micro-contrast - NOT flat studio lighting
- Render hyper-realistic skin, natural hair strands, authentic human texture
- The result must look like a real photograph, NOT an AI illustration

=== ABSOLUTE IDENTITY LOCK (CRITICAL - ZERO TOLERANCE) ===
${subjectInstruction}
The person in ALL 4 frames must be CONSISTENT - same person across every frame:
- FACE: Exact bone structure - cheekbones, jawline angle, chin shape, forehead size
- EYES: Same exact eye shape, color, distance, eyelid crease
- NOSE: Same exact nose bridge width, nostril shape, tip angle
- LIPS: Same exact lip fullness, cupids bow, natural lip color
- SKIN: Same exact skin tone, texture, any moles/marks/freckles
- HAIR: Same exact color, length, texture, parting, style - NO hairstyle changes
- BODY: Same exact build, height proportions, shoulder width
- AGE: Consistent age across all 4 frames
If ANY frame shows a different-looking person - REJECTED.

=== WARDROBE AND BACKGROUND ===
- Wardrobe: Simple black fitted clothing (black crew-neck t-shirt + black slim pants). No logos.
- Background: Dark cinematic charcoal/slate with subtle vignette. Uniform across all frames.

=== LABELS (MUST BE IN RUSSIAN LANGUAGE USING CYRILLIC SCRIPT) ===
Small elegant white text label below each frame, ALL IN RUSSIAN CYRILLIC:
  Frame 1 label in Russian Cyrillic: Р›РёС†Рѕ Р°РЅС„Р°СЃ
  Frame 2 label in Russian Cyrillic: Р›РёС†Рѕ 3/4 РІР»РµРІРѕ  
  Frame 3 label in Russian Cyrillic: Р›РёС†Рѕ 3/4 РІРїСЂР°РІРѕ
  Frame 4 label in Russian Cyrillic: РџРѕР»РЅС‹Р№ СЂРѕСЃС‚
Write labels using Russian Cyrillic characters. DO NOT use English or Latin script for labels.

=== TECHNICAL ===
- Clean thin dark borders between frames
- LEFT ZONE: 3 face portraits in a row, each roughly square or slightly portrait (1:1.2)
- RIGHT ZONE: Full-body frame occupies approximately 30% of total width and 100% of total height
- The full-body person must be shown HEAD-TO-TOE, centered within the right column
- NO 5th frame, NO extra row, NO bottom-wide frame. Only 4 frames total.

OUTPUT: One single 4K image. Casting card with exactly 4 frames. Masterpiece cinematic photography quality.`;


        console.log(`СЂСџВ§вЂ [${elapsed()}s] Sending ${imageInputs.length} photo(s) to KIE.ai for persona casting card...`);
        const resultUrl = await executeKieTask(personaPrompt, imageInputs, 'gpt-image-2-image-to-image', '16:9', '4K');
        console.log(`РІСљвЂ¦ [${elapsed()}s] Comp card generated. Downloading...`);
        const dl = await downloadToBase64(resultUrl);
        if (!dl) throw new Error('Failed to download comp card');
        // No post-process flip (GPT Image 2 generates consistent angles naturally)
        const creditsRemaining = await getCreditsRemainingForReservation(creditReservation);

        incrementGlobalCounter('generationsPersona').catch(() => {});
        saveGenerationLog({ userId: verifiedUid, success: true, imageUrl: resultUrl, reqBody: { action: 'create-persona', photoCount: photoKeys.length }, durationMs: Date.now() - startTime }).catch(() => {});

        return res.status(200).json({ success: true, imageBase64: `data:${dl.mimeType};base64,${dl.base64str}`, imageUrl: resultUrl, creditsRemaining, _debug: { promptKey: 'CREATE_PERSONA_PROMPT', promptLang: _promptLang, model: 'gpt-image-2-image-to-image via KIE.ai', ratio: '16:9' } });
      } catch (err) {
        console.error(`РІСњРЉ Create Persona error:`, err.message);
        alertOnError(err, `generate-image [create_persona]`).catch(() => {});
        return res.status(200).json({ success: false, error: `Р С›РЎв‚¬Р С‘Р В±Р С”Р В° РЎРѓР С•Р В·Р Т‘Р В°Р Р…Р С‘РЎРЏ Р С—Р ВµРЎР‚РЎРѓР С•Р Р…Р В°Р В¶Р В°: ${err.message.substring(0, 200)}` });
      }
    }

    // РІвЂўС’РІвЂўС’РІвЂўС’ GENERATE MISSING ANGLE РІР‚вЂќ Р С–Р ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘РЎРЏ Р Р…Р ВµР Т‘Р С•РЎРѓРЎвЂљР В°РЎР‹РЎвЂ°Р ВµР С–Р С• РЎР‚Р В°Р С”РЎС“РЎР‚РЎРѓР В° Р С‘Р В· Р С‘Р СР ВµРЎР‹РЎвЂ°Р С‘РЎвЂ¦РЎРѓРЎРЏ РЎвЂћР С•РЎвЂљР С• РІвЂўС’РІвЂўС’РІвЂўС’
    if (req.body?.action === 'generate-missing-angle') {
      const { existingPhotos, missingAngle } = req.body;
      if (!existingPhotos || !Array.isArray(existingPhotos) || existingPhotos.length === 0) {
        return res.status(400).json({ success: false, error: 'existingPhotos array required' });
      }
      if (!missingAngle) {
        return res.status(400).json({ success: false, error: 'missingAngle required (front, left34, right34, fullbody)' });
      }

      const elapsed = () => ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`СЂСџвЂњС’ [${elapsed()}s] Generate missing angle: ${missingAngle} from ${existingPhotos.length} existing photos`);

      const ANGLE_DESCRIPTIONS = {
        front: 'a FRONT-FACING portrait: the person looks STRAIGHT into the camera, head and shoulders, face symmetrical, neutral expression',
        left34: 'a 3/4 portrait turned to the LEFT — the face and nose clearly point toward the LEFT side of the image (about 30 degrees). This MUST be the mirror-opposite of the right 3/4 angle: it looks the OPPOSITE way',
        right34: 'a 3/4 portrait turned to the RIGHT — the face and nose clearly point toward the RIGHT side of the image (about 30 degrees). This MUST be the mirror-opposite of the left 3/4 angle: it looks the OPPOSITE way',
        fullbody: 'a FULL BODY photo: standing straight, facing camera, entire body from head to feet, arms relaxed at sides',
      };

      const angleDesc = ANGLE_DESCRIPTIONS[missingAngle] || ANGLE_DESCRIPTIONS.front;

      try {
        const imageInputs = existingPhotos.map(img => {
          if (img.startsWith('http://') || img.startsWith('https://') || img.startsWith('data:')) {
            return img;
          }
          return `data:image/jpeg;base64,${img}`;
        });

        const missingPrompt = `You have received ${existingPhotos.length} reference photo(s) of a REAL PERSON.
Generate ${angleDesc} of this EXACT SAME PERSON.

HEAD DIRECTION (CRITICAL): Follow the requested angle EXACTLY. A LEFT 3/4 must look toward the left of the frame; a RIGHT 3/4 must look toward the right of the frame. Do NOT default to front-facing and do NOT copy the direction of the other photos.

CRITICAL IDENTITY RULES:
- The generated photo must show the EXACT SAME PERSON as in the reference photos
- Preserve ALL facial features identically: face shape, nose, eyes, eyebrows, lips, jawline, skin tone, wrinkles, moles
- Preserve EXACT hair: color, length, texture, style, hairline
- Preserve EXACT body proportions
- Wear simple black fitted clothing (black t-shirt + black pants)
- Neutral dark gray studio background
- Professional studio lighting

OUTPUT: One single high-quality photo. No text. No collage. No explanations.`;

        console.log(`СЂСџвЂњС’ [${elapsed()}s] Sending to KIE.ai for missing angle generation...`);
        const resultUrl = await executeKieTask(missingPrompt, imageInputs, 'gpt-image-2-image-to-image');
        console.log(`РІСљвЂ¦ [${elapsed()}s] Missing angle generated. Downloading...`);
        const dl = await downloadToBase64(resultUrl);
        if (!dl) throw new Error('Failed to download generated angle');

        const creditsRemaining = await getCreditsRemainingForReservation(creditReservation);

        incrementGlobalCounter('generationsAngle').catch(() => {});

        return res.status(200).json({ success: true, imageBase64: `data:${dl.mimeType};base64,${dl.base64str}`, imageUrl: resultUrl, creditsRemaining });
      } catch (err) {
        console.error(`РІСњРЉ Generate missing angle error:`, err.message);
        alertOnError(err, `generate-image [missing_angle]`).catch(() => {});
        return res.status(200).json({ success: false, error: humanizeGenerationError(err.message) });
      }
    }

    // РІвЂўС’РІвЂўС’РІвЂўС’ EDIT CARD РІР‚вЂќ РЎР‚Р ВµР Т‘Р В°Р С”РЎвЂљР С‘РЎР‚Р С•Р Р†Р В°Р Р…Р С‘Р Вµ Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”Р С‘ Р СР В°РЎР‚Р С”Р ВµРЎвЂљР С—Р В»Р ВµР в„–РЎРѓР В° РЎвЂЎР ВµРЎР‚Р ВµР В· GPT Image 2 РІвЂўС’РІвЂўС’РІвЂўС’
    if (req.body?.action === 'edit-card') {
      const { sourceImageBase64: editSrc, sourceImageUrl: editSrcUrl, editInstruction: editText } = req.body;
      if ((!editSrc && !editSrcUrl) || !editText) {
        return res.status(400).json({ success: false, error: 'sourceImageBase64/sourceImageUrl and editInstruction are required' });
      }
      const elapsed = () => ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`РІСљРЏРїС‘РЏ [${elapsed()}s] Edit Card: instruction="${editText.substring(0, 80)}"`);
      try {
        const editPrompt = `You are editing a marketplace product card image. Apply this change precisely:\n"${editText}"\n\nRules:\n- Preserve the overall layout, typography style, brand identity, and Russian text quality.\n- Only modify what the user explicitly asked to change.\n- Keep all other elements exactly as they are.\n- The result must still look like a premium product card.\n- All text must remain in Russian Cyrillic.\n- Output ONLY the modified image.`;

        let imageInput = null;
        if (editSrcUrl) {
          const sourceData = await downloadToBase64(editSrcUrl);
          if (!sourceData) throw new Error('Failed to download source card image');
          imageInput = `data:${sourceData.mimeType};base64,${sourceData.base64str}`;
        } else {
          imageInput = editSrc.startsWith('data:') ? editSrc : `data:image/jpeg;base64,${editSrc}`;
        }
        const resultUrl = await executeKieTask(editPrompt, [imageInput], 'gpt-image-2-image-to-image');
        const dl = await downloadToBase64(resultUrl);
        if (!dl) throw new Error('Failed to download edited card');

        const creditsRemaining = await getCreditsRemainingForReservation(creditReservation);

        incrementGlobalCounter('generationsCardEdit').catch(() => {});

        return res.status(200).json({ success: true, imageBase64: `data:${dl.mimeType};base64,${dl.base64str}`, imageUrl: resultUrl, creditsRemaining });
      } catch (err) {
        console.error(`РІСњРЉ Edit Card error:`, err.message);
        alertOnError(err, `generate-image [edit_card]`).catch(() => {});
        return res.status(200).json({ success: false, error: humanizeGenerationError(err.message) });
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
        return res.status(400).json({ success: false, error: 'Р ВР В·Р С•Р В±РЎР‚Р В°Р В¶Р ВµР Р…Р С‘Р Вµ Р Р…Р Вµ Р Р…Р В°Р в„–Р Т‘Р ВµР Р…Р С• Р Т‘Р В»РЎРЏ Р В°Р Р…Р В°Р В»Р С‘Р В·Р В°' });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.warn('РІС™В РїС‘РЏ GEMINI_API_KEY not set, returning fallback card text');
        return res.status(200).json({
          success: true,
          title: 'Р РЋР СћР ВР вЂєР В¬Р СњР В«Р в„ў Р СћР С›Р вЂ™Р С’Р В ',
          material: 'Р СџРЎР‚Р ВµР СР С‘РЎС“Р С Р С”Р В°РЎвЂЎР ВµРЎРѓРЎвЂљР Р†Р С•',
          size: '',
          benefit: 'Р вЂєРЎС“РЎвЂЎРЎв‚¬Р С‘Р в„– Р Р†РЎвЂ№Р В±Р С•РЎР‚'
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
  "title": "A catchy, short product name in Russian (2-3 words, capitalized, e.g., 'Р С’Р СњР С’Р СћР С›Р СљР ВР В§Р вЂўР РЋР С™Р С’Р Р‡ Р СџР С›Р вЂќР Р€Р РЃР С™Р С’' or 'Р РЃР вЂўР вЂєР С™Р С›Р вЂ™Р С’Р Р‡ Р СџР ВР вЂ“Р С’Р СљР С’')",
  "material": "One key material/composition in Russian (e.g., '100% Р вЂ™Р ВµР В»РЎР‹РЎР‚' or 'Р СњР В°РЎвЂљРЎС“РЎР‚Р В°Р В»РЎРЉР Р…РЎвЂ№Р в„– РЎв‚¬Р ВµР В»Р С”')",
  "size": "One key size/dimension description in Russian (e.g., 'Р В Р В°Р В·Р СР ВµРЎР‚: M-L' or 'Р С›Р В±РЎР‰Р ВµР С: 50 Р СР В»')",
  "benefit": "One strong product benefit or feature in Russian (e.g., 'Р С’Р Р…Р В°РЎвЂљР С•Р СР С‘РЎвЂЎР ВµРЎРѓР С”Р В°РЎРЏ РЎвЂћР С•РЎР‚Р СР В°' or 'Р вЂњР В»РЎС“Р В±Р С•Р С”Р С•Р Вµ РЎС“Р Р†Р В»Р В°Р В¶Р Р…Р ВµР Р…Р С‘Р Вµ')"
}

IMPORTANT: Return ONLY the JSON, no markdown, no markdown blocks, no explanation. DO NOT include any price РІР‚вЂќ the seller sets their own pricing.`;

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
          title: json.title || 'Р РЋР СћР ВР вЂєР В¬Р СњР В«Р в„ў Р СћР С›Р вЂ™Р С’Р В ',
          material: json.material || 'Р СџРЎР‚Р ВµР СР С‘РЎС“Р С Р С”Р В°РЎвЂЎР ВµРЎРѓРЎвЂљР Р†Р С•',
          size: json.size || '',
          benefit: json.benefit || 'Р вЂєРЎС“РЎвЂЎРЎв‚¬Р С‘Р в„– Р Р†РЎвЂ№Р В±Р С•РЎР‚'
        });
      } catch (err) {
        console.error('РІСњРЉ Gemini card text generation failed:', err.message);
        return res.status(200).json({
          success: true,
          title: 'Р РЋР СћР ВР вЂєР В¬Р СњР В«Р в„ў Р СћР С›Р вЂ™Р С’Р В ',
          material: 'Р СџРЎР‚Р ВµР СР С‘РЎС“Р С Р С”Р В°РЎвЂЎР ВµРЎРѓРЎвЂљР Р†Р С•',
          size: '',
          benefit: 'Р вЂєРЎС“РЎвЂЎРЎв‚¬Р С‘Р в„– Р Р†РЎвЂ№Р В±Р С•РЎР‚'
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
      previewMode: _previewMode,
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
      isPhotoshoot = false,
      photoshootFrameIndex,
      photoshootBatchSize,
    } = req.body;

    // РІвЂўС’РІвЂўС’РІвЂўС’ PHOTO EDIT MODE РІР‚вЂќ precise, non-destructive editing РІвЂўС’РІвЂўС’РІвЂўС’
    // Sends the EXISTING photo + edit instruction to Gemini.
    // Does NOT regenerate from scratch РІР‚вЂќ only modifies what the user asked for.
    if (isPhotoEdit && editInstruction) {
      console.log(`РІСљРЏРїС‘РЏ [${new Date().toISOString()}] Photo Edit: "${editInstruction}"`);
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
          return res.status(200).json({ success: false, error: 'Р СњР ВµРЎвЂљ Р С‘РЎРѓРЎвЂ¦Р С•Р Т‘Р Р…Р С•Р С–Р С• Р С‘Р В·Р С•Р В±РЎР‚Р В°Р В¶Р ВµР Р…Р С‘РЎРЏ Р Т‘Р В»РЎРЏ РЎР‚Р ВµР Т‘Р В°Р С”РЎвЂљР С‘РЎР‚Р С•Р Р†Р В°Р Р…Р С‘РЎРЏ.' });
        }

        console.log(`РІСљРЏРїС‘РЏ Source image: ${sourceData.mimeType}, ${Math.round(sourceData.base64str.length / 1024)}KB base64`);

        const editPrompt = `PHOTO EDITING MODE РІР‚вЂќ NON-DESTRUCTIVE RETOUCHING.

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

        const resultUrl = await executeKieTask(editPrompt, [`data:${sourceData.mimeType};base64,${sourceData.base64str}`], 'gpt-image-2-image-to-image');
        console.log(`РІСљвЂ¦ [${((Date.now() - startTime) / 1000).toFixed(1)}s] Photo edit complete. Downloading result...`);
        const dl = await downloadToBase64(resultUrl);
        if (!dl) throw new Error("Failed to download edited image");
        const creditsRemaining = await getCreditsRemainingForReservation(creditReservation);
        
        return res.status(200).json({ success: true, imageBase64: `data:${dl.mimeType};base64,${dl.base64str}`, imageUrl: resultUrl, creditsRemaining });
      } catch (editError) {
        console.error(`РІСњРЉ Photo edit error:`, editError.message);
        return res.status(200).json({ success: false, error: `Р С›РЎв‚¬Р С‘Р В±Р С”Р В° РЎР‚Р ВµР Т‘Р В°Р С”РЎвЂљР С‘РЎР‚Р С•Р Р†Р В°Р Р…Р С‘РЎРЏ: ${editError.message}` });
      }
    }

    // РІвЂўС’РІвЂўС’РІвЂўС’ GARMENT SOURCE RESOLUTION РІвЂўС’РІвЂўС’РІвЂўС’
    // Handles: Firebase Storage URLs, base64 data URLs (fallback), legacy fields
    let garmentImages = [];
    if (garmentImageUrls.length > 0) {
      console.log(`РІВРѓРїС‘РЏ Processing ${garmentImageUrls.length} garment source(s)...`);
      const processed = await Promise.all(garmentImageUrls.map(async (url) => {
        if (url.startsWith('data:')) {
          // Already a base64 data URL РІР‚вЂќ use directly (fallback mode when Storage is down)
          console.log('  СЂСџвЂњР‹ Using base64 data URL directly (Storage fallback)');
          return url;
        }
        // Firebase Storage URL РІР‚вЂќ download server-side
        const dl = await downloadToBase64(url);
        return dl ? `data:${dl.mimeType};base64,${dl.base64str}` : null;
      }));
      garmentImages = processed.filter(Boolean);
      console.log(`РІВРѓРїС‘РЏ Resolved ${garmentImages.length}/${garmentImageUrls.length} garment(s) successfully`);
    } else if (garmentImagesBase64.length > 0) {
      garmentImages = garmentImagesBase64;
    } else if (garmentImageBase64) {
      garmentImages = [garmentImageBase64];
    }
    
    console.log(`СЂСџС™Р‚ [${new Date().toISOString()}] Р вЂ”Р В°Р С—РЎР‚Р С•РЎРѓ: calibration=${isCalibration}, garments=${garmentImages.length}, refs=${modelReferenceImages?.length || 0}, edit=${editInstruction || 'none'}, beauty=${isBeautyMode}, source=${garmentImageUrls.length > 0 ? 'URLs' : 'base64'}`);

    // Detect gender from model preset text
    const gender = detectGender(modelPreset);

    // Build XML attribute directives from structured selections (gender-aware)
    const attrDirectives = buildAttributeDirectives(attributes, gender);
    const bioNoise = getBiometricNoise(biometricSeed);
    const skinPrompt = isBeautyMode ? _P.SKIN_BEAUTY_PROMPT : _P.SKIN_REALISM_PROMPT;
    const genderLock = buildGenderLock(gender);
    const selectedPose = selectPoseFromSeed(biometricSeed, gender);
    const variationDirective = isPhotoshoot
      ? `<PHOTOSHOOT_FRAME_DIRECTIVE>
This is frame ${photoshootFrameIndex || '?'} of ${photoshootBatchSize || '?'} in a multi-frame photoshoot.
The output MUST be a visually distinct photograph from the other frames in this batch.
Do NOT reuse the same body silhouette, crop, leg position, arm position, facial expression, or camera distance from any previous frame.
The target pose and camera below are mandatory and override any reference-image composition.
</PHOTOSHOOT_FRAME_DIRECTIVE>`
      : biometricSeed
        ? `<VARIATION_DIRECTIVE>
Unique generation id: ${biometricSeed}. Produce a fresh composition for this exact request. Do not duplicate another returned frame from the same batch.
</VARIATION_DIRECTIVE>`
        : '';

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
      console.log(`РІРЏС– [${((Date.now() - startTime) / 1000).toFixed(1)}s] Р С›РЎвЂљР С—РЎР‚Р В°Р Р†Р В»РЎРЏР ВµР С Р С”Р В°Р В»Р С‘Р В±РЎР‚Р С•Р Р†Р С”РЎС“ Р Р† KIE.ai...`);
      const resultUrl = await executeKieTask(calibPrompt, imageInputs, 'gpt-image-2-image-to-image');
      console.log(`РІСљвЂ¦ [${((Date.now() - startTime) / 1000).toFixed(1)}s] Р С™Р В°Р В»Р С‘Р В±РЎР‚Р С•Р Р†Р С”Р В° РЎС“РЎРѓР С—Р ВµРЎв‚¬Р Р…Р В°. Downloading result...`);
      const dl = await downloadToBase64(resultUrl);
      if (!dl) throw new Error("Failed to download generated image");
      const creditsRemaining = await getCreditsRemainingForReservation(creditReservation);
      return res.status(200).json({ success: true, imageBase64: `data:${dl.mimeType};base64,${dl.base64str}`, imageUrl: resultUrl, creditsRemaining });
    }

    // РІвЂўС’РІвЂўС’РІвЂўС’ MODEL CARD РІР‚вЂќ Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”Р В° Р СР В°РЎР‚Р С”Р ВµРЎвЂљР С—Р В»Р ВµР в„–РЎРѓР В° РЎРѓ Р СР С•Р Т‘Р ВµР В»РЎРЉРЎР‹ РЎвЂЎР ВµРЎР‚Р ВµР В· GPT Image 2 РІвЂўС’РІвЂўС’РІвЂўС’
    if (isModelCard) {
      const elapsed = () => ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`СЂСџвЂВ¤ [${elapsed()}s] Model Card Mode: style=${quickCardStyle}, source=${garmentImageUrls?.length || 0} URLs`);
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
          return res.status(200).json({ success: false, error: 'Р СњР ВµРЎвЂљ Р С‘РЎРѓРЎвЂ¦Р С•Р Т‘Р Р…Р С•Р С–Р С• РЎвЂћР С•РЎвЂљР С• Р Т‘Р В»РЎРЏ РЎРѓР С•Р В·Р Т‘Р В°Р Р…Р С‘РЎРЏ Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”Р С‘ РЎРѓ Р СР С•Р Т‘Р ВµР В»РЎРЉРЎР‹.' });
        }

        const modelPrompt = isPhotoOnly ? _P.MODEL_PHOTO_PROMPT : (quickCardStyle === 'epic' ? _P.MODEL_CARD_PROMPT_EPIC : _P.MODEL_CARD_PROMPT_NATURAL);
        let finalPrompt = modelPrompt;
        if (userProductInfo && userProductInfo.trim()) {
          finalPrompt += `\n\nUSER PROVIDED PRODUCT INFORMATION (use this for text on the card):\n${userProductInfo.trim()}`;
        }

        console.log(`СЂСџвЂВ¤ [${elapsed()}s] Sending MODEL CARD to KIE.ai (gpt-image-2, style=${quickCardStyle})...`);
        const resultUrl = await executeKieTask(finalPrompt, modelCardImages, 'gpt-image-2-image-to-image');
        console.log(`РІСљвЂ¦ [${elapsed()}s] Model card ready. Downloading...`);
        const dl = await downloadToBase64(resultUrl);
        if (!dl) throw new Error('Failed to download model card from KIE.ai');

        const creditsRemaining = await getCreditsRemainingForReservation(creditReservation);

        incrementGlobalCounter('generationsModelCard').catch(() => {});
        saveGenerationLog({ userId: verifiedUid, success: true, imageUrl: resultUrl, reqBody: req.body, durationMs: Date.now() - startTime }).catch(() => {});

        return res.status(200).json({ success: true, imageBase64: `data:${dl.mimeType};base64,${dl.base64str}`, imageUrl: resultUrl, creditsRemaining, _debug: { promptKey: 'MODEL_CARD_PROMPT', promptLang: _promptLang, model: 'gpt-image-2-image-to-image via KIE.ai', ratio: '3:4' } });
      } catch (modelErr) {
        console.error(`РІСњРЉ Model card error:`, modelErr.message);
        alertOnError(modelErr, `generate-image [model_card]`).catch(() => {});
        return res.status(200).json({ success: false, error: `Р С›РЎв‚¬Р С‘Р В±Р С”Р В° РЎРѓР С•Р В·Р Т‘Р В°Р Р…Р С‘РЎРЏ Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”Р С‘ РЎРѓ Р СР С•Р Т‘Р ВµР В»РЎРЉРЎР‹: ${modelErr.message.substring(0, 200)}` });
      }
    }

    // РІвЂўС’РІвЂўС’РІвЂўС’ UGC MODE РІР‚вЂќ РЎР‚Р ВµР В°Р В»Р С‘РЎРѓРЎвЂљР С‘РЎвЂЎР Р…РЎвЂ№Р Вµ РЎвЂћР С•РЎвЂљР С• Р’В«Р С•РЎвЂљ Р С—Р С•Р С”РЎС“Р С—Р В°РЎвЂљР ВµР В»Р ВµР в„–Р’В» РЎвЂЎР ВµРЎР‚Р ВµР В· GPT Image 2 РІвЂўС’РІвЂўС’РІвЂўС’
    if (isUgcMode) {
      const elapsed = () => ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`СЂСџвЂњВ± [${elapsed()}s] UGC Mode: source=${garmentImageUrls?.length || 0} URLs`);
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
          return res.status(200).json({ success: false, error: 'Р СњР ВµРЎвЂљ Р С‘РЎРѓРЎвЂ¦Р С•Р Т‘Р Р…Р С•Р С–Р С• РЎвЂћР С•РЎвЂљР С• Р Т‘Р В»РЎРЏ РЎРѓР С•Р В·Р Т‘Р В°Р Р…Р С‘РЎРЏ UGC.' });
        }

        console.log(`СЂСџвЂњВ± [${elapsed()}s] Sending UGC to KIE.ai (gpt-image-2)...`);
        const resultUrl = await executeKieTask(_P.UGC_PROMPT, ugcImageInputs, 'gpt-image-2-image-to-image');
        console.log(`РІСљвЂ¦ [${elapsed()}s] UGC ready. Downloading...`);
        const dl = await downloadToBase64(resultUrl);
        if (!dl) throw new Error('Failed to download UGC from KIE.ai');

        const creditsRemaining = await getCreditsRemainingForReservation(creditReservation);

        incrementGlobalCounter('generationsUgc').catch(() => {});
        saveGenerationLog({ userId: verifiedUid, success: true, imageUrl: resultUrl, reqBody: req.body, durationMs: Date.now() - startTime }).catch(() => {});

        return res.status(200).json({ success: true, imageBase64: `data:${dl.mimeType};base64,${dl.base64str}`, imageUrl: resultUrl, creditsRemaining, _debug: { promptKey: 'UGC_PROMPT', promptLang: _promptLang, model: 'gpt-image-2-image-to-image via KIE.ai' } });
      } catch (ugcErr) {
        console.error(`РІСњРЉ UGC error:`, ugcErr.message);
        alertOnError(ugcErr, `generate-image [ugc]`).catch(() => {});
        return res.status(200).json({ success: false, error: `Р С›РЎв‚¬Р С‘Р В±Р С”Р В° РЎРѓР С•Р В·Р Т‘Р В°Р Р…Р С‘РЎРЏ UGC-РЎвЂћР С•РЎвЂљР С•: ${ugcErr.message.substring(0, 200)}` });
      }
    }

    // РІвЂўС’РІвЂўС’РІвЂўС’ QUICK CARD РІР‚вЂќ Р С—Р С•Р В»Р Р…Р С•РЎвЂ Р ВµР Р…Р Р…Р В°РЎРЏ Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”Р В° Р СР В°РЎР‚Р С”Р ВµРЎвЂљР С—Р В»Р ВµР в„–РЎРѓР В° РЎвЂЎР ВµРЎР‚Р ВµР В· GPT Image 2 РІвЂўС’РІвЂўС’РІвЂўС’
    if (isQuickCard) {
      const elapsed = () => ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`СЂСџвЂњвЂ№ [${elapsed()}s] Quick Card: style=${quickCardStyle}, source=${garmentImageUrls?.length || 0} URLs, userInfo=${userProductInfo?.length || 0} chars`);
      try {
        let cardImageInputs = [];
        // Р СџР С•Р В»РЎС“РЎвЂЎР В°Р ВµР С Р С‘Р В·Р С•Р В±РЎР‚Р В°Р В¶Р ВµР Р…Р С‘Р Вµ РЎвЂљР С•Р Р†Р В°РЎР‚Р В°
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
          return res.status(200).json({ success: false, error: 'Р СњР ВµРЎвЂљ Р С‘РЎРѓРЎвЂ¦Р С•Р Т‘Р Р…Р С•Р С–Р С• РЎвЂћР С•РЎвЂљР С• Р Т‘Р В»РЎРЏ РЎРѓР С•Р В·Р Т‘Р В°Р Р…Р С‘РЎРЏ Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”Р С‘.' });
        }

        // Р вЂ™РЎвЂ№Р В±Р С‘РЎР‚Р В°Р ВµР С РЎРѓР С‘РЎРѓРЎвЂљР ВµР СР Р…РЎвЂ№Р в„– Р С—РЎР‚Р С•Р СР С—РЎвЂљ Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”Р С‘
        const cardPrompt = quickCardStyle === 'epic' ? _P.QUICK_CARD_PROMPT_EPIC : _P.QUICK_CARD_PROMPT_NATURAL;
        // Р вЂўРЎРѓР В»Р С‘ Р С—Р С•Р В»РЎРЉР В·Р С•Р Р†Р В°РЎвЂљР ВµР В»РЎРЉ Р Т‘Р С•Р В±Р В°Р Р†Р С‘Р В» Р С‘Р Р…РЎвЂћР С•РЎР‚Р СР В°РЎвЂ Р С‘РЎР‹ РІР‚вЂќ Р Р†РЎРѓРЎвЂљР В°Р Р†Р В»РЎРЏР ВµР С Р Р† Р С—РЎР‚Р С•Р СР С—РЎвЂљ
        const fullPrompt = userProductInfo && userProductInfo.trim()
          ? `${cardPrompt}\n\n<USER_PROVIDED_PRODUCT_INFO>\nThe seller has provided the following verified product information. Use ONLY this data for text on the card. Do NOT invent additional claims.\n${userProductInfo.trim()}\n</USER_PROVIDED_PRODUCT_INFO>`
          : cardPrompt;

        console.log(`СЂСџвЂњвЂ№ [${elapsed()}s] Sending Quick Card to KIE.ai (gpt-image-2)...`);
        const resultUrl = await executeKieTask(fullPrompt, cardImageInputs, 'gpt-image-2-image-to-image');
        console.log(`РІСљвЂ¦ [${elapsed()}s] Quick Card ready. Downloading...`);
        const dl = await downloadToBase64(resultUrl);
        if (!dl) throw new Error('Failed to download quick card from KIE.ai');

        const creditsRemaining = await getCreditsRemainingForReservation(creditReservation);

        incrementGlobalCounter('generationsQuickCard').catch(() => {});
        saveGenerationLog({ userId: verifiedUid, success: true, imageUrl: resultUrl, reqBody: req.body, durationMs: Date.now() - startTime }).catch(() => {});

        return res.status(200).json({ success: true, imageBase64: `data:${dl.mimeType};base64,${dl.base64str}`, imageUrl: resultUrl, creditsRemaining, _debug: { promptKey: 'QUICK_CARD_PROMPT', promptLang: _promptLang, model: 'gpt-image-2-image-to-image via KIE.ai', ratio: '3:4' } });
      } catch (cardErr) {
        console.error(`РІСњРЉ Quick Card error:`, cardErr.message);
        alertOnError(cardErr, `generate-image [quick_card]`).catch(() => {});
        return res.status(200).json({ success: false, error: `Р С›РЎв‚¬Р С‘Р В±Р С”Р В° РЎРѓР С•Р В·Р Т‘Р В°Р Р…Р С‘РЎРЏ Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”Р С‘: ${cardErr.message.substring(0, 200)}` });
      }
    }

    // РІвЂўС’РІвЂўС’РІвЂўС’ CARD DESIGN MODE РІР‚вЂќ Р СР В°РЎР‚Р С”Р ВµРЎвЂљР С—Р В»Р ВµР в„–РЎРѓР Р…Р В°РЎРЏ Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”Р В° РЎвЂљР С•Р Р†Р В°РЎР‚Р В° РІвЂўС’РІвЂўС’РІвЂўС’
    if (isCardDesign) {
      const elapsed = () => ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`СЂСџР‹Т‘ [${elapsed()}s] Card Design: style=${cardStyle}, source=${sourceImageUrl ? 'url' : sourceImageBase64 ? 'base64' : 'garment'}`);
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
          return res.status(200).json({ success: false, error: 'Р СњР ВµРЎвЂљ Р С‘РЎРѓРЎвЂ¦Р С•Р Т‘Р Р…Р С•Р С–Р С• РЎвЂћР С•РЎвЂљР С• Р Т‘Р В»РЎРЏ РЎРѓР С•Р В·Р Т‘Р В°Р Р…Р С‘РЎРЏ Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”Р С‘.' });
        }

        const EPIC_CARD_PROMPT = `ROLE: Elite Russian E-commerce Art Director (Wildberries/Ozon).
TASK: Transform this product photo into a stunning marketplace card background template.
STYLE: EPIC РІР‚вЂќ Dark cinematic. Deep mysterious dark background (#06060c to #111122 gradient) with dynamic abstract shapes, light beams or soft glowing particles.
LAYOUT: Place the product photo on the right/center (55-60% of card width) with realistic contact shadows and glowing ambient backlighting.
TEXT WARNING: DO NOT WRITE ANY TEXT, WORDS, LETTERS, CHARACTERS, NUMBERS OR BADGES ON THE IMAGE. Keep the left side (approx 40-45% width) completely clean and empty for text overlay.
OUTPUT: A clean, high-end marketplace background template with the product integrated, containing NO text or letters.`;

        const NATURAL_CARD_PROMPT = `ROLE: Elite Russian E-commerce Art Director (Wildberries/Ozon).
TASK: Transform this product photo into a stunning marketplace card background template.
STYLE: NATURAL РІР‚вЂќ Clean, premium lifestyle. Soft cream, beige, or warm white minimalist aesthetic background (#faf8f5) with soft shadows or organic shadows.
LAYOUT: Place the product in the center-bottom or right (55% height/width) with realistic soft ground shadows.
TEXT WARNING: DO NOT WRITE ANY TEXT, WORDS, LETTERS, CHARACTERS, NUMBERS OR BADGES ON THE IMAGE. Keep the top/left area clean and empty for text overlay.
OUTPUT: A clean, high-end marketplace background template with the product integrated, containing NO text or letters.`;

        const cardPrompt = cardStyle === 'epic' ? EPIC_CARD_PROMPT : NATURAL_CARD_PROMPT;

        console.log(`СЂСџР‹Т‘ [${elapsed()}s] Sending to KIE.ai gpt-image-2...`);
        const resultUrl = await executeKieTask(cardPrompt, cardImageInputs, 'gpt-image-2-image-to-image');
        console.log(`РІСљвЂ¦ [${elapsed()}s] Card design ready. Downloading...`);
        const dl = await downloadToBase64(resultUrl);
        if (!dl) throw new Error('Failed to download card design from KIE.ai');

        incrementGlobalCounter('generationsCard').catch(() => {});
        saveGenerationLog({ userId: verifiedUid, success: true, imageUrl: resultUrl, reqBody: req.body, durationMs: Date.now() - startTime }).catch(() => {});
        const creditsRemaining = await getCreditsRemainingForReservation(creditReservation);

        return res.status(200).json({ success: true, imageBase64: `data:${dl.mimeType};base64,${dl.base64str}`, imageUrl: resultUrl, creditsRemaining });
      } catch (cardErr) {
        console.error(`РІСњРЉ Card Design error:`, cardErr.message);
        alertOnError(cardErr, `generate-image [card_design]`).catch(() => {});
        return res.status(200).json({ success: false, error: `Р С›РЎв‚¬Р С‘Р В±Р С”Р В° РЎРѓР С•Р В·Р Т‘Р В°Р Р…Р С‘РЎРЏ Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”Р С‘: ${cardErr.message.substring(0, 200)}` });
      }
    }

    // РІвЂўС’РІвЂўС’РІвЂўС’ PRODUCT MODE РІР‚вЂќ Р С—РЎР‚Р ВµР Т‘Р СР ВµРЎвЂљР Р…Р В°РЎРЏ РЎРѓРЎР‰Р ВµР СР С”Р В° РЎвЂљР С•Р Р†Р В°РЎР‚Р С•Р Р† РІвЂўС’РІвЂўС’РІвЂўС’
    // Р ВРЎРѓР С—Р С•Р В»РЎРЉР В·РЎС“Р ВµРЎвЂљ buildProductPrompt() Р Р†Р СР ВµРЎРѓРЎвЂљР С• fashion pipeline
    if (isProductMode) {

      console.log(`СЂСџвЂњВ¦ [${((Date.now() - startTime) / 1000).toFixed(1)}s] Product Mode: category=${categoryId}, images=${garmentImages.length}, withModel=${withHumanModel}`);
      
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

      // Р В Р ВµРЎвЂћР ВµРЎР‚Р ВµР Р…РЎРѓРЎвЂ№ Р СР С•Р Т‘Р ВµР В»Р С‘-РЎвЂЎР ВµР В»Р С•Р Р†Р ВµР С”Р В°
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

      // Р СџР С•Р Т‘Р Т‘Р ВµРЎР‚Р В¶Р С”Р В° Р В»Р С•Р С”Р В°РЎвЂ Р С‘Р в„– Р Т‘Р В»РЎРЏ РЎвЂљР С•Р Р†Р В°РЎР‚Р С•Р Р†
      if (locationImages && Array.isArray(locationImages) && locationImages.length > 0) {
        console.log(`СЂСџвЂњРЊ [Product] Loading ${locationImages.length} location image(s)...`);
        for (const img of locationImages.slice(0, 5)) {
          if (img.startsWith('data:')) { imageInputs.push(img); }
          else if (img.startsWith('http')) {
            const result = await downloadToBase64(img);
            if (result) {
              imageInputs.push(`data:${result.mimeType};base64,${result.base64str}`);
              console.log(`РІСљвЂ¦ [Product] Location image loaded OK (${result.base64str.length} bytes b64)`);
            } else {
              console.error(`РІСњРЉ [Product] FAILED to load location image: ${img.substring(0, 80)}`);
            }
          }
        }
        console.log(`СЂСџвЂњРЊ [Product] After loc load: imageInputs.length=${imageInputs.length}`);
      }

      console.log(`РІРЏС– [${((Date.now() - startTime) / 1000).toFixed(1)}s] Product Mode РІвЂ вЂ™ KIE.ai (gpt-image-2), ${imageInputs.length} image(s), model=${withHumanModel}...`);
      const resultUrl = await executeKieTask(productPromptText, imageInputs, 'gpt-image-2-image-to-image');
      console.log(`РІСљвЂ¦ [${((Date.now() - startTime) / 1000).toFixed(1)}s] Product shot ready. Downloading...`);
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
      ? 'MULTIPLE garment assets provided РІР‚вЂќ extract and drape ALL of them simultaneously.'
      : '';
    const hasModelRef = !!(modelReferenceImages && modelReferenceImages.length);
    const modelInstruction = hasModelRef
      ? 'CRITICAL: Reference photos of the EXACT person are provided. You MUST replicate their face, skin tone, features, and overall appearance.'
      : '';
    const poseStr = customPoseText || posePreset;

    // РІвЂўС’РІвЂўС’РІвЂўС’ GARMENT SANITIZATION РІР‚вЂќ CRITICAL: must run before SCHEMA pipeline РІвЂўС’РІвЂўС’РІвЂўС’
    // Deep Think suggested removing this, but was WRONG. Semantic masking in text
    // alone does NOT prevent identity leak. Gemini still extracts facial features
    // from raw photos. The solid black box physically destroys face pixels and
    // is the ONLY proven method that blocks identity transfer.
    if (garmentImages.length > 0) {
      console.log(`СЂСџВ§в„– [${((Date.now() - startTime) / 1000).toFixed(1)}s] Sanitizing ${garmentImages.length} garment image(s) (solid black box)...`);
      garmentImages = await Promise.all(
        garmentImages.map((img, i) => sanitizeGarmentImage(img, i))
      );
      console.log(`СЂСџВ§в„– [${((Date.now() - startTime) / 1000).toFixed(1)}s] Sanitization complete`);
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
ABSOLUTE PRIORITY РІР‚вЂќ The person wearing the clothing in these reference images is COMPLETELY IRRELEVANT.
You MUST NOT extract, copy, reference, or be influenced by:
- Their face, facial bone structure, or facial features
- Their skin tone, complexion, or skin texture
- Their body shape, proportions, or posture
- Their hairstyle, hair color, or hair texture
- Their age, ethnicity appearance, or any biometric data
- Their tattoos, jewelry, or accessories

The wearer in the reference photos is a TRANSPARENT INVISIBLE GHOST РІР‚вЂќ a lifeless plastic display mannequin.
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
${variationDirective}
</phase_2_subject_recasting>
`;

    let imageInputs = [];
    for (const img of garmentImages.slice(0, 9)) {
       imageInputs.push(img.startsWith('data:') ? img : `data:image/jpeg;base64,${extractBase64(img).base64str}`);
    }

    if (modelReferenceImages && Array.isArray(modelReferenceImages) && modelReferenceImages.length > 0) {
      promptText += `\n<identity_reference>\nACTOR IDENTITY LOCK:\nUse the attached reference photos ONLY for the person's identity: face, skin tone, hair, body proportions, and recognizability.\nDo NOT copy the reference photo's exact pose, crop, background, lighting, leg position, arm position, or full composition.\nThe TARGET POSE and CAMERA in this request are mandatory and must visibly change the shot.\n</identity_reference>\n`;
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
      console.log(`СЂСџвЂњРЊ [Fashion] Loading ${locationImages.length} location image(s)...`);
      promptText += `\n<location_reference>\nUse the attached location images as reference for the background.\n</location_reference>\n`;
      for (const img of locationImages.slice(0, 5)) {
        if (img.startsWith('data:')) {
          imageInputs.push(img);
        } else if (img.startsWith('http')) {
          const result = await downloadToBase64(img);
          if (result) {
            imageInputs.push(`data:${result.mimeType};base64,${result.base64str}`);
            console.log(`РІСљвЂ¦ [Fashion] Location image loaded OK`);
          } else {
            console.error(`РІСњРЉ [Fashion] FAILED to load location image: ${img.substring(0, 80)}`);
          }
        }
      }
      console.log(`СЂСџвЂњРЊ [Fashion] After loc load: imageInputs.length=${imageInputs.length}`);
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
- ZERO INVENTION (CLOTHING): Do NOT invent, hallucinate, or add ANY structural elements to the clothing. This means: NO added sleeves, NO added undershirts, NO added layers beneath a vest, NO added pockets, NO added belts, NO added zippers, NO added buttons, NO added patterns. If the source garment is a sleeveless vest РІР‚вЂќ the output MUST show a sleeveless vest with bare arms visible. NEVER add a shirt or sweater underneath.
- ZERO INVENTION (BODY): Do NOT add tattoos, piercings, jewelry, watches, bracelets, necklaces, or accessories UNLESS explicitly requested in <APPLIED_CHARACTERISTICS>. If <TATTOO_CONSTRAINT> says NO tattoos РІР‚вЂќ the skin MUST be completely clean.
- CLOTHING PHYSICS: You MUST physically deform, stretch, and adjust the volume of the original clothing to perfectly match the <BODY_OVERRIDE> target. Do NOT lazily copy the body shape from the source garment image.
- MODIFICATION EXPOSURE: If <TATTOO> or <PIERCING> dictates mandatory visibility, ensure the model pose naturally exposes those areas (arms, neck, ears) so the ink/metal is clearly seen.
- IDENTITY LOCK: Do NOT transfer any physical traits, skin tones, or facial structure from the garment reference image to the new actor.
- BODY TYPE LOCK: Do NOT use average, slim, or athletic body proportions if heavy/obese metrics are requested. Do NOT smooth out requested curves or fat.
- Do NOT alter the fabric's original pattern, texture scale, color, or cut.
- OUTPUT FORMAT: Output ONLY pixel data. Do NOT output text. Do NOT describe the image.
</prohibitions>

<trigger>FINAL EXECUTION: Generate the photorealistic render based strictly on the SCHEMA. Execute now.</trigger>
</schema_generation_directive>`;

    console.log(`РІРЏС– [${((Date.now() - startTime) / 1000).toFixed(1)}s] Р С›РЎвЂљР С—РЎР‚Р В°Р Р†Р В»РЎРЏР ВµР С Р В·Р В°Р С—РЎР‚Р С•РЎРѓ Р Р† KIE.ai (gpt-image-2)...`);
    
    const resultUrl = await executeKieTask(promptText, imageInputs, 'gpt-image-2-image-to-image');
    console.log(`РІСљвЂ¦ [${((Date.now() - startTime) / 1000).toFixed(1)}s] Р С™Р В°РЎР‚РЎвЂљР С‘Р Р…Р С”Р В° РЎРѓР С–Р ВµР Р…Р ВµРЎР‚Р С‘РЎР‚Р С•Р Р†Р В°Р Р…Р В°. Downloading result...`);
    const dl = await downloadToBase64(resultUrl);
    if (!dl) throw new Error("Failed to download final generated image from KIE.ai");

    const creditsRemainingFashion = await getCreditsRemainingForReservation(creditReservation);

    // РІвЂўС’РІвЂўС’РІвЂўС’ STATS: Р В°РЎвЂљР С•Р СР В°РЎР‚Р Р…Р С• Р С‘Р Р…Р С”РЎР‚Р ВµР СР ВµР Р…РЎвЂљР С‘РЎР‚РЎС“Р ВµР С РЎРѓРЎвЂЎРЎвЂРЎвЂљРЎвЂЎР С‘Р С” Р С–Р ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘Р в„– РІвЂўС’РІвЂўС’РІвЂўС’
    const mode = req.body?.isCalibration ? 'generationsCalibration' : 'generationsFashion';
    incrementGlobalCounter('generationsTotal').catch(() => {});
    incrementGlobalCounter(mode).catch(() => {});

    // Р вЂ”Р В°Р С—Р С‘РЎРѓРЎвЂ№Р Р†Р В°Р ВµР С Р Т‘Р ВµРЎвЂљР В°Р В»РЎРЉР Р…РЎвЂ№Р в„– Р В»Р С•Р С– РЎС“РЎРѓР С—Р ВµРЎв‚¬Р Р…Р С•Р в„– Р С–Р ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘Р С‘
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
    console.error(`РІСњРЉ [${elapsed}s] Р С›РЎв‚¬Р С‘Р В±Р С”Р В°:`, error.message);
    
    // Р вЂ”Р В°Р С—Р С‘РЎРѓРЎвЂ№Р Р†Р В°Р ВµР С Р Т‘Р ВµРЎвЂљР В°Р В»РЎРЉР Р…РЎвЂ№Р в„– Р В»Р С•Р С– Р С•РЎв‚¬Р С‘Р В±Р С”Р С‘ Р С–Р ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘Р С‘
    saveGenerationLog({
      userId: verifiedUid,
      success: false,
      error: error.message,
      reqBody: req.body,
      durationMs: Date.now() - startTime
    }).catch(() => {});

    // РІвЂўС’РІвЂўС’РІвЂўС’ ADMIN ALERT РІР‚вЂќ Р С•РЎвЂљР С—РЎР‚Р В°Р Р†Р С”Р В° Р Р† Telegram (РЎвЂћР С•Р Р…Р С•Р Р†Р В°РЎРЏ, Р Р…Р Вµ Р В±Р В»Р С•Р С”Р С‘РЎР‚РЎС“Р ВµРЎвЂљ Р С•РЎвЂљР Р†Р ВµРЎвЂљ) РІвЂўС’РІвЂўС’РІвЂўС’
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
    // All other errors → one clear Russian message (raw detail is logged above, never shown to the user)
    console.error('[generate-image] error →', error.name, msg, error.stack?.substring(0, 300));
    return res.status(200).json({ success: false, error: humanizeGenerationError(msg) });
  }
}
