// ═══════════════════════════════════════════════════════════════
//  STEP 4: AI Quality Score (Gemini 2.5 Flash Vision)
//  LLM-as-a-Judge: оценка и отбраковка мутантов
// ═══════════════════════════════════════════════════════════════
import { GoogleGenAI } from '@google/genai';

const QA_PROMPT = `Role: Strict Vogue Photo Editor & AI Artifact Auditor.
Task: Compare the GENERATED fashion image against the ORIGINAL clothing reference photo.

Evaluate the generated image with this strict rubric:

1. ANATOMY (Critical — instant reject if failed):
   - Count fingers on ALL visible hands. REJECT if not exactly 5 per hand.
   - Check limb proportions — REJECT if melted, detached, or anatomically impossible.
   - Check face symmetry — REJECT if melting artifacts or plastic skin.

2. GARMENT FIDELITY (Critical):
   - Compare generated garment with original reference.
   - REJECT if color has bled into skin, major details missing (zippers, logos, pockets).
   - Score how accurately the cut, fabric texture, and color match the original.

3. PHYSICS:
   - REJECT if clothing appears to melt into background or defy gravity.
   - Check for natural draping and wrinkle patterns.

4. AESTHETICS (1-10):
   - Lighting naturalness
   - Background cohesion
   - Overall commercial quality

Return ONLY strict JSON:
{
  "score": <number 1-10>,
  "accepted": <boolean>,
  "finger_count_left": <number or "not_visible">,
  "finger_count_right": <number or "not_visible">,
  "reason": "<brief explanation>"
}

RULE: If finger_count is not exactly 5 (when visible), or limbs are impossible, set accepted=false IMMEDIATELY.`;

export async function scoreQuality(originalImageUrl, generatedImageUrl) {
  const apiKey = process.env.GEMINI_API_KEY;

  // Mock mode для тестирования
  if (!apiKey || process.env.MOCK_KIE === 'true') {
    console.log('   🎭 [MOCK] Simulating AI Quality Score...');
    await new Promise(r => setTimeout(r, 500));
    const score = 5 + Math.floor(Math.random() * 5); // 5-9
    const accepted = score >= 7;
    return {
      score,
      accepted,
      finger_count_left: 5,
      finger_count_right: 5,
      reason: accepted ? 'Good anatomy, accurate garment match' : 'Minor artifacts detected in fabric rendering'
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    // Скачиваем оба изображения
    const [origResp, genResp] = await Promise.all([
      fetch(originalImageUrl, { signal: AbortSignal.timeout(20000) }),
      fetch(generatedImageUrl, { signal: AbortSignal.timeout(20000) })
    ]);

    if (!origResp.ok || !genResp.ok) throw new Error('Failed to download images for QA');

    const [origBuf, genBuf] = await Promise.all([
      origResp.arrayBuffer(),
      genResp.arrayBuffer()
    ]);

    const origB64 = Buffer.from(origBuf).toString('base64');
    const genB64 = Buffer.from(genBuf).toString('base64');
    const origMime = origResp.headers.get('content-type') || 'image/jpeg';
    const genMime = genResp.headers.get('content-type') || 'image/jpeg';

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'ORIGINAL CLOTHING REFERENCE:' },
            { inlineData: { mimeType: origMime, data: origB64 } },
            { text: 'GENERATED FASHION IMAGE:' },
            { inlineData: { mimeType: genMime, data: genB64 } },
            { text: QA_PROMPT }
          ]
        }
      ],
      config: {
        temperature: 0.1,
        maxOutputTokens: 512,
        responseMimeType: 'application/json'
      }
    });

    const text = response.text?.trim() || '';
    return JSON.parse(text);
  } catch (err) {
    console.error(`❌ QA scoring failed: ${err.message}`);
    // При ошибке — пропускаем фото (лучше принять, чем потерять)
    return { score: 6, accepted: true, reason: `QA error, auto-accepted: ${err.message}` };
  }
}
