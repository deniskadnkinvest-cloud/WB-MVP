// ═══════════════════════════════════════════════════════════════
// API endpoint: /api/user-data
// CRUD operations for user models, locations, and generations
// Server-side persistence API for the frontend
// ═══════════════════════════════════════════════════════════════

import jwt from 'jsonwebtoken';
import { query } from './_db.js';
import { getJwtSecret } from './_env.js';

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

function getUidCandidates(uid, email) {
  const rawUid = uid?.startsWith('tg_') ? uid.slice(3) : uid;
  const prefixedUid = rawUid && !rawUid.startsWith('tg_') ? `tg_${rawUid}` : rawUid;
  return [...new Set([uid, rawUid, prefixedUid, email].filter(Boolean).map(String))];
}

async function getGenerationUserCandidates(uid, email) {
  const candidates = getUidCandidates(uid, email);
  const result = await query(
    `SELECT id, telegram_id, email FROM users
     WHERE telegram_id = ANY($1::text[]) OR email = ANY($1::text[])
     LIMIT 1`,
    [candidates]
  );
  const user = result.rows[0];
  if (user?.id != null) candidates.push(String(user.id));
  if (user?.telegram_id) candidates.push(String(user.telegram_id));
  if (user?.email) candidates.push(String(user.email));
  return [...new Set(candidates)];
}

async function resolveUserIdentity(uid, email, dbUserId) {
  const candidates = getUidCandidates(uid, email);

  if (dbUserId) {
    const byId = await query(
      `SELECT id, telegram_id, email FROM users WHERE id = $1 LIMIT 1`,
      [dbUserId]
    );
    if (byId.rows[0]) {
      const user = byId.rows[0];
      if (user.telegram_id) candidates.push(String(user.telegram_id));
      if (user.email) candidates.push(String(user.email));
      candidates.push(String(user.id));
      return { dbId: user.id, candidates: [...new Set(candidates)] };
    }
  }

  const result = await query(
    `SELECT id, telegram_id, email FROM users
     WHERE id::text = ANY($1::text[])
        OR telegram_id = ANY($1::text[])
        OR email = ANY($1::text[])
     LIMIT 1`,
    [candidates]
  );
  const user = result.rows[0] || null;
  if (user?.id != null) candidates.push(String(user.id));
  if (user?.telegram_id) candidates.push(String(user.telegram_id));
  if (user?.email) candidates.push(String(user.email));

  return {
    dbId: user?.id || null,
    candidates: [...new Set(candidates)],
  };
}

async function getActivePlan(userId) {
  if (!userId) return 'none';
  const result = await query(
    `SELECT plan_name
     FROM subscriptions
     WHERE user_id = $1
       AND status = 'active'
       AND plan_name IN ('trial', 'base', 'pro')
       AND (expires_at IS NULL OR expires_at > NOW() OR granted_by_admin IS TRUE)
     LIMIT 1`,
    [userId]
  );
  return result.rows[0]?.plan_name || 'none';
}

function featureDenied(res, message) {
  return res.status(403).json({
    ok: false,
    code: 'FEATURE_NOT_AVAILABLE',
    error: message,
  });
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const decoded = verifyToken(req);
  if (!decoded) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const uid = decoded.uid;

  try {
    const identity = await resolveUserIdentity(uid, decoded.email, decoded.dbUserId);

    // ═══ GET — Fetch data ═══
    if (req.method === 'GET') {
      const { type, limit: limitStr } = req.query;
      const maxResults = parseInt(limitStr) || 50;

      if (type === 'generations') {
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
        const result = await query(
          `SELECT *, ${imageExpression} AS "__image_url"
           FROM generations
           WHERE user_id::text = ANY($1::text[])
             AND ${successFilter}
           ORDER BY created_at DESC LIMIT $2`,
          [identity.candidates.length ? identity.candidates : await getGenerationUserCandidates(uid, decoded.email), maxResults]
        );
        return res.json({ ok: true, data: result.rows.map(rowToGeneration) });
      }

      if (type === 'models') {
        if (!identity.dbId) return res.status(404).json({ ok: false, error: 'User not found' });
        const result = await query(
          `SELECT * FROM models WHERE user_id = $1
           ORDER BY created_at DESC`,
          [identity.dbId]
        );
        return res.json({ ok: true, data: result.rows.map(rowToModel) });
      }

      if (type === 'locations') {
        if (!identity.dbId) return res.status(404).json({ ok: false, error: 'User not found' });
        const result = await query(
          `SELECT * FROM locations WHERE user_id = $1
           ORDER BY created_at DESC`,
          [identity.dbId]
        );
        return res.json({ ok: true, data: result.rows.map(rowToLocation) });
      }

      return res.status(400).json({ ok: false, error: 'Unknown type' });
    }

    // ═══ POST — Create data ═══
    if (req.method === 'POST') {
      const { type, ...data } = req.body || {};

      if (type === 'model') {
        if (!identity.dbId) return res.status(404).json({ ok: false, error: 'User not found' });
        const plan = await getActivePlan(identity.dbId);
        if (!['trial', 'base', 'pro'].includes(plan)) {
          return featureDenied(res, 'Сохранение своей модели доступно после подключения тарифа.');
        }
        const modelSubType = data.model_type || data.type || 'unknown';
        // Remove temporary model_type if present to keep metadata clean
        delete data.model_type;
        // id/uid в metadata затеняли PG-id при чтении (см. rowToModel) — не сохраняем
        delete data.id;
        delete data.uid;
        const result = await query(
          `INSERT INTO models (user_id, type, image_url, metadata)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [identity.dbId, modelSubType, data.imageUrls?.[0] || data.image_url || '', JSON.stringify({ ...data, type: modelSubType })]
        );
        return res.json({ ok: true, data: rowToModel(result.rows[0]) });
      }

      if (type === 'location') {
        if (!identity.dbId) return res.status(404).json({ ok: false, error: 'User not found' });
        const plan = await getActivePlan(identity.dbId);
        if (!['base', 'pro'].includes(plan)) {
          return featureDenied(res, 'Свои локации доступны на тарифах Про и Gold Seller.');
        }
        const result = await query(
          `INSERT INTO locations (user_id, name, image_url, metadata)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [identity.dbId, data.title || 'Без названия', data.imageUrls?.[0] || data.thumbnail || '', JSON.stringify(data)]
        );
        return res.json({ ok: true, data: rowToLocation(result.rows[0]) });
      }

      return res.status(400).json({ ok: false, error: 'Unknown type' });
    }

    // ═══ PATCH — Update data ═══
    if (req.method === 'PATCH') {
      const { type, id, ...fields } = req.body || {};

      if (type === 'model' && id) {
        if (!identity.dbId) return res.status(404).json({ ok: false, error: 'User not found' });
        // Получаем текущие данные из БД
        const existing = await query(`SELECT type, image_url, metadata FROM models WHERE id = $1 AND user_id = $2`, [id, identity.dbId]);
        if (!existing.rows[0]) return res.status(404).json({ ok: false, error: 'Model not found' });

        const oldMeta = existing.rows[0].metadata || {};
        const newMeta = { ...oldMeta, ...fields };

        // Тип модели и URL картинки берем из переданных полей или оставляем старые
        const typeVal = fields.model_type || fields.type || existing.rows[0].type;
        const imageUrlVal = fields.imageUrls?.[0] || fields.image_url || existing.rows[0].image_url;

        // Очищаем служебные поля из metadata
        delete newMeta.model_type;
        delete newMeta.type;
        delete newMeta.id;
        delete newMeta.uid;

        await query(
          `UPDATE models SET type = $1, image_url = $2, metadata = $3 WHERE id = $4 AND user_id = $5`,
          [typeVal, imageUrlVal, JSON.stringify(newMeta), id, identity.dbId]
        );
        return res.json({ ok: true });
      }

      if (type === 'location' && id) {
        if (!identity.dbId) return res.status(404).json({ ok: false, error: 'User not found' });
        const existing = await query(`SELECT metadata FROM locations WHERE id = $1 AND user_id = $2`, [id, identity.dbId]);
        const oldMeta = existing.rows[0]?.metadata || {};
        const newMeta = { ...oldMeta, ...fields };
        const nameUpdate = fields.title || fields.name;
        if (nameUpdate) {
          await query(
            `UPDATE locations SET name = $1, metadata = $2 WHERE id = $3 AND user_id = $4`,
            [nameUpdate, JSON.stringify(newMeta), id, identity.dbId]
          );
        } else {
          await query(
            `UPDATE locations SET metadata = $1 WHERE id = $2 AND user_id = $3`,
            [JSON.stringify(newMeta), id, identity.dbId]
          );
        }
        return res.json({ ok: true });
      }

      return res.status(400).json({ ok: false, error: 'Unknown type or missing id' });
    }

    // ═══ DELETE — Delete data ═══
    if (req.method === 'DELETE') {
      const { type, id } = req.query;

      if (type === 'model' && id) {
        if (!identity.dbId) return res.status(404).json({ ok: false, error: 'User not found' });
        await query(
          `DELETE FROM models WHERE id = $1 AND user_id = $2`,
          [id, identity.dbId]
        );
        return res.json({ ok: true });
      }

      if (type === 'location' && id) {
        if (!identity.dbId) return res.status(404).json({ ok: false, error: 'User not found' });
        await query(
          `DELETE FROM locations WHERE id = $1 AND user_id = $2`,
          [id, identity.dbId]
        );
        return res.json({ ok: true });
      }

      return res.status(400).json({ ok: false, error: 'Unknown type or missing id' });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('[user-data] Error:', err);
    return res.status(500).json({ ok: false, error: 'Не удалось обработать данные пользователя.' });
  }
}

// ═══ Row → Frontend-compatible object mappers ═══

import { getPublicUrl } from './_s3.js';

function rewriteS3Url(url) {
  if (!url) return url;
  if (url.startsWith('data:')) return url;
  const match = url.match(/(users\/[^?]+)/);
  if (match) {
    return getPublicUrl(match[1]);
  }
  return url;
}

// ВАЖНО: во всех мапперах spread метаданных идёт ПЕРВЫМ, а канонические поля
// (id из PostgreSQL и т.д.) — ПОСЛЕ него. У legacy-записей metadata содержит
// старый строковый id ("38E6D7..."), и при обратном порядке он перезаписывал
// числовой PG-id → PATCH/DELETE по такому id падали, а UI работал с фантомом.
function rowToGeneration(row) {
  const meta = row.metadata || {};
  return {
    ...meta,
    id: row.id,
    userId: row.user_id,
    success: row.status ? ['success', 'completed'].includes(row.status) : row.success !== false,
    createdAt: row.created_at?.toISOString(),
    imageUrl: rewriteS3Url(row.__image_url || row.result_url || row.image_url || meta.imageUrl),
    type: row.type || meta.type,
    durationMs: row.duration_ms || meta.durationMs || 0,
    creditsUsed: row.credits_used || meta.creditsUsed || 0,
  };
}

function rowToModel(row) {
  const meta = row.metadata || {};
  const { imageUrls: metaImageUrls, ...otherMeta } = meta;
  // Пустые строки выбрасываем: [''] считался «есть референсы», а на бэке
  // генерации фильтровался в ноль → модель без единого рабочего фото
  const cleanedMetaUrls = (metaImageUrls || []).map(rewriteS3Url).filter(u => typeof u === 'string' && u.trim());
  const fallbackUrl = rewriteS3Url(row.image_url);
  const imageUrls = cleanedMetaUrls.length > 0
    ? cleanedMetaUrls
    : (typeof fallbackUrl === 'string' && fallbackUrl.trim() ? [fallbackUrl] : []);
  return {
    ...otherMeta,
    id: row.id,
    type: row.type,
    storagePaths: meta.storagePaths || [],
    name: meta.name || '',
    prompt: meta.prompt || '',
    modelType: meta.modelType || row.type,
    fullbodyUrl: rewriteS3Url(meta.fullbodyUrl),
    compCardUrl: rewriteS3Url(meta.compCardUrl),
    sourcePhotoUrls: (meta.sourcePhotoUrls || []).map(rewriteS3Url),
    createdAt: row.created_at?.toISOString(),
    imageUrls,
  };
}

function rowToLocation(row) {
  const meta = row.metadata || {};
  const { imageUrls: metaImageUrls, ...otherMeta } = meta;
  const imageUrls = (metaImageUrls && metaImageUrls.length > 0) ? metaImageUrls.map(rewriteS3Url) : [rewriteS3Url(row.image_url)];
  return {
    ...otherMeta,
    id: row.id,
    title: row.name,
    storagePaths: meta.storagePaths || [],
    thumbnail: rewriteS3Url(meta.thumbnail) || rewriteS3Url(row.image_url),
    imageBase64: meta.imageBase64,
    prompt: meta.prompt || '',
    createdAt: row.created_at?.toISOString(),
    imageUrls,
  };
}
