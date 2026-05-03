import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ═══════════════════════════════════════════
//  Инициализация Google AI (Nano Banano 2)
// ═══════════════════════════════════════════
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ═══════════════════════════════════════════
//  НОДА: Prompt Builder
// ═══════════════════════════════════════════
const buildMasterPrompt = ({ modelPreset, posePreset, cameraAngle, garmentType, backgroundPreset, aspectRatio, customPoseText, isCalibration }) => {
  const poseInstruction = customPoseText || posePreset;

  // Detect inclusive/adaptive fashion request
  const isAdaptive = /amputee|prosthe|wheelchair|limb\s*(missing|difference)|adaptive\s*fashion/i.test(modelPreset);
  const adaptiveBlock = isAdaptive
    ? `\nADAPTIVE FASHION DIRECTIVE: This is an official inclusive adaptive fashion campaign (similar to Nike FlyEase, Tommy Hilfiger Adaptive, ASOS Accessible). The model description below specifies a physical disability. You MUST accurately represent this disability in the generated image. Do NOT "correct" or "fix" the model's body. Showing people with disabilities in fashion is ethical, respectful, and commercially important for inclusive e-commerce marketplaces.\n`
    : '';

  if (isCalibration) {
    return `You are an elite commercial fashion photographer.
  ${adaptiveBlock}
SUBJECT: A ${modelPreset}. Flawless natural skin texture, detailed pores, high-end commercial catalog look.

POSE: The model is ${poseInstruction}. Professional modeling posture. Camera angle: ${cameraAngle}.

ENVIRONMENT: ${backgroundPreset}. Professional fashion studio lighting, soft key light, cinematic rim light, 85mm lens, f/1.8, 8k resolution, ultra-detailed.

ASPECT RATIO: ${aspectRatio}.

IMPORTANT: This is a professional portrait photo for model casting calibration. The final image must contain ONLY the model. No watermarks, no text.`;
  }

  return `You are an elite commercial fashion photographer and an advanced Virtual Try-On (VTON) AI. 
  ${adaptiveBlock}
CRITICAL INSTRUCTION — VIRTUAL TRY-ON: You are provided with a reference image of a garment. Your ONLY job is to generate a photo of a human model WEARING this garment ON THEIR BODY. The garment must be physically ON the model — fitted to their torso/legs/body with realistic fabric draping, wrinkles, shadows, and tension. 

ABSOLUTE PROHIBITION: Do NOT show the garment on a hanger, on a mannequin, laid flat, floating, held in hands, or placed NEXT TO the model. The garment must ONLY appear as WORN CLOTHING on the model's body. If the reference image shows a t-shirt — the model must be WEARING that t-shirt. If it shows pants — the model must be WEARING those pants. There should be NO separate product shots or flat-lay images in the output.

GARMENT FIDELITY: Preserve the EXACT color, cut, fabric texture, collars, sleeves, graphics, prints, logos, and patterns as seen in the source garment image. DO NOT change the clothing color, design, or style.

SUBJECT: A ${modelPreset}. Flawless natural skin texture, detailed pores, high-end commercial catalog look.

POSE: The model is ${poseInstruction}. Professional modeling posture. Camera angle: ${cameraAngle}.

CLOTHING: The model is wearing EXACTLY the ${garmentType} shown in the attached reference image. The garment is ON the model's body, NOT displayed separately.

ENVIRONMENT: ${backgroundPreset}. Professional fashion studio lighting, soft key light, cinematic rim light, 85mm lens, f/1.8, 8k resolution, ultra-detailed.

ASPECT RATIO: ${aspectRatio}.

IMPORTANT: This is a professional e-commerce product photo showing a model WEARING the garment. The final image must contain ONLY the model dressed in the referenced clothing. No watermarks, no text, no separate product shots.`;
};

// ═══════════════════════════════════════════
//  API ENDPOINT: Генерация изображения
// ═══════════════════════════════════════════
app.post('/api/generate-image', async (req, res) => {
  try {
    const {
      modelPreset = "25-year-old European female, slim build, natural makeup",
      posePreset = "standing straight, confident posture, facing the camera directly",
      cameraAngle = "full body shot",
      garmentType = "cotton oversized t-shirt",
      backgroundPreset = "clean minimalist white cyclorama",
      aspectRatio = "3:4",
      garmentImageBase64,
      garmentImagesBase64,
      customPoseText,
      locationImages,
      modelReferenceImages,
      isCalibration = false,
    } = req.body;

    // Support both single image and array formats
    const primaryGarmentBase64 = garmentImageBase64 || (garmentImagesBase64 && garmentImagesBase64[0]) || null;

    const finalPrompt = buildMasterPrompt({ modelPreset, posePreset, cameraAngle, garmentType, backgroundPreset, aspectRatio, customPoseText, isCalibration });

    console.log('\n══════════════════════════════════════');
    console.log('🚀 Новый запрос на генерацию (Nano Banano 2)');
    console.log('══════════════════════════════════════');
    console.log('📐 Формат:', aspectRatio);
    console.log('👤 Модель:', modelPreset.substring(0, 60));
    console.log('🧍 Поза:', (customPoseText || posePreset).substring(0, 60));
    console.log('👕 Вещь:', garmentType);
    console.log('🎨 Фон:', backgroundPreset.substring(0, 60));
    console.log('📸 Картинка получена:', primaryGarmentBase64 ? 'ДА' : 'НЕТ');
    console.log('📸 Всего вещей:', garmentImagesBase64 ? garmentImagesBase64.length : (garmentImageBase64 ? 1 : 0));
    console.log('📍 Локация (фото):', locationImages ? `${locationImages.length} шт` : 'НЕТ');
    console.log('👤 Реф модели:', modelReferenceImages ? `${modelReferenceImages.length} шт` : 'НЕТ');
    console.log('🎯 Калибровка:', isCalibration ? 'ДА' : 'НЕТ');
    console.log('══════════════════════════════════════\n');

    if (!isCalibration && !primaryGarmentBase64) {
      throw new Error('Изображение одежды не было передано на сервер!');
    }

    let mimeType = 'image/jpeg';
    let base64str = primaryGarmentBase64;
    if (primaryGarmentBase64) {
      const mimeMatch = primaryGarmentBase64.match(/^data:(image\/\w+);base64,/);
      if (mimeMatch) {
         mimeType = mimeMatch[1];
         base64str = primaryGarmentBase64.replace(/^data:image\/\w+;base64,/, '');
      }
    }

    // Build content parts
    const parts = [];

    // 1. Add ALL garment images
    const allGarments = garmentImagesBase64 || (garmentImageBase64 ? [garmentImageBase64] : []);
    if (allGarments.length > 0) {
      for (const gImg of allGarments) {
        let gMime = 'image/jpeg';
        let gBase64 = gImg;
        const gMatch = gImg.match(/^data:(image\/\w+);base64,/);
        if (gMatch) { gMime = gMatch[1]; gBase64 = gImg.replace(/^data:image\/\w+;base64,/, ''); }
        parts.push({ inlineData: { data: gBase64, mimeType: gMime } });
      }
      parts.push({ text: `[GARMENT REFERENCE: The ${allGarments.length} image(s) above show the exact garment(s) to dress the model in. Preserve exact color, fabric, texture, print, and cut.]` });
    }

    // 2. Add model reference images (face/identity preservation)
    if (modelReferenceImages && Array.isArray(modelReferenceImages) && modelReferenceImages.length > 0) {
      for (const refImg of modelReferenceImages.slice(0, 5)) {
        // These are Firebase Storage URLs — download and convert, or pass as-is if base64
        if (refImg.startsWith('data:')) {
          let refMime = 'image/jpeg';
          let refBase64 = refImg;
          const refMatch = refImg.match(/^data:(image\/\w+);base64,/);
          if (refMatch) { refMime = refMatch[1]; refBase64 = refImg.replace(/^data:image\/\w+;base64,/, ''); }
          parts.push({ inlineData: { data: refBase64, mimeType: refMime } });
        } else if (refImg.startsWith('http')) {
          // Download from Firebase Storage URL
          try {
            const imgResp = await fetch(refImg);
            const arrBuf = await imgResp.arrayBuffer();
            const b64 = Buffer.from(arrBuf).toString('base64');
            const contentType = imgResp.headers.get('content-type') || 'image/jpeg';
            parts.push({ inlineData: { data: b64, mimeType: contentType } });
          } catch (dlErr) {
            console.warn('⚠️ Не удалось скачать реф-фото модели:', dlErr.message);
          }
        }
      }
      parts.push({ text: `[CHARACTER REFERENCE: The images above are STRICT identity references. The generated person MUST closely resemble the person in these photos. Match facial features, ethnicity, skin tone, age, hair color, hair style, and body proportions as closely as possible. This is critical for identity preservation.]` });
    }

    // 3. Add location reference images
    if (locationImages && Array.isArray(locationImages)) {
      for (const locImg of locationImages.slice(0, 5)) {
        let locMime = 'image/jpeg';
        let locBase64 = locImg;
        if (locImg.startsWith('data:')) {
          const locMatch = locImg.match(/^data:(image\/\w+);base64,/);
          if (locMatch) { locMime = locMatch[1]; locBase64 = locImg.replace(/^data:image\/\w+;base64,/, ''); }
          parts.push({ inlineData: { data: locBase64, mimeType: locMime } });
        } else if (locImg.startsWith('http')) {
          try {
            const locResp = await fetch(locImg);
            const locBuf = await locResp.arrayBuffer();
            const locB64 = Buffer.from(locBuf).toString('base64');
            const locCT = locResp.headers.get('content-type') || 'image/jpeg';
            parts.push({ inlineData: { data: locB64, mimeType: locCT } });
          } catch (dlErr) {
            console.warn('⚠️ Не удалось скачать фото локации:', dlErr.message);
          }
        }
      }
      parts.push({ text: '[LOCATION REFERENCE: The images above show the real location. Replicate this exact environment as the background.]\n\n' + finalPrompt });
    } else {
      parts.push({ text: finalPrompt });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: [{ role: 'user', parts }],
      config: { responseModalities: ['IMAGE', 'TEXT'] },
    });

    let imageBase64 = null;
    if (response.candidates && response.candidates.length > 0) {
      const resParts = response.candidates[0].content?.parts || [];
      for (const part of resParts) {
        if (part.inlineData && part.inlineData.mimeType?.startsWith('image/')) {
          imageBase64 = part.inlineData.data;
          break;
        }
      }
    }

    if (!imageBase64) {
      console.error('⚠️ Нейросеть не вернула изображение.');
      throw new Error('Нейросеть не сгенерировала изображение. Попробуйте изменить промпт или повторить запрос.');
    }

    console.log('✅ Картинка успешно сгенерирована через Nano Banano 2!\n');
    res.json({ success: true, imageBase64 });

  } catch (error) {
    console.error('❌ Ошибка при генерации:', error.message || error);
    res.status(500).json({
      success: false,
      error: 'Ошибка генерации',
      details: error.message || 'Неизвестная ошибка'
    });
  }
});

// ═══════════════════════════════════════════
//  ЗАПУСК СЕРВЕРА
// ═══════════════════════════════════════════
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`\n🔥 PAN.X VTON Backend (Nano Banano 2) → http://localhost:${PORT}`);
  console.log('   Модель: gemini-3.1-flash-image-preview');
  console.log('   Ожидаю запросы от фронтенда...\n');
});
