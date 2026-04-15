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
//  Склеивает системные правила + переменные
// ═══════════════════════════════════════════
const buildMasterPrompt = ({ modelPreset, posePreset, cameraAngle, garmentType, backgroundPreset, aspectRatio }) => {
  return `You are an elite commercial fashion photographer and an advanced Virtual Try-On (VTON) AI. 
  
CRITICAL INSTRUCTION: You are provided with an image of a garment. You MUST precisely extract the garment from the attached image and dress the model in it. Preserve the exact color, cut, fabric texture, collars, sleeves, graphics, and prints as seen in the source image. DO NOT change the clothing color or style. The clothing should naturally fit the model's body with realistic fabric physics, shadows, and tension.

SUBJECT: A ${modelPreset}. Flawless natural skin texture, detailed pores, high-end commercial catalog look.

POSE: The model is ${posePreset}. Professional modeling posture. Camera angle: ${cameraAngle}.

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
      garmentImageBase64
    } = req.body;

    const finalPrompt = buildMasterPrompt({ modelPreset, posePreset, cameraAngle, garmentType, backgroundPreset, aspectRatio });

    console.log('\n══════════════════════════════════════');
    console.log('🚀 Новый запрос на генерацию (Nano Banano 2)');
    console.log('══════════════════════════════════════');
    console.log('📐 Формат:', aspectRatio);
    console.log('👤 Модель:', modelPreset.substring(0, 60));
    console.log('🧍 Поза:', posePreset.substring(0, 60));
    console.log('👕 Вещь:', garmentType);
    console.log('🎨 Фон:', backgroundPreset.substring(0, 60));
    console.log('📸 Картинка получена:', garmentImageBase64 ? 'ДА' : 'НЕТ');
    console.log('══════════════════════════════════════\n');

    // ═══════════════════════════════════════════
    //  Подготовка изображения
    // ═══════════════════════════════════════════
    if (!garmentImageBase64) {
      throw new Error('Изображение одежды не было передано на сервер!');
    }

    let mimeType = 'image/jpeg';
    let base64str = garmentImageBase64;
    
    // Очищаем Data URL от префикса
    const mimeMatch = garmentImageBase64.match(/^data:(image\/\w+);base64,/);
    if (mimeMatch) {
       mimeType = mimeMatch[1];
       base64str = garmentImageBase64.replace(/^data:image\/\w+;base64,/, '');
    }

    // ═══════════════════════════════════════════
    //  Отправка в Google AI
    // ═══════════════════════════════════════════
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: base64str,
                mimeType: mimeType
              }
            },
            { text: finalPrompt }
          ],
        },
      ],
      config: {
        responseModalities: ['IMAGE', 'TEXT'],
      },
    });

    // Ищем картинку в ответе
    let imageBase64 = null;
    if (response.candidates && response.candidates.length > 0) {
      const parts = response.candidates[0].content?.parts || [];
      for (const part of parts) {
        if (part.inlineData && part.inlineData.mimeType?.startsWith('image/')) {
          imageBase64 = part.inlineData.data;
          break;
        }
      }
    }

    if (!imageBase64) {
      console.error('⚠️ Нейросеть не вернула изображение. Ответ:', JSON.stringify(response.candidates?.[0]?.content?.parts?.map(p => p.text || '[IMAGE]') || 'пустой'));
      throw new Error('Нейросеть не сгенерировала изображение. Попробуйте изменить промпт или повторить запрос.');
    }

    console.log('✅ Картинка успешно сгенерирована через Nano Banano 2!\n');
    res.json({ success: true, imageBase64: imageBase64 });

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
