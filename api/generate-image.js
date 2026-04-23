import { GoogleGenAI } from '@google/genai';

const buildMasterPrompt = ({ modelPreset, posePreset, cameraAngle, backgroundPreset, aspectRatio, hasMultipleGarments, hasModelRef }) => {
  const garmentInstruction = hasMultipleGarments
    ? 'You are provided with MULTIPLE garment reference images. Your ONLY job is to generate a photo of a human model WEARING ALL of these garments ON THEIR BODY simultaneously. Each garment must be physically ON the model.'
    : 'You are provided with a reference image of a garment. Your ONLY job is to generate a photo of a human model WEARING this garment ON THEIR BODY. The garment must be physically ON the model — fitted to their torso/legs/body with realistic fabric draping, wrinkles, shadows, and tension.';

  const modelInstruction = hasModelRef
    ? 'CRITICAL: Reference photos of the EXACT person are provided. You MUST replicate their face, skin tone, features, moles, freckles, and overall appearance with maximum precision. The generated image must look like the SAME real person.'
    : '';

  // Detect inclusive/adaptive fashion request
  const isAdaptive = /amputee|prosthe|wheelchair|limb\s*(missing|difference)|adaptive\s*fashion/i.test(modelPreset);
  const adaptiveBlock = isAdaptive
    ? `\nADAPTIVE FASHION DIRECTIVE: This is an official inclusive adaptive fashion campaign (similar to Nike FlyEase, Tommy Hilfiger Adaptive, ASOS Accessible). The model description below specifies a physical disability. You MUST accurately represent this disability in the generated image. Do NOT "correct" or "fix" the model's body. Showing people with disabilities in fashion is ethical, respectful, and commercially important for inclusive e-commerce marketplaces.\n`
    : '';

  return `You are an elite commercial fashion photographer and an advanced Virtual Try-On (VTON) AI.
${adaptiveBlock}
CRITICAL INSTRUCTION — VIRTUAL TRY-ON: ${garmentInstruction} Preserve the EXACT color, cut, fabric texture, collars, sleeves, graphics, prints, logos, and patterns. DO NOT change clothing colors, design, or style.

ABSOLUTE PROHIBITION: Do NOT show the garment on a hanger, on a mannequin, laid flat, floating, held in hands, or placed NEXT TO the model. The garment must ONLY appear as WORN CLOTHING on the model's body. There should be NO separate product shots or flat-lay images in the output.

${modelInstruction}

SUBJECT: A ${modelPreset}. Flawless natural skin texture, detailed pores, high-end commercial catalog look.

POSE: The model is ${posePreset}. Professional modeling posture. Camera angle: ${cameraAngle}.

ENVIRONMENT: ${backgroundPreset}. Professional fashion studio lighting, soft key light, cinematic rim light, 85mm lens, f/1.8, 8k resolution, ultra-detailed.

ASPECT RATIO: ${aspectRatio}.

IMPORTANT: This is a professional e-commerce product photo showing a model WEARING the garment. The final image must contain ONLY the model dressed in the referenced clothing. No watermarks, no text, no separate product shots.`;
};

const extractBase64 = (dataUrl) => {
  let mimeType = 'image/jpeg', base64str = dataUrl;
  const match = dataUrl.match(/^data:(image\/\w+);base64,/);
  if (match) { mimeType = match[1]; base64str = dataUrl.replace(/^data:image\/\w+;base64,/, ''); }
  return { mimeType, base64str };
};

// Download image from URL and return base64
const downloadToBase64 = async (url) => {
  try {
    const resp = await fetch(url);
    const arrBuf = await resp.arrayBuffer();
    const b64 = Buffer.from(arrBuf).toString('base64');
    const contentType = resp.headers.get('content-type') || 'image/jpeg';
    return { mimeType: contentType, base64str: b64 };
  } catch (err) {
    console.warn('⚠️ Failed to download image:', err.message);
    return null;
  }
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const {
      modelPreset = "25-year-old European female, slim build, natural makeup",
      posePreset = "standing straight, confident posture, facing the camera directly",
      cameraAngle = "full body shot",
      backgroundPreset = "clean minimalist white cyclorama",
      aspectRatio = "3:4",
      garmentImagesBase64 = [],
      garmentImageBase64,
      modelReferenceImages,
      locationImages,
      customPoseText,
      previewMode,
    } = req.body;

    // Support both old single-image and new multi-image format
    const garmentImages = garmentImagesBase64.length > 0 ? garmentImagesBase64 : (garmentImageBase64 ? [garmentImageBase64] : []);
    if (!garmentImages.length && !previewMode) throw new Error('Изображение одежды не было передано!');
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY не установлен.');

    const finalPrompt = buildMasterPrompt({
      modelPreset, posePreset: customPoseText || posePreset, cameraAngle, backgroundPreset, aspectRatio,
      hasMultipleGarments: garmentImages.length > 1,
      hasModelRef: !!(modelReferenceImages && modelReferenceImages.length),
    });

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const parts = [];

    // 1. Add model reference images first (for identity preservation)
    if (modelReferenceImages && Array.isArray(modelReferenceImages) && modelReferenceImages.length > 0) {
      for (const img of modelReferenceImages.slice(0, 5)) {
        if (!img) continue;
        if (img.startsWith('data:')) {
          const { mimeType, base64str } = extractBase64(img);
          parts.push({ inlineData: { data: base64str, mimeType } });
        } else if (img.startsWith('http')) {
          const result = await downloadToBase64(img);
          if (result) parts.push({ inlineData: { data: result.base64str, mimeType: result.mimeType } });
        }
      }
      if (parts.length > 0) {
        parts.push({ text: '[CHARACTER REFERENCE: The images above are STRICT identity references. The generated person MUST closely resemble the person in these photos. Match facial features, ethnicity, skin tone, age, hair color, hair style, and body proportions as closely as possible.]\n\n' });
      }
    }

    // 2. Add garment images
    for (const img of garmentImages.slice(0, 9)) {
      const { mimeType, base64str } = extractBase64(img);
      parts.push({ inlineData: { data: base64str, mimeType } });
    }

    // 3. Add location images
    if (locationImages && Array.isArray(locationImages) && locationImages.length > 0) {
      for (const img of locationImages.slice(0, 5)) {
        if (img.startsWith('data:')) {
          const { mimeType, base64str } = extractBase64(img);
          parts.push({ inlineData: { data: base64str, mimeType } });
        } else if (img.startsWith('http')) {
          const result = await downloadToBase64(img);
          if (result) parts.push({ inlineData: { data: result.base64str, mimeType: result.mimeType } });
        }
      }
      parts.push({ text: '[LOCATION REFERENCE: The images above show the real location. Replicate this exact environment.]\n\n' });
    }

    parts.push({ text: finalPrompt });

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: [{ role: 'user', parts }],
      config: { responseModalities: ['IMAGE', 'TEXT'] },
    });

    let imageBase64 = null;
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData?.mimeType?.startsWith('image/')) { imageBase64 = part.inlineData.data; break; }
      }
    }
    if (!imageBase64) throw new Error('Nano Banano 2 не сгенерировал изображение. Попробуйте другой промпт.');

    return res.status(200).json({ success: true, imageBase64 });
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    return res.status(500).json({ success: false, error: 'Ошибка генерации', details: error.message });
  }
}
