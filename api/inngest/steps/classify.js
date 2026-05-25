// ═══════════════════════════════════════════════════════════════
//  STEP 1: AI Классификация одежды (Gemini 2.5 Flash)
//  Принимает фото на манекене → возвращает структурированный JSON
// ═══════════════════════════════════════════════════════════════
import { GoogleGenAI } from '@google/genai';

const CLASSIFICATION_PROMPT = `Analyze this clothing item photo carefully.
You are a professional fashion expert AI. The image shows a clothing item on a mannequin or flat lay.

Return ONLY a strict JSON object with these exact fields:
{
  "category": one of: "dress", "jacket", "t-shirt", "pants", "skirt", "swimwear", "sweater", "hoodie", "coat", "shorts",
  "fit": one of: "tight", "loose", "oversized", "regular",
  "seasonality": one of: "summer", "winter", "demi-season", "all-season",
  "dominant_color": "<exact color name in English>",
  "style": one of: "casual", "formal", "streetwear", "sport", "evening",
  "gender": one of: "female", "male", "unisex"
}

IMPORTANT: Return ONLY the JSON, no markdown, no explanation.`;

export async function classifyGarment(imageUrl) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ GEMINI_API_KEY not set, using mock classification');
    return getMockClassification();
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    // Скачиваем изображение
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) throw new Error(`Failed to fetch image: ${imageResponse.status}`);
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64 = Buffer.from(imageBuffer).toString('base64');
    const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: base64 } },
            { text: CLASSIFICATION_PROMPT }
          ]
        }
      ],
      config: {
        temperature: 0.1,
        maxOutputTokens: 256,
        responseMimeType: 'application/json'
      }
    });

    let text = response.text?.trim() || '';
    if (text.startsWith('```')) {
      text = text.replace(/^```json\n?/, '').replace(/```$/, '').trim();
    }
    const json = JSON.parse(text);
    return json;
  } catch (err) {
    console.error(`❌ Gemini classification failed: ${err.message}`);
    console.log('   Using mock classification as fallback');
    return getMockClassification();
  }
}

// Mock-классификация для тестирования без API
function getMockClassification() {
  const categories = ['dress', 'jacket', 't-shirt', 'pants', 'sweater', 'hoodie', 'coat'];
  const fits = ['tight', 'loose', 'oversized', 'regular'];
  const seasons = ['summer', 'winter', 'demi-season', 'all-season'];
  const colors = ['black', 'white', 'navy', 'red', 'beige', 'olive', 'burgundy'];
  const styles = ['casual', 'formal', 'streetwear', 'sport', 'evening'];
  const genders = ['female', 'male'];

  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  return {
    category: pick(categories),
    fit: pick(fits),
    seasonality: pick(seasons),
    dominant_color: pick(colors),
    style: pick(styles),
    gender: pick(genders)
  };
}
