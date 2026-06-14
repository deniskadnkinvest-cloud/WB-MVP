// ═══════════════════════════════════════════════════════════════
//  Reve API Integration
//  POST /api/reve-edit
//  Actions:
//    - action: 'generate'   → POST /v1/image/create (text-to-image)
//    - action: 'edit'       → POST /v1/image/edit   (inpainting with mask)
//    - action: 'remix'      → POST /v1/image/remix  (style blend)
// ═══════════════════════════════════════════════════════════════

const REVE_BASE = 'https://api.reve.com/v1/image';

async function callReve(endpoint, payload, apiKey) {
  console.log(`[Reve] Calling ${endpoint} | prompt length: ${(payload.prompt || '').length} chars | has image: ${!!payload.image || !!(payload.images?.length)}`);
  
  const res = await fetch(`${REVE_BASE}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload)
  });

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
      
      // Reve возвращает image в base64 (поле: image_b64 или data)
      const imageData = data?.image_b64 || data?.image || data?.data;
      
      return res.status(200).json({
        success: true,
        imageBase64: imageData ? `data:image/png;base64,${imageData}` : null,
        metadata: {
          model: data?.model,
          credits_used: data?.credits_used,
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

      const payload = {
        prompt,
        image: baseImageB64,
        // Если есть маска — это целевой inpainting, иначе глобальное редактирование
        ...(maskBase64 ? { mask_image: stripDataUrlPrefix(maskBase64) } : {}),
        test_time_scaling: 3,
      };

      const data = await callReve('edit', payload, apiKey);
      const imageData = data?.image_b64 || data?.image || data?.data;

      return res.status(200).json({
        success: true,
        imageBase64: imageData ? `data:image/png;base64,${imageData}` : null,
        metadata: {
          model: data?.model,
          credits_used: data?.credits_used,
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

      const payload = {
        prompt,
        images: [baseImageB64],
        strength: strength || 0.7,
        test_time_scaling: 2,
      };

      const data = await callReve('remix', payload, apiKey);
      const imageData = data?.image_b64 || data?.image || data?.data;

      return res.status(200).json({
        success: true,
        imageBase64: imageData ? `data:image/png;base64,${imageData}` : null,
        metadata: {
          model: data?.model,
          credits_used: data?.credits_used,
        }
      });
    }

    return res.status(400).json({ success: false, error: `Unknown action: ${action}. Use: generate, edit, remix` });

  } catch (err) {
    console.error('[Reve API Error]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
