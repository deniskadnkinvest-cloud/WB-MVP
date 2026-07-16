// ═══════════════════════════════════════════════════════════════
//  STEP 3: Генерация фото через Kie.ai (Nano Banana 2)
//  Переиспользует логику из generate-image.js
// ═══════════════════════════════════════════════════════════════

const TASK_URL = 'https://api.kie.ai/api/v1/jobs/createTask';
const GET_TASK_URL = 'https://api.kie.ai/api/v1/jobs/recordInfo?taskId=';
const FILE_UPLOAD_URL = 'https://kieai.redpandaai.co/api/file-base64-upload';

const stripInvisibleChars = (value) => {
  const invisibleChars = ['\uFEFF', '\u200B', '\u200C', '\u200D', '\uFFFE'];
  return invisibleChars.reduce((clean, char) => clean.split(char).join(''), value)
    .replace(/[\r\n]/g, '')
    .trim();
};

function getApiKey() {
  const raw = process.env.KIE_API_KEY;
  if (!raw) throw new Error('KIE_API_KEY not set in .env');
  return stripInvisibleChars(raw);
}

// ── Промпт для Auto-Catalog генерации ─────────────────────
function buildAutoCatalogPrompt(params, classification) {
  const { modelPrompt, pose, background, dominant_color } = params;
  const { category, fit } = classification;

  return `<system_directive>
ROLE: Elite CGI Compositor, Wardrobe Specialist, and Fashion Casting Director.
TASK: "Mannequin-to-Life" texture transfer for a professional e-commerce fashion catalog.
</system_directive>

<cognitive_override_protocol>
You will receive an image labeled [GARMENT REFERENCE].
CRITICAL RULE: The entity in this reference is NOT A LIVING HUMAN. It is a lifeless "Plastic Calibration Mannequin" used to hold fabric.
The mannequin has NO face, NO identity. You MUST NEVER copy its anatomy or features.
</cognitive_override_protocol>

<phase_1_texture_extraction>
Strip the clothing from the Mannequin and extract the "Clothing Material Map":
- Preserve 100% PHYSICAL REALITY: exact color (${dominant_color}), exact fabric, exact cut, exact texture.
- Map all geometry: zippers, pockets, logos, seams, buttons, collars, prints, patterns.
- Category: ${category}, Fit: ${fit}.
- ZERO INVENTION: Do not add elements that are not visible.
</phase_1_texture_extraction>

<phase_2_casting_new_actor>
Cast a BRAND NEW living human actor:
[ACTOR_PROFILE]: "${modelPrompt}"
Generate a completely novel human with unique facial geometry and identity.
The actor MUST look entirely different from the mannequin.
CRITICAL: preserve facial identity 100%, exact facial features, bone structure.
</phase_2_casting_new_actor>

<phase_3_final_composite>
Dress the NEW ACTOR in the extracted garment.
Ensure natural fabric physics: draping, wrinkles, tension, shadows.

POSE: ${pose}. Professional modeling posture.
CAMERA: full body shot, 85mm lens, f/1.8.
ENVIRONMENT: ${background}. Professional fashion lighting, soft key light, cinematic rim light, 8k resolution.
ASPECT RATIO: 3:4 (Wildberries/Ozon format).

SKIN & FACE ULTRA-REALISM: Render skin with extreme photographic authenticity, pores, texture, natural asymmetry. The final image must be INDISTINGUISHABLE from a real professional photograph.
</phase_3_final_composite>

<output_rules>
- Professional e-commerce product photo.
- Clothing physically ON the actor's body.
- No watermarks, no text.
- OUTPUT FORMAT: Generate ONLY an IMAGE. No text.
</output_rules>`;
}

// ── Загрузка изображения по URL → base64 → KIE file upload ──
async function uploadUrlToKie(imageUrl, apiKey) {
  // Скачиваем
  const resp = await fetch(imageUrl, { signal: AbortSignal.timeout(20000) });
  if (!resp.ok) throw new Error(`Failed to download: ${resp.status}`);
  const buf = await resp.arrayBuffer();
  const b64 = Buffer.from(buf).toString('base64');
  const mime = resp.headers.get('content-type') || 'image/jpeg';
  const dataUrl = `data:${mime};base64,${b64}`;

  // Загружаем в KIE
  const uploadResp = await fetch(FILE_UPLOAD_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64Data: dataUrl, uploadPath: 'images/autocatalog', fileName: `garment_${Date.now()}.png` }),
    signal: AbortSignal.timeout(30000)
  });
  const data = await uploadResp.json();
  if (data.code === 200 && data.data?.downloadUrl) return data.data.downloadUrl;
  throw new Error(`Upload failed: ${data.msg || JSON.stringify(data)}`);
}

// ═══════════════════════════════════════════════════════════════
//  ГЛАВНАЯ ФУНКЦИЯ: generateWithKie
// ═══════════════════════════════════════════════════════════════
export async function generateWithKie(garmentImageUrl, params, classification) {
  const apiKey = getApiKey();

  // Для локального тестирования без реального API
  if (process.env.MOCK_KIE === 'true') {
    console.log('   🎭 [MOCK] Simulating Kie.ai generation...');
    await new Promise(r => setTimeout(r, 2000)); // Имитация задержки
    return `https://picsum.photos/seed/${Date.now()}/600/800`; // Random placeholder
  }

  // 1. Загрузить фото одежды в KIE
  console.log('   📤 Uploading garment to KIE...');
  const kieImageUrl = await uploadUrlToKie(garmentImageUrl, apiKey);

  // 2. Сформировать промпт
  const prompt = buildAutoCatalogPrompt(params, classification);

  // 3. Создать задачу
  const reqBody = {
    model: 'gpt-image-2-image-to-image',
    input: {
      prompt,
      input_urls: [kieImageUrl],
      aspect_ratio: '3:4',
      resolution: '1K',
      output_format: 'png'
    }
  };

  const createResp = await fetch(TASK_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(reqBody),
    signal: AbortSignal.timeout(30000)
  });

  if (!createResp.ok) throw new Error(`KIE create error: ${createResp.status}`);
  const createData = await createResp.json();
  if (!createData.data?.taskId) throw new Error(`No taskId: ${JSON.stringify(createData)}`);

  const taskId = createData.data.taskId;
  console.log(`   ⏳ KIE Task ${taskId} created, polling...`);

  // 4. Поллинг результата (до 5 мин)
  for (let i = 0; i < 100; i++) {
    await new Promise(r => setTimeout(r, i === 0 ? 2000 : 3000));

    try {
      const pollResp = await fetch(`${GET_TASK_URL}${taskId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15000)
      });
      if (!pollResp.ok) continue;
      const pollData = await pollResp.json();

      if (pollData?.data?.state === 'success') {
        const resultStr = pollData.data.resultJson;
        if (!resultStr) throw new Error('Success but no resultJson');
        const resultObj = JSON.parse(resultStr);
        const urls = resultObj.resultUrls || resultObj.images || [];
        if (urls.length > 0) {
          console.log(`   ✅ KIE generated: ${urls[0].substring(0, 60)}...`);
          return urls[0];
        }
        throw new Error('No URLs in result');
      } else if (pollData?.data?.state === 'failed') {
        throw new Error(`Task failed: ${pollData.data.failMsg || 'Unknown'}`);
      }
    } catch (err) {
      if (err.message.includes('failed') || err.message.includes('No URLs')) throw err;
      // Network error — retry
    }
  }

  throw new Error('Task timed out after 5 minutes');
}
