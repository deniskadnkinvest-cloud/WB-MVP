// GET /api/admin/user-history — история генераций текущего пользователя
import jwt from 'jsonwebtoken';
import { query } from '../_db.js';
import { getJwtSecret } from '../_env.js';

function verifyToken(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  try {
    return jwt.verify(token, getJwtSecret());
  } catch {
    return null;
  }
}

let generationColumnsCache = null;

async function getGenerationColumns() {
  if (generationColumnsCache) return generationColumnsCache;

  const result = await query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'generations'
  `);

  generationColumnsCache = new Set(result.rows.map(row => row.column_name));
  return generationColumnsCache;
}

async function resolveUserIdentity(uid, email, dbUserId) {
  // Exact match by the DB id carried in the token — zero ambiguity, no cross-user risk.
  if (dbUserId != null && /^\d+$/.test(String(dbUserId))) {
    return { dbId: Number(dbUserId), candidates: [String(dbUserId)] };
  }

  const rawUid = uid?.startsWith('tg_') ? uid.slice(3) : uid;
  const prefixedUid = rawUid && !rawUid.startsWith('tg_') ? `tg_${rawUid}` : rawUid;
  // ORDER BY id makes the LIMIT 1 deterministic if two rows ever match (e.g. duplicate email).
  const result = await query(
    `SELECT id, telegram_id, email FROM users
     WHERE telegram_id = $1 OR telegram_id = $2 OR telegram_id = $3 OR email = $4
     ORDER BY id ASC
     LIMIT 1`,
    [uid, rawUid, prefixedUid, email || null]
  );
  const user = result.rows[0] || null;

  // generations.user_id is always the integer FK to users.id — scope strictly to it,
  // never to the raw uid/email strings (which can't match an integer column and only widen risk).
  return {
    dbId: user?.id || null,
    candidates: user?.id != null ? [String(user.id)] : [],
  };
}

function parseJsonField(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function rowToGeneration(row) {
  const meta = parseJsonField(row.metadata, {});
  const garmentUrls = parseJsonField(row.garment_urls, meta.garmentUrls || []);
  const attributes = parseJsonField(row.attributes, meta.attributes || {});
  const statusSuccess = row.status
    ? ['success', 'completed'].includes(row.status)
    : row.success !== false;

  return {
    ...meta,
    id: row.id,
    userId: row.user_id,
    success: statusSuccess,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    imageUrl: row.__image_url || row.result_url || row.image_url || meta.imageUrl || null,
    type: row.type || meta.type || 'fashion',
    creditsUsed: row.credits_used ?? meta.creditsUsed ?? 0,
    durationMs: row.duration_ms ?? meta.durationMs ?? 0,
    aspectRatio: row.aspect_ratio || meta.aspectRatio,
    garmentUrls,
    modelPreset: row.model_preset || meta.modelPreset,
    posePreset: row.pose_preset || meta.posePreset,
    backgroundPreset: row.background_preset || meta.backgroundPreset,
    cameraAngle: row.camera_angle || meta.cameraAngle,
    categoryId: row.category_id || meta.categoryId,
    withHumanModel: row.with_human_model ?? meta.withHumanModel,
    isCardDesign: row.is_card_design ?? meta.isCardDesign,
    cardStyle: row.card_style || meta.cardStyle,
    isBeautyMode: row.is_beauty_mode ?? meta.isBeautyMode,
    isPhotoEdit: row.is_photo_edit ?? meta.isPhotoEdit,
    editInstruction: row.edit_instruction || meta.editInstruction,
    customPoseText: row.custom_pose_text || meta.customPoseText,
    attributes,
    userProductInfo: row.user_product_info || meta.userProductInfo,
    quickPromptName: row.quick_prompt_name || meta.quickPromptName,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const decoded = verifyToken(req);
  if (!decoded) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const uid = decoded.uid;

  try {
    const identity = await resolveUserIdentity(uid, decoded.email, decoded.dbUserId);
    if (identity.candidates.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const limitCount = Math.min(parseInt(req.query.limit) || 100, 200);
    const typeFilter = req.query.type;
    const columns = await getGenerationColumns();
    const imageExpression = columns.has('result_url') && columns.has('image_url')
      ? 'COALESCE(result_url, image_url)'
      : columns.has('result_url')
        ? 'result_url'
        : columns.has('image_url')
          ? 'image_url'
          : 'NULL';
    const successFilter = columns.has('status')
      ? `(status = 'success' OR status = 'completed' OR status IS NULL)`
      : columns.has('success')
        ? `success IS TRUE`
        : `TRUE`;

    const where = [`user_id::text = ANY($1::text[])`, successFilter];
    const params = [identity.candidates];
    if (typeFilter && typeFilter !== 'all') {
      where.push(`type = $${params.length + 1}`);
      params.push(typeFilter);
    }
    params.push(limitCount);

    const result = await query(
      `SELECT *, ${imageExpression} AS "__image_url"
       FROM generations
       WHERE ${where.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params
    );

    const generations = result.rows.map(rowToGeneration);

    return res.status(200).json({ ok: true, generations, total: generations.length });
  } catch (err) {
    console.error('[user/history] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
}
