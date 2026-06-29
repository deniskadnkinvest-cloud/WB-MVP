// ═══════════════════════════════════════════════════════════════
// API endpoint: /api/user-data
// CRUD operations for user models, locations, and generations
// Replaces direct Firestore calls from frontend
// ═══════════════════════════════════════════════════════════════

import jwt from 'jsonwebtoken';
import { query } from './_db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'vton-secret-2026';

function verifyToken(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
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
    // ═══ GET — Fetch data ═══
    if (req.method === 'GET') {
      const { type, limit: limitStr } = req.query;
      const maxResults = parseInt(limitStr) || 50;

      if (type === 'generations') {
        const result = await query(
          `SELECT * FROM history WHERE user_id = (SELECT id FROM users WHERE telegram_id = $1)
           ORDER BY created_at DESC LIMIT $2`,
          [uid, maxResults]
        );
        return res.json({ ok: true, data: result.rows.map(rowToGeneration) });
      }

      if (type === 'models') {
        const result = await query(
          `SELECT * FROM models WHERE user_id = (SELECT id FROM users WHERE telegram_id = $1)
           ORDER BY created_at DESC`,
          [uid]
        );
        return res.json({ ok: true, data: result.rows.map(rowToModel) });
      }

      if (type === 'locations') {
        const result = await query(
          `SELECT * FROM locations WHERE user_id = (SELECT id FROM users WHERE telegram_id = $1)
           ORDER BY created_at DESC`,
          [uid]
        );
        return res.json({ ok: true, data: result.rows.map(rowToLocation) });
      }

      return res.status(400).json({ ok: false, error: 'Unknown type' });
    }

    // ═══ POST — Create data ═══
    if (req.method === 'POST') {
      const { type, ...data } = req.body || {};

      if (type === 'model') {
        const result = await query(
          `INSERT INTO models (user_id, type, image_url, metadata)
           VALUES ((SELECT id FROM users WHERE telegram_id = $1), $2, $3, $4)
           RETURNING *`,
          [uid, data.type || 'unknown', data.imageUrls?.[0] || data.image_url || '', JSON.stringify(data)]
        );
        return res.json({ ok: true, data: rowToModel(result.rows[0]) });
      }

      if (type === 'location') {
        const result = await query(
          `INSERT INTO locations (user_id, name, image_url, metadata)
           VALUES ((SELECT id FROM users WHERE telegram_id = $1), $2, $3, $4)
           RETURNING *`,
          [uid, data.title || 'Без названия', data.imageUrls?.[0] || data.thumbnail || '', JSON.stringify(data)]
        );
        return res.json({ ok: true, data: rowToLocation(result.rows[0]) });
      }

      return res.status(400).json({ ok: false, error: 'Unknown type' });
    }

    // ═══ PATCH — Update data ═══
    if (req.method === 'PATCH') {
      const { type, id, ...fields } = req.body || {};

      if (type === 'model' && id) {
        // Обновляем metadata с мержем существующих полей
        const existing = await query(`SELECT metadata FROM models WHERE id = $1`, [id]);
        const oldMeta = existing.rows[0]?.metadata || {};
        const newMeta = { ...oldMeta, ...fields };
        await query(
          `UPDATE models SET metadata = $1 WHERE id = $2 AND user_id = (SELECT id FROM users WHERE telegram_id = $3)`,
          [JSON.stringify(newMeta), id, uid]
        );
        return res.json({ ok: true });
      }

      if (type === 'location' && id) {
        const existing = await query(`SELECT metadata FROM locations WHERE id = $1`, [id]);
        const oldMeta = existing.rows[0]?.metadata || {};
        const newMeta = { ...oldMeta, ...fields };
        const nameUpdate = fields.title || fields.name;
        if (nameUpdate) {
          await query(
            `UPDATE locations SET name = $1, metadata = $2 WHERE id = $3 AND user_id = (SELECT id FROM users WHERE telegram_id = $4)`,
            [nameUpdate, JSON.stringify(newMeta), id, uid]
          );
        } else {
          await query(
            `UPDATE locations SET metadata = $1 WHERE id = $2 AND user_id = (SELECT id FROM users WHERE telegram_id = $3)`,
            [JSON.stringify(newMeta), id, uid]
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
        await query(
          `DELETE FROM models WHERE id = $1 AND user_id = (SELECT id FROM users WHERE telegram_id = $2)`,
          [id, uid]
        );
        return res.json({ ok: true });
      }

      if (type === 'location' && id) {
        await query(
          `DELETE FROM locations WHERE id = $1 AND user_id = (SELECT id FROM users WHERE telegram_id = $2)`,
          [id, uid]
        );
        return res.json({ ok: true });
      }

      return res.status(400).json({ ok: false, error: 'Unknown type or missing id' });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('[user-data] Error:', err);
    return res.status(500).json({ ok: false, error: err.message });
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

function rowToGeneration(row) {
  const meta = row.metadata || {};
  return {
    id: row.id,
    userId: row.user_id,
    success: row.status === 'completed',
    createdAt: row.created_at?.toISOString(),
    imageUrl: rewriteS3Url(row.result_image_url),
    ...meta,
  };
}

function rowToModel(row) {
  const meta = row.metadata || {};
  const { imageUrls: metaImageUrls, ...otherMeta } = meta;
  const imageUrls = (metaImageUrls && metaImageUrls.length > 0) ? metaImageUrls.map(rewriteS3Url) : [rewriteS3Url(row.image_url)];
  return {
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
    ...otherMeta,
    imageUrls,
  };
}

function rowToLocation(row) {
  const meta = row.metadata || {};
  const { imageUrls: metaImageUrls, ...otherMeta } = meta;
  const imageUrls = (metaImageUrls && metaImageUrls.length > 0) ? metaImageUrls.map(rewriteS3Url) : [rewriteS3Url(row.image_url)];
  return {
    id: row.id,
    title: row.name,
    storagePaths: meta.storagePaths || [],
    thumbnail: rewriteS3Url(meta.thumbnail) || rewriteS3Url(row.image_url),
    imageBase64: meta.imageBase64,
    prompt: meta.prompt || '',
    createdAt: row.created_at?.toISOString(),
    ...otherMeta,
    imageUrls,
  };
}
