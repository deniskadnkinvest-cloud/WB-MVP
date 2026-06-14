// ═══════════════════════════════════════════════════════════════
//  Reve API Integration
//  POST /api/reve-edit
//  Actions:
//    - action: 'generate'   → POST /v1/image/create (text-to-image)
//    - action: 'edit'       → POST /v1/image/edit   (inpainting with mask)
//    - action: 'remix'      → POST /v1/image/remix  (style blend)
//
//  AUTH: требует Firebase ID Token в заголовке Authorization: Bearer <token>
//  (как /api/generate-image) — иначе любой клиент может жечь Reve-кредиты.
// ═══════════════════════════════════════════════════════════════

import { ensureFirebaseAdmin } from './_firebase-admin.js';
import { getAuth } from 'firebase-admin/auth';

ensureFirebaseAdmin();

// Увеличиваем лимит Vercel Serverless Function до 60 секунд
// Reve работает 20-40 сек, дефолтный лимит Vercel = 10 сек
// Без этого: клиент получает HTML-страницу вместо JSON → SyntaxError
export const maxDuration = 60;

const REVE_BASE = 'https://api.reve.com/v1/image';
const REVE_TIMEOUT_MS = 55000; // 55s - чуть меньше 60s Vercel limit

async function callReve(endpoint, payload, apiKey) {
  console.log(`[Reve] Calling ${endpoint} | prompt length: ${(payload.prompt || '').length} chars | has image: ${!!payload.image || !!(payload.images?.length)}`);
  
  // AbortController для timeout - без него Vercel убьёт функцию раньше ответа Reve
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REVE_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(`${REVE_BASE}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }

  const text = await res.text();
  console.log(`[Reve] Response status: ${res.status} | body length: ${text.length} chars`);
  
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.error('[Reve] Non-JSON response:', text.substring(0, 500));
    throw new Error(`Reve API returned non-JSON response (${res.status})`);
  }

  if (!res.ok) {
    const code = res.status;
    const msg = data?.error?.message || data?.error || data?.message || `Reve API error ${code}`;
    console.error(`[Reve] Error ${code}:`, JSON.stringify(data).substring(0, 500));
    throw new Error(`[Reve ${code}] ${msg}`);
  }

  // Log response structure (not full data) for debugging
  console.log(`[Reve] Response keys:`, Object.keys(data));
  
  return data;
}

// Универсальный извлекатель изображения из ответа Reve API
// Поддерживает форматы: { image_b64 }, { image }, { data: [{ b64_json, url }] }
function extractReveImage(data) {
  // Direct base64 fields
  if (data?.image_b64) return { base64: data.image_b64 };
  if (data?.image && typeof data.image === 'string') return { base64: data.image };
  
  // OpenAI-style response: data[].b64_json or data[].url
  if (Array.isArray(data?.data) && data.data.length > 0) {
    const item = data.data[0];
    if (item.b64_json) return { base64: item.b64_json };
    if (item.url) return { url: item.url };
  }
  
  // data as a direct string
  if (typeof data?.data === 'string') return { base64: data.data };
  
  console.error('[Reve] Could not extract image from response:', JSON.stringify(data).substring(0, 300));
  return null;
}

// Скачиваем изображение по URL и конвертируем в base64 data URL
async function imageUrlToDataUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch Reve image: ${res.status}`);
  const buffer = await res.arrayBuffer();
  const bytes = Buffer.from(buffer);
  const mimeType = res.headers.get('content-type') || 'image/png';
  return `data:${mimeType};base64,${bytes.toString('base64')}`;
}

// Скачиваем изображение и конвертируем в base64
async function urlToBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Не удалось скачать изображение: ${res.status}`);
  const buffer = await res.arrayBuffer();
  const bytes = Buffer.from(buffer);
  const mimeType = res.headers.get('content-type') || 'image/jpeg';
  return `data:${mimeType};base64,${bytes.toString('base64')}`;
}

// Извлекаем base64-строку из data URL (убираем prefix)
function stripDataUrlPrefix(dataUrl) {
  if (!dataUrl) return null;
  return dataUrl.replace(/^data:[^;]+;base64,/, '');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // ═══ AUTH: Firebase Token Verification ═══
  // Сервер криптографически проверяет ID Token из заголовка Authorization.
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.split('Bearer ')[1] : null;
  if (!bearerToken) {
    return res.status(401).json({ success: false, error: 'Unauthorized: no token provided' });
  }
  try {
    await getAuth().verifyIdToken(bearerToken);
  } catch (authErr) {
    console.warn('[Reve Auth] Invalid ID token:', authErr.message);
    return res.status(401).json({ success: false, error: 'Unauthorized: invalid token' });
  }

  const apiKey = process.env.REVE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, error: 'REVE_API_KEY not configured' });
  }

  const { action, prompt, imageUrl, imageBase64, maskBase64, strength } = req.body || {};

  try {

    // ─── ACTION: generate ────────────────────────────────────────
    if (action === 'generate') {
      if (!prompt) {
        return res.status(400).json({ success: false, error: 'prompt is required' });
      }

      const payload = {
        prompt,
        // Оптимальные параметры для marketplace карточек (соотношение 3:4 как на WB/OZON)
        aspect_ratio: '3:4',
        test_time_scaling: 3, // Больше деталей = лучше качество текста
      };

      const data = await callReve('create', payload, apiKey);
      const extracted = extractReveImage(data);
      let resultImage = null;
      if (extracted?.base64) {
        resultImage = `data:image/png;base64,${extracted.base64}`;
      } else if (extracted?.url) {
        resultImage = await imageUrlToDataUrl(extracted.url);
      }
      if (!resultImage) throw new Error('Reve API вернул пустой ответ (нет изображения)');
      
      return res.status(200).json({
        success: true,
        imageBase64: resultImage,
        metadata: {
          model: data?.model,
          credits_used: data?.meta?.usage?.credits_used || data?.credits_used,
        }
      });
    }

    // ─── ACTION: edit (Inpainting) ───────────────────────────────
    if (action === 'edit') {
      if (!prompt) {
        return res.status(400).json({ success: false, error: 'prompt is required' });
      }

      // Получаем базовое изображение
      let baseImageB64 = null;
      if (imageBase64) {
        baseImageB64 = stripDataUrlPrefix(imageBase64);
      } else if (imageUrl) {
        const fullDataUrl = await urlToBase64(imageUrl);
        baseImageB64 = stripDataUrlPrefix(fullDataUrl);
      }

      if (!baseImageB64) {
        return res.status(400).json({ success: false, error: 'imageUrl or imageBase64 is required' });
      }

      console.log(`[Reve edit] prompt length: ${prompt.length} chars, has mask: ${!!maskBase64}`);
      
      const payload = {
        prompt,
        image: baseImageB64,
        // Если есть маска — это целевой inpainting, иначе глобальное редактирование
        ...(maskBase64 ? { mask_image: stripDataUrlPrefix(maskBase64) } : {}),
        aspect_ratio: '3:4',
        test_time_scaling: 3,
      };

      const data = await callReve('edit', payload, apiKey);
      const extracted = extractReveImage(data);
      let resultImage = null;
      if (extracted?.base64) {
        resultImage = `data:image/png;base64,${extracted.base64}`;
      } else if (extracted?.url) {
        resultImage = await imageUrlToDataUrl(extracted.url);
      }
      if (!resultImage) throw new Error('Reve API вернул пустой ответ (нет изображения)');

      return res.status(200).json({
        success: true,
        imageBase64: resultImage,
        metadata: {
          model: data?.model,
          credits_used: data?.meta?.usage?.credits_used || data?.credits_used,
        }
      });
    }

    // ─── ACTION: remix (Style blend) ─────────────────────────────
    if (action === 'remix') {
      if (!prompt) {
        return res.status(400).json({ success: false, error: 'prompt is required' });
      }

      let baseImageB64 = null;
      if (imageBase64) {
        baseImageB64 = stripDataUrlPrefix(imageBase64);
      } else if (imageUrl) {
        const fullDataUrl = await urlToBase64(imageUrl);
        baseImageB64 = stripDataUrlPrefix(fullDataUrl);
      }

      console.log(`[Reve remix] prompt length: ${prompt.length} chars, has image: ${!!baseImageB64}`);

      const payload = {
        prompt,
        reference_images: [baseImageB64],
        aspect_ratio: '3:4',
        test_time_scaling: 3,
      };

      const data = await callReve('remix', payload, apiKey);
      const extracted = extractReveImage(data);
      let resultImage = null;
      if (extracted?.base64) {
        resultImage = `data:image/png;base64,${extracted.base64}`;
      } else if (extracted?.url) {
        resultImage = await imageUrlToDataUrl(extracted.url);
      }
      if (!resultImage) throw new Error('Reve API вернул пустой ответ (нет изображения)');

      return res.status(200).json({
        success: true,
        imageBase64: resultImage,
        metadata: {
          model: data?.model,
          credits_used: data?.meta?.usage?.credits_used || data?.credits_used,
        }
      });
    }

    return res.status(400).json({ success: false, error: `Unknown action: ${action}. Use: generate, edit, remix` });

  } catch (err) {
    console.error('[Reve API Error]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
