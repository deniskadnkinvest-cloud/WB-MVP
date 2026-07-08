// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// /api/upload вЂ” Р—Р°РіСЂСѓР·РєР°/СЃРєР°С‡РёРІР°РЅРёРµ/СѓРґР°Р»РµРЅРёРµ С„Р°Р№Р»РѕРІ (Р·Р°РјРµРЅР° Auth Storage)
// РСЃРїРѕР»СЊР·СѓРµС‚ MinIO (S3-СЃРѕРІРјРµСЃС‚РёРјРѕРµ С…СЂР°РЅРёР»РёС‰Рµ РЅР° РЅР°С€РµРј СЃРµСЂРІРµСЂРµ)
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ

import jwt from 'jsonwebtoken';
import { uploadFile, deleteFile, s3, S3_BUCKET } from './_s3.js';
import { GetObjectCommand } from '@aws-sdk/client-s3';

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const decoded = verifyToken(req);
  if (!decoded) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const uid = decoded.uid;

  try {
    // в•ђв•ђв•ђ POST вЂ” Р—Р°РіСЂСѓР·РёС‚СЊ С„Р°Р№Р» в•ђв•ђв•ђ
    if (req.method === 'POST') {
      const { base64, folder = 'models', filename: customFilename } = req.body || {};

      if (!base64) {
        return res.status(400).json({ ok: false, error: 'base64 data is required' });
      }

      // Р”РµРєРѕРґРёСЂСѓРµРј base64
      let buffer;
      let contentType = 'image/jpeg';

      if (base64.startsWith('data:')) {
        // data:image/jpeg;base64,/9j/4AAQ...
        const [header, data] = base64.split(',');
        const match = header.match(/data:(.*?);/);
        if (match) contentType = match[1];
        buffer = Buffer.from(data, 'base64');
      } else {
        buffer = Buffer.from(base64, 'base64');
      }

      const filename = customFilename || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
      const key = `users/${uid}/${folder}/${filename}`;

      const url = await uploadFile(key, buffer, contentType);

      return res.json({
        ok: true,
        url,
        path: key,
      });
    }

    // в•ђв•ђв•ђ GET вЂ” РЎРєР°С‡Р°С‚СЊ С„Р°Р№Р» РєР°Рє base64 в•ђв•ђв•ђ
    if (req.method === 'GET') {
      const { path: filePath, url: remoteUrl } = req.query;

      if (remoteUrl) {
        let parsedUrl;
        try {
          parsedUrl = new URL(remoteUrl);
        } catch {
          return res.status(400).json({ ok: false, error: 'invalid url' });
        }

        const blockedHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);
        if (!['https:', 'http:'].includes(parsedUrl.protocol) || blockedHosts.has(parsedUrl.hostname)) {
          return res.status(400).json({ ok: false, error: 'url is not allowed' });
        }

        const upstream = await fetch(parsedUrl.toString(), { redirect: 'follow' });
        if (!upstream.ok) {
          return res.status(502).json({ ok: false, error: `remote download failed: ${upstream.status}` });
        }

        const contentType = upstream.headers.get('content-type') || 'image/jpeg';
        const buffer = Buffer.from(await upstream.arrayBuffer());
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'private, max-age=300');
        return res.status(200).send(buffer);
      }

      if (!filePath) {
        return res.status(400).json({ ok: false, error: 'path is required' });
      }

      // Ownership guard: a user may only read files under their own prefix (prevents IDOR).
      if (!String(filePath).startsWith(`users/${uid}/`)) {
        return res.status(403).json({ ok: false, error: 'Forbidden' });
      }

      try {
        const command = new GetObjectCommand({
          Bucket: S3_BUCKET,
          Key: filePath,
        });
        const response = await s3.send(command);
        const chunks = [];
        for await (const chunk of response.Body) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        const contentType = response.ContentType || 'image/jpeg';
        const base64 = `data:${contentType};base64,${buffer.toString('base64')}`;

        return res.json({ ok: true, base64 });
      } catch (err) {
        if (err.name === 'NoSuchKey') {
          return res.status(404).json({ ok: false, error: 'File not found' });
        }
        throw err;
      }
    }

    // в•ђв•ђв•ђ DELETE вЂ” РЈРґР°Р»РёС‚СЊ С„Р°Р№Р» в•ђв•ђв•ђ
    if (req.method === 'DELETE') {
      const { path: filePath } = req.query;

      if (!filePath) {
        return res.status(400).json({ ok: false, error: 'path is required' });
      }

      // Ownership guard: a user may only delete files under their own prefix (prevents IDOR).
      if (!String(filePath).startsWith(`users/${uid}/`)) {
        return res.status(403).json({ ok: false, error: 'Forbidden' });
      }

      await deleteFile(filePath);
      return res.json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('[upload] Error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
