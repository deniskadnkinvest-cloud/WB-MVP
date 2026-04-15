import { GoogleGenAI } from '@google/genai';

// ═══════════════════════════════════════════
//  НОДА: Prompt Builder
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
//  Vercel Serverless Function
// ═══════════════════════════════════════════
export default async function handler(req, res) {
  // CORS Handling
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

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

    if (!process.env.GEMINI_API_KEY) {
      throw new Error('Ключ API GEMINI_API_KEY не установлен на сервере.');
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    if (!garmentImageBase64) {
      throw new Error('Изображение одежды не было передано на сервер!');
    }

    let mimeType = 'image/jpeg';
    let base64str = garmentImageBase64;
    
    const mimeMatch = garmentImageBase64.match(/^data:(image\/\w+);base64,/);
    if (mimeMatch) {
       mimeType = mimeMatch[1];
       base64str = garmentImageBase64.replace(/^data:image\/\w+;base64,/, '');
    }

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
      throw new Error('Нейросеть не сгенерировала изображение. Попробуйте изменить промпт.');
    }

    return res.status(200).json({ success: true, imageBase64: imageBase64 });

  } catch (error) {
    console.error('❌ Ошибка при генерации:', error.message || error);
    return res.status(500).json({
      success: false,
      error: 'Ошибка генерации',
      details: error.message || 'Неизвестная ошибка'
    });
  }
}
