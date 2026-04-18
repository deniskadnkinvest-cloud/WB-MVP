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
const buildMasterPrompt = ({ modelPreset, posePreset, cameraAngle, garmentType, backgroundPreset, aspectRatio, customPoseText }) => {
  const poseInstruction = customPoseText || posePreset;

  return `You are an elite commercial fashion photographer and an advanced Virtual Try-On (VTON) AI. 
  
CRITICAL INSTRUCTION: You are provided with an image of a garment. You MUST precisely extract the garment from the attached image and dress the model in it. Preserve the exact color, cut, fabric texture, collars, sleeves, graphics, and prints as seen in the source image. DO NOT change the clothing color or style. The clothing should naturally fit the model's body with realistic fabric physics, shadows, and tension.

SUBJECT: A ${modelPreset}. Flawless natural skin texture, detailed pores, high-end commercial catalog look.

POSE: The model is ${poseInstruction}. Professional modeling posture. Camera angle: ${cameraAngle}.

CLOTHING: The model is wearing EXACTLY the ${garmentType} shown in the attached reference image.

ENVIRONMENT: ${backgroundPreset}. Professional fashion studio lighting, soft key light, cinematic rim light, 85mm lens, f/1.8, 8k resolution, ultra-detailed.

ASPECT RATIO: ${aspectRatio}.

IMPORTANT: This is a professional e-commerce product photo for a marketplace listing. Do not alter the attached garment. No watermarks, no text on the final image.`;
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
    } = req.body;

    // Support both single image and array formats
    const primaryGarmentBase64 = garmentImageBase64 || (garmentImagesBase64 && garmentImagesBase64[0]) || null;

    const finalPrompt = buildMasterPrompt({ modelPreset, posePreset, cameraAngle, garmentType, backgroundPreset, aspectRatio, customPoseText });

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
    console.log('══════════════════════════════════════\n');

    if (!primaryGarmentBase64) {
      throw new Error('Изображение одежды не было передано на сервер!');
    }

    let mimeType = 'image/jpeg';
    let base64str = primaryGarmentBase64;
    const mimeMatch = primaryGarmentBase64.match(/^data:(image\/\w+);base64,/);
    if (mimeMatch) {
       mimeType = mimeMatch[1];
       base64str = primaryGarmentBase64.replace(/^data:image\/\w+;base64,/, '');
    }

    // Build content parts
    const parts = [];

    // 1. Add ALL garment images
    const allGarments = garmentImagesBase64 || (garmentImageBase64 ? [garmentImageBase64] : []);
    for (const gImg of allGarments) {
      let gMime = 'image/jpeg';
      let gBase64 = gImg;
      const gMatch = gImg.match(/^data:(image\/\w+);base64,/);
      if (gMatch) { gMime = gMatch[1]; gBase64 = gImg.replace(/^data:image\/\w+;base64,/, ''); }
      parts.push({ inlineData: { data: gBase64, mimeType: gMime } });
    }
    parts.push({ text: `[GARMENT REFERENCE: The ${allGarments.length} image(s) above show the exact garment(s) to dress the model in. Preserve exact color, fabric, texture, print, and cut.]` });

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
