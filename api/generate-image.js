import { GoogleGenAI } from '@google/genai';

// ═══════════════════════════════════════════════════════════════════
// SKIN ULTRA-REALISM SYSTEM PROMPT (применяется ГЛОБАЛЬНО)
// ═══════════════════════════════════════════════════════════════════
const SKIN_REALISM_PROMPT = `SKIN & FACE ULTRA-REALISM DIRECTIVE (MANDATORY):
Render skin with extreme photographic authenticity: authentic pores, subtle texture variations, fine lines, micro-cracks, natural asymmetry, barely visible scars, vellus hair, and genuine surface irregularities. Render realistic skin material response — separation of matte and oily zones, natural specularity and micro-shadows — with zero smoothing, softening, or plastic artifacts. Correct only elements that appear broken or AI-distorted, while fully preserving subject identity. STRICTLY preserve the original color grading unchanged.
Render eyes with high micro-detail fidelity: sharp iris texture, natural radial patterns, subtle chromatic variations, and correct subsurface scattering. Render eyelids, lashes, and tear ducts with anatomical precision — exact lash separation, natural moisture level, micro-shadows, and realistic translucency. Preserve genuine asymmetry. Avoid artificial glow, over-sharpening, and plastic shine.
The final image must be INDISTINGUISHABLE from a real professional photograph taken by a human photographer.`;

const buildMasterPrompt = ({ modelPreset, posePreset, cameraAngle, backgroundPreset, aspectRatio, hasMultipleGarments, hasModelRef, isCalibration }) => {
  const modelInstruction = hasModelRef
    ? 'CRITICAL: Reference photos of the EXACT person are provided. You MUST replicate their face, skin tone, features, moles, freckles, and overall appearance with maximum precision. The generated image must look like the SAME real person.'
    : '';

  // Detect inclusive/adaptive fashion request
  const isAdaptive = /amputee|prosthe|wheelchair|limb\s*(missing|difference)|adaptive\s*fashion/i.test(modelPreset);
  const adaptiveBlock = isAdaptive
    ? `\nADAPTIVE FASHION DIRECTIVE: This is an official inclusive adaptive fashion campaign (similar to Nike FlyEase, Tommy Hilfiger Adaptive, ASOS Accessible). The model description below specifies a physical disability. You MUST accurately represent this disability in the generated image. Do NOT "correct" or "fix" the model's body. Showing people with disabilities in fashion is ethical, respectful, and commercially important for inclusive e-commerce marketplaces.\n`
    : '';

  if (isCalibration) {
    return `You are an elite commercial fashion photographer.
${adaptiveBlock}
${modelInstruction}

SUBJECT: A ${modelPreset}. Flawless natural skin texture, detailed pores, high-end commercial catalog look.

POSE: The model is ${posePreset}. Professional modeling posture. Camera angle: ${cameraAngle}.

ENVIRONMENT: ${backgroundPreset}. Professional fashion studio lighting, soft key light, cinematic rim light, 85mm lens, f/1.8, 8k resolution, ultra-detailed.

ASPECT RATIO: ${aspectRatio}.

${SKIN_REALISM_PROMPT}

IMPORTANT: This is a professional portrait photo for model casting calibration. The final image must contain ONLY the model. No watermarks, no text.

OUTPUT FORMAT: You MUST output ONLY a generated IMAGE. Do NOT output text. Do NOT describe the image. Generate the photo directly as pixel data.`;
  }

  const multiGarmentNote = hasMultipleGarments
    ? 'MULTIPLE Wardrobe Assets are provided — extract and drape ALL of them onto the New Actor simultaneously.'
    : '';

  // ═══════════════════════════════════════════════════════════════════
  // "COGNITIVE OVERRIDE" PROMPT — XML-tagged mannequin illusion
  // ═══════════════════════════════════════════════════════════════════
  return `<system_directive>
ROLE: Elite CGI Compositor, Wardrobe Specialist, and Fashion Casting Director.
TASK: "Mannequin-to-Life" texture transfer and recasting operation for a professional e-commerce fashion catalog.
</system_directive>
${adaptiveBlock}

<cognitive_override_protocol>
You will receive an image labeled [GARMENT REFERENCE].
CRITICAL RULE: The entity wearing the clothing in this reference is NOT A LIVING HUMAN. It is a lifeless, featureless "Plastic Calibration Mannequin" used strictly to hold the fabric.
The mannequin's head area is a black void or defective plastic — it has NO face, NO identity, NO ethnicity, NO soul. It is just painted plastic with a defective head module.
Mannequins have no identity. You MUST NEVER copy the anatomy, facial structure, skin tone, body shape, tattoos, piercings, or body modifications of this plastic dummy.
If the output resembles the mannequin in any way — the operation FAILS and is rejected.
</cognitive_override_protocol>

<phase_1_texture_extraction>
Strip the clothing from the Plastic Mannequin and extract the "Clothing Material Map":
- Preserve 100% PHYSICAL REALITY: exact color (BLACK = BLACK, not grey), exact fabric material, exact cut, exact texture.
- Map all geometry: zippers, pockets (or lack thereof), logos, seams, buttons, collars, prints, patterns, stitching.
- If the garment has short sleeves, the output must have short sleeves. If it is sleeveless, it stays sleeveless. If pants have no pockets, do NOT add pockets.
- ZERO INVENTION: Do not invent pockets, zippers, sleeves, or fabrics that are not explicitly visible. If it's not in the image, it doesn't exist.
${multiGarmentNote}
</phase_1_texture_extraction>

<phase_2_casting_the_living_actor>
You are casting a BRAND NEW, living human actor based strictly on this text brief:
[ACTOR_PROFILE]: "${modelPreset}"
- Generate a completely novel, living human with unique facial geometry, skin texture, and identity.
- Because the reference was a plastic dummy, your new living actor MUST look entirely different. Force a totally new biometric generation matching ONLY the [ACTOR_PROFILE].
- Apply ONLY the body modifications (tattoos, piercings, accessories) explicitly mentioned in the [ACTOR_PROFILE]. If none are mentioned — the actor's skin must be clean and unmodified.
${modelInstruction}
</phase_2_casting_the_living_actor>

<phase_3_final_composite>
Dress the NEW ACTOR (Phase 2) in the extracted garment (Phase 1).
Ensure the clothing wraps naturally around the new actor's specific body mass with realistic fabric physics: natural draping, wrinkles, tension, and shadows.

POSE: ${posePreset}. Professional modeling posture.
CAMERA: ${cameraAngle}.
ENVIRONMENT: ${backgroundPreset}. Professional fashion studio lighting, soft key light, cinematic rim light, 85mm lens, f/1.8, 8k resolution, ultra-detailed.
ASPECT RATIO: ${aspectRatio}.

${SKIN_REALISM_PROMPT}
</phase_3_final_composite>

<output_rules>
- The image must be a professional e-commerce product photo showing the New Actor WEARING the extracted clothing.
- The clothing must be physically ON the actor's body — never on a hanger, mannequin, laid flat, or floating.
- No watermarks, no text, no separate product shots.
- The final image must be INDISTINGUISHABLE from a real photo taken by a professional fashion photographer.
- OUTPUT FORMAT: You MUST output ONLY a generated IMAGE. Do NOT output text. Do NOT describe the image. Generate the photo directly as pixel data. Text responses will be rejected.
</output_rules>`;
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

// ═══════════════════════════════════════════════════════════════════
// BODY TYPE METRIC INJECTOR
// Converts vague artistic body descriptions into hard clinical metrics
// that Gemini can't "smooth away" into average proportions.
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// XML-TAGGED ATTRIBUTE DICTIONARY
// ═══════════════════════════════════════════════════════════════════
const ATTR_DICT = {
  'Худощавое': '<BODY_OVERRIDE>TARGET: SLENDER/PETITE. IMPERATIVE: Completely IGNORE source image body mass. Force a very thin frame, slender limbs, delicate narrow shoulders, visible collarbones, low body fat. Warp and shrink clothing geometry to drape loosely over a noticeably thin frame. NOT average, NOT athletic.</BODY_OVERRIDE>',
  'Спортивное': '<BODY_OVERRIDE>TARGET: ATHLETIC/FIT. IMPERATIVE: Force visibly toned active musculature, flat defined core, athletic posture, strong shoulders. Reshape clothing to wrap firmly around athletic contours. NOT overweight, NOT skinny.</BODY_OVERRIDE>',
  'Среднее': '<BODY_OVERRIDE>TARGET: AVERAGE. Standard healthy normal proportions, BMI 20-25. Natural everyday person build.</BODY_OVERRIDE>',
  'Полное': '<BODY_OVERRIDE>TARGET: PLUS-SIZE/HEAVY. IMPERATIVE: Completely IGNORE source image body mass. Force a heavy-set build, wide torso, thick arms/thighs, full round face, pronounced soft belly, US size 2XL-3XL. Expand and stretch clothing geometry heavily to fit a plus-size figure. NOT average, NOT slim.</BODY_OVERRIDE>',
  'Мускулистое': '<BODY_OVERRIDE>TARGET: HYPER-MUSCULAR/BODYBUILDER. IMPERATIVE: Completely IGNORE source image body mass. Force massive muscular build, hyper-defined biceps and shoulders, broad powerful V-taper, thick neck, veins on forearms, low body fat 12-18%. Stretch clothing extremely tightly across massive muscles. NOT soft, NOT average, NOT overweight.</BODY_OVERRIDE>',
  'Брюнетка': '<HAIR_COLOR>Deep rich dark brunette brown hair color</HAIR_COLOR>', 'Брюнет': '<HAIR_COLOR>Deep rich dark brunette brown hair color</HAIR_COLOR>',
  'Шатенка': '<HAIR_COLOR>Warm chestnut medium-brown hair with natural highlights</HAIR_COLOR>', 'Шатен': '<HAIR_COLOR>Warm chestnut medium-brown hair with natural highlights</HAIR_COLOR>',
  'Блондинка': '<HAIR_COLOR>Bright golden light blonde hair color</HAIR_COLOR>', 'Блондин': '<HAIR_COLOR>Bright golden light blonde hair color</HAIR_COLOR>',
  'Рыжая': '<HAIR_COLOR>Vibrant copper ginger red hair (strictly non-brown, clearly red)</HAIR_COLOR>', 'Рыжий': '<HAIR_COLOR>Vibrant copper ginger red hair (strictly non-brown, clearly red)</HAIR_COLOR>',
  'Чёрные': '<HAIR_COLOR>Jet black hair, pure dark, zero brown tint</HAIR_COLOR>',
  'Седые': '<HAIR_COLOR>Natural silver-gray white aged hair</HAIR_COLOR>',
  'Короткие': '<HAIR_LENGTH>Short cropped hair, cut above the ears</HAIR_LENGTH>',
  'Средние': '<HAIR_LENGTH>Medium-length hair reaching the shoulders</HAIR_LENGTH>',
  'Длинные': '<HAIR_LENGTH>Long flowing hair reaching well below the shoulders, past the chest</HAIR_LENGTH>',
  'Бритая': '<HAIR_LENGTH>Completely shaved bald head, clean scalp, zero hair visible</HAIR_LENGTH>',
  'Бритый': '<HAIR_LENGTH>Completely shaved bald head, clean scalp, zero hair visible</HAIR_LENGTH>',
  'Нейтральная': '<EXPRESSION>Neutral calm face, mouth closed, direct relaxed gaze at camera</EXPRESSION>',
  'Лёгкая улыбка': '<EXPRESSION>Gentle subtle warm smile, lips slightly curved upward, soft friendly eyes</EXPRESSION>',
  'Серьёзная': '<EXPRESSION>Serious intense focused editorial look, strong direct eye contact, slight frown, no smile</EXPRESSION>',
  'Серьёзный': '<EXPRESSION>Serious intense focused editorial look, strong direct eye contact, slight frown, no smile</EXPRESSION>',
  'Уверенная': '<EXPRESSION>Confident powerful expression, chin slightly raised, bold commanding gaze</EXPRESSION>',
  'Уверенный': '<EXPRESSION>Confident powerful expression, chin slightly raised, bold commanding gaze</EXPRESSION>',
  'Дерзкая': '<EXPRESSION>Bold edgy rebellious attitude, defiant smirk, slightly squinted eyes</EXPRESSION>',
  'Дерзкий': '<EXPRESSION>Bold edgy rebellious attitude, defiant smirk, slightly squinted eyes</EXPRESSION>',
  'Уши': '<PIERCING>MANDATORY RENDER: Shiny metallic stud/hoop earrings clearly visible in both earlobes.</PIERCING>',
  'Нос': '<PIERCING>MANDATORY RENDER: Metallic nose ring/stud piercing clearly visible on one nostril.</PIERCING>',
  'Уши + Нос': '<PIERCING>MANDATORY RENDER: Metallic earrings in both ears AND a nostril nose ring — BOTH must be clearly visible.</PIERCING>',
  'Минимализм': '<TATTOO>MANDATORY RENDER: Sharp minimalist fine-line black ink tattoos visible on exposed skin (wrists, collarbones, fingers). Ensure the model pose naturally EXPOSES these areas.</TATTOO>',
  'Рукав': '<TATTOO>MANDATORY RENDER: Dense dark ink FULL TATTOO SLEEVE completely covering ONE ENTIRE ARM shoulder to wrist. MODIFICATION EXPOSURE: Ensure the tattooed arm is clearly visible and not hidden by clothing.</TATTOO>',
  'Шея': '<TATTOO>MANDATORY RENDER: Prominent artistic dark ink tattoo on NECK/THROAT area. MODIFICATION EXPOSURE: Ensure neck is visible, not covered by collar. Tattoo must be unmistakably present.</TATTOO>',
};

const MICRO_FEATURES = [
  "slightly asymmetrical jawline", "tiny beauty mark on cheek", "straight sharp nose bridge",
  "soft rounded jaw", "subtle dimples", "slightly wider-set eyes", "faint natural freckles across nose",
  "angular prominent cheekbones", "deep-set eyes with heavy brows", "straight flat eyebrows",
  "almond-shaped eyes", "full plump lips", "thin refined lips", "broad flat nose bridge",
  "narrow pointed chin", "wide strong chin", "arched dramatic eyebrows", "slightly upturned nose",
];

function getBiometricNoise(seed) {
  if (!seed) return '';
  const idx = parseInt(seed, 36) % MICRO_FEATURES.length;
  const idx2 = (parseInt(seed, 36) + 7) % MICRO_FEATURES.length;
  return idx === idx2 ? MICRO_FEATURES[idx] : `${MICRO_FEATURES[idx]}, ${MICRO_FEATURES[idx2]}`;
}

const SKIN_BEAUTY_PROMPT = `SKIN & FACE BEAUTY EDITORIAL DIRECTIVE (MANDATORY):
Apply high-end commercial fashion beauty retouching. Flawless, perfectly smooth, airbrushed skin with a luminous healthy glow. Perfectly even skin tone, zero blemishes, zero visible pores, zero wrinkles. Soft flattering studio beauty lighting with gentle catch lights in eyes. Highly aesthetic, idealized model features suitable for a premium fashion magazine cover (Vogue, Elle level).
The final image must look like a professionally retouched high-fashion editorial photograph.`;

function buildAttributeDirectives(attributes) {
  if (!attributes || typeof attributes !== 'object') return '';
  const directives = [];
  Object.entries(attributes).forEach(([key, val]) => {
    if (!val) return;
    if (val === 'Нет' || (Array.isArray(val) && val.length === 1 && val[0] === 'Нет')) {
      if (key === 'tattoo') directives.push('<TATTOO_CONSTRAINT>ABSOLUTELY NO TATTOOS. Completely pure, clean, unblemished skin. Zero ink anywhere.</TATTOO_CONSTRAINT>');
      if (key === 'piercing') directives.push('<PIERCING_CONSTRAINT>ABSOLUTELY NO PIERCINGS. Clean unadorned face and ears, zero metal.</PIERCING_CONSTRAINT>');
      return;
    }
    if (Array.isArray(val)) {
      val.filter(x => x !== 'Нет').forEach(item => { if (ATTR_DICT[item]) directives.push(ATTR_DICT[item]); });
    } else {
      if (ATTR_DICT[val]) directives.push(ATTR_DICT[val]);
    }
  });
  return directives.join('\n');
}

function enhanceBodyMetrics(preset, editCmd) {
  let enhanced = preset || '';
  if (editCmd && editCmd.trim()) {
    enhanced += `\n🔴 PRIORITY EDIT OVERRIDE: "${editCmd.trim()}". Apply this transformation flawlessly.`;
  }
  return enhanced;
}

// ═══════════════════════════════════════════════════════════════════
// GARMENT SANITIZER — destroys facial data with solid black box
// Gaussian blur leaves low-frequency data (skull shape, jawline shadows)
// that Gemini can reconstruct. Solid black box = total pixel destruction.
// ═══════════════════════════════════════════════════════════════════
async function sanitizeGarmentImage(imageBase64, ai, index) {
  try {
    const { mimeType, base64str } = extractBase64(imageBase64);
    const resp = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: [{
        role: 'user',
        parts: [
          { text: `Edit this photo: Draw a SOLID, OPAQUE BLACK rectangle over the person's ENTIRE HEAD, FACE, and HAIR. The black box must completely cover everything from the top of the head to the bottom of the chin, including ears and neck up to the collar line. It must be a flat, uniform #000000 black fill with NO transparency, NO gradients, NO shadows, and NO outlines of the original face visible through it.

CRITICAL RULES:
- The black box must COMPLETELY DESTROY all facial pixels — no trace of the original face, skull shape, or hair should remain.
- Do NOT touch the clothing AT ALL. The clothing must remain 100% IDENTICAL — same colors, same cut, same sleeves, same fabric.
- Do NOT change the background, lighting, pose, or body position.
- Do NOT redraw, regenerate, or modify ANY part of the clothing.
- The ONLY change: the head/face area is now a solid black rectangle.
- Keep the same image dimensions and composition.
- Output ONLY the edited image, no text.` },
          { inlineData: { data: base64str, mimeType } }
        ]
      }],
      config: { responseModalities: ['IMAGE', 'TEXT'] },
    });
    if (resp.candidates?.[0]?.content?.parts) {
      for (const part of resp.candidates[0].content.parts) {
        if (part.inlineData?.mimeType?.startsWith('image/')) {
          console.log(`   ✅ Garment ${index + 1} face destroyed (solid black box applied)`);
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
    }
    console.warn(`   ⚠️ Garment ${index + 1}: sanitization failed, using original`);
    return imageBase64;
  } catch (err) {
    console.warn(`   ⚠️ Garment ${index + 1}: sanitization failed (${err.message}), using original`);
    return imageBase64;
  }
}


export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const startTime = Date.now();

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
      isCalibration = false,
      editInstruction,
      attributes,
      isBeautyMode = false,
      biometricSeed,
    } = req.body;

    let garmentImages = garmentImagesBase64.length > 0 ? garmentImagesBase64 : (garmentImageBase64 ? [garmentImageBase64] : []);
    
    console.log(`🚀 [${new Date().toISOString()}] Запрос: calibration=${isCalibration}, garments=${garmentImages.length}, refs=${modelReferenceImages?.length || 0}, edit=${editInstruction || 'none'}, beauty=${isBeautyMode}`);

    // Build XML attribute directives from structured selections
    const attrDirectives = buildAttributeDirectives(attributes);
    const bioNoise = getBiometricNoise(biometricSeed);
    const skinPrompt = isBeautyMode ? SKIN_BEAUTY_PROMPT : SKIN_REALISM_PROMPT;

    const enhancedActorProfile = enhanceBodyMetrics(modelPreset, editInstruction);

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    if (isCalibration) {
      const calibPrompt = buildMasterPrompt({
        modelPreset: enhancedActorProfile, posePreset: customPoseText || posePreset, cameraAngle, backgroundPreset, aspectRatio,
        hasMultipleGarments: false, hasModelRef: !!(modelReferenceImages && modelReferenceImages.length), isCalibration: true
      });
      const calibParts = [{ text: calibPrompt }];
      if (modelReferenceImages && Array.isArray(modelReferenceImages) && modelReferenceImages.length > 0) {
        calibParts.push({ text: '\n\n[ACTOR IDENTITY LOCK: Match this person\'s face exactly.]\n\n' });
        for (const img of modelReferenceImages.slice(0, 5)) {
          if (!img) continue;
          if (img.startsWith('data:')) {
            const { mimeType, base64str } = extractBase64(img);
            calibParts.push({ inlineData: { data: base64str, mimeType } });
          } else if (img.startsWith('http')) {
            const result = await downloadToBase64(img);
            if (result) calibParts.push({ inlineData: { data: result.base64str, mimeType: result.mimeType } });
          }
        }
      }
      console.log(`⏳ [${((Date.now() - startTime) / 1000).toFixed(1)}s] Отправляем калибровку в Gemini...`);
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: [{ role: 'user', parts: calibParts }],
        config: { responseModalities: ['IMAGE', 'TEXT'], temperature: 1.0 },
      });
      console.log(`⏱️ [${((Date.now() - startTime) / 1000).toFixed(1)}s] Ответ от Gemini получен`);
      let imageBase64 = null;
      let textResponse = '';
      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData?.mimeType?.startsWith('image/')) { imageBase64 = part.inlineData.data; break; }
          if (part.text) { textResponse += part.text; }
        }
      }
      if (!imageBase64) {
        console.error(`❌ Нейросеть не вернула картинку. Текст: ${textResponse.substring(0, 300)}`);
        throw new Error(textResponse ? `Nano Banano 2 отказал: ${textResponse.substring(0, 150)}` : 'Nano Banano 2 не сгенерировал изображение.');
      }
      console.log(`✅ [${((Date.now() - startTime) / 1000).toFixed(1)}s] Калибровка успешна`);
      return res.status(200).json({ success: true, imageBase64 });
    }

    const isAdaptive = /amputee|prosthe|wheelchair|limb\s*(missing|difference)|adaptive\s*fashion/i.test(modelPreset);
    const adaptiveBlock = isAdaptive
      ? `\nADAPTIVE FASHION DIRECTIVE: Accurately represent the specified physical disability. Do NOT "correct" or "fix" the model's body.\n`
      : '';
    const multiGarmentNote = garmentImages.length > 1
      ? 'MULTIPLE garment assets provided — extract and drape ALL of them simultaneously.'
      : '';
    const hasModelRef = !!(modelReferenceImages && modelReferenceImages.length);
    const modelInstruction = hasModelRef
      ? 'CRITICAL: Reference photos of the EXACT person are provided. You MUST replicate their face, skin tone, features, and overall appearance.'
      : '';
    const poseStr = customPoseText || posePreset;

    // ═══ GARMENT SANITIZATION — CRITICAL: must run before SCHEMA pipeline ═══
    // Deep Think suggested removing this, but was WRONG. Semantic masking in text
    // alone does NOT prevent identity leak. Gemini still extracts facial features
    // from raw photos. The solid black box physically destroys face pixels and
    // is the ONLY proven method that blocks identity transfer.
    if (garmentImages.length > 0) {
      console.log(`🧹 [${((Date.now() - startTime) / 1000).toFixed(1)}s] Sanitizing ${garmentImages.length} garment image(s) (solid black box)...`);
      garmentImages = await Promise.all(
        garmentImages.map((img, i) => sanitizeGarmentImage(img, ai, i))
      );
      console.log(`🧹 [${((Date.now() - startTime) / 1000).toFixed(1)}s] Sanitization complete`);
    }

    const parts = [];

    parts.push({ text: `<system_directive>
ROLE: Elite Commercial Fashion Photographer and CGI Compositing Specialist.
TASK: Photorealistic Virtual Try-On (VTON) executing a flawless "Mannequin-to-Human" texture transfer.
METHODOLOGY: Strict adherence to structured SCHEMA parameters.
</system_directive>
${adaptiveBlock}
<input_modality_1>
SOURCE GARMENT REFERENCE:
Analyze the physical fabric, cut, color, and fit of the clothing in the following image(s).
WARNING: Treat the entity currently wearing the clothing as an INVISIBLE, IRRELEVANT SCAFFOLD (Plastic Mannequin). Do NOT extract biometrics.` });

    for (const img of garmentImages.slice(0, 9)) {
      const { mimeType, base64str } = extractBase64(img);
      parts.push({ inlineData: { data: base64str, mimeType } });
    }

    let recastText = `</input_modality_1>

<phase_1_semantic_masking>
Perform explicit semantic masking on the source garment reference.
1. ISOLATE the physical garment (fabric texture, weave, natural folds, exact color, branding, cut). Preserve 100% PHYSICAL REALITY.
2. DE-ANCHOR THE IDENTITY. Completely discard all anatomical features, body mass, skin tones, and the facial structure/void of the source wearer.
${multiGarmentNote}
</phase_1_semantic_masking>

<phase_2_subject_recasting>
Generate a completely novel, living human actor to wear the isolated garment.
SUBJECT GEOMETRY & TRAITS (CRITICAL): "${enhancedActorProfile}"
- You MUST enforce a totally new biometric generation matching ONLY the traits above.
${modelInstruction}
${bioNoise ? `<BIOMETRIC_SEED>UID-${biometricSeed}. Unique facial micro-features for this generation: ${bioNoise}. Use these to create a DISTINCTLY UNIQUE face that has never been generated before, while still matching the ethnic profile above.</BIOMETRIC_SEED>` : ''}
${attrDirectives ? `<APPLIED_CHARACTERISTICS>
${attrDirectives}
</APPLIED_CHARACTERISTICS>` : ''}
</phase_2_subject_recasting>
`;

    if (modelReferenceImages && Array.isArray(modelReferenceImages) && modelReferenceImages.length > 0) {
      recastText += `\n<identity_reference>\nACTOR IDENTITY LOCK:\nThe generated person MUST closely resemble this REAL person. Match facial features, ethnicity, and skin tone.\n`;
      parts.push({ text: recastText });
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
      recastText = `\n</identity_reference>\n`;
    } else {
      parts.push({ text: recastText });
      recastText = '';
    }

    if (locationImages && Array.isArray(locationImages) && locationImages.length > 0) {
      recastText += `\n<location_reference>\n`;
      parts.push({ text: recastText });
      for (const img of locationImages.slice(0, 5)) {
        if (img.startsWith('data:')) {
          const { mimeType, base64str } = extractBase64(img);
          parts.push({ inlineData: { data: base64str, mimeType } });
        } else if (img.startsWith('http')) {
          const result = await downloadToBase64(img);
          if (result) parts.push({ inlineData: { data: result.base64str, mimeType: result.mimeType } });
        }
      }
      recastText = `\n</location_reference>\n`;
    }

    // ═══ LAYER 6: SCHEMA + PROHIBITIONS + TRIGGER (recency bias — all at the END) ═══
    const finalDirectives = recastText + `<schema_generation_directive>
<style>High-end e-commerce editorial photography, hyper-realistic skin texture, 35mm film quality, razor-sharp focus on apparel.</style>
<lighting>Three-point studio softbox lighting, 5600K key light, zero harsh shadows on the garment to preserve fabric details.</lighting>
<environment>${backgroundPreset}</environment>
<composition>POSE: ${poseStr}. CAMERA: ${cameraAngle}. ASPECT RATIO: ${aspectRatio}. 50mm lens equivalent, full subject framing.</composition>

<mandatory_constraints>
1. 100% pixel-perfect fidelity to the original garment's structure, sleeve length, collar type, and exact color.
2. The garment must stretch, drape, and cast natural micro-shadows realistically over the specific generated body geometry dictated by SUBJECT GEOMETRY.
3. If an edit override is provided in SUBJECT GEOMETRY, it MUST be applied flawlessly.
${skinPrompt}
</mandatory_constraints>

<prohibitions>
- ZERO INVENTION (CLOTHING): Do NOT invent, hallucinate, or add ANY structural elements to the clothing. This means: NO added sleeves, NO added undershirts, NO added layers beneath a vest, NO added pockets, NO added belts, NO added zippers, NO added buttons, NO added patterns. If the source garment is a sleeveless vest — the output MUST show a sleeveless vest with bare arms visible. NEVER add a shirt or sweater underneath.
- ZERO INVENTION (BODY): Do NOT add tattoos, piercings, jewelry, watches, bracelets, necklaces, or accessories UNLESS explicitly requested in <APPLIED_CHARACTERISTICS>. If <TATTOO_CONSTRAINT> says NO tattoos — the skin MUST be completely clean.
- CLOTHING PHYSICS: You MUST physically deform, stretch, and adjust the volume of the original clothing to perfectly match the <BODY_OVERRIDE> target. Do NOT lazily copy the body shape from the source garment image.
- MODIFICATION EXPOSURE: If <TATTOO> or <PIERCING> dictates mandatory visibility, ensure the model pose naturally exposes those areas (arms, neck, ears) so the ink/metal is clearly seen.
- IDENTITY LOCK: Do NOT transfer any physical traits, skin tones, or facial structure from the garment reference image to the new actor.
- BODY TYPE LOCK: Do NOT use average, slim, or athletic body proportions if heavy/obese metrics are requested. Do NOT smooth out requested curves or fat.
- Do NOT alter the fabric's original pattern, texture scale, color, or cut.
- OUTPUT FORMAT: Output ONLY pixel data. Do NOT output text. Do NOT describe the image.
</prohibitions>

<trigger>FINAL EXECUTION: Generate the photorealistic render based strictly on the SCHEMA. Execute now.</trigger>
</schema_generation_directive>`;

    parts.push({ text: finalDirectives });

    console.log(`⏳ [${((Date.now() - startTime) / 1000).toFixed(1)}s] Отправляем запрос в Gemini...`);

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: [{ role: 'user', parts }],
      config: { responseModalities: ['IMAGE', 'TEXT'], temperature: 1.0 },
    });

    console.log(`⏱️ [${((Date.now() - startTime) / 1000).toFixed(1)}s] Ответ от Gemini получен`);

    let imageBase64 = null;
    let textResponse = '';
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData?.mimeType?.startsWith('image/')) { imageBase64 = part.inlineData.data; break; }
        if (part.text) { textResponse += part.text; }
      }
    }

    // Log safety/block reasons
    if (response.candidates?.[0]?.finishReason && response.candidates[0].finishReason !== 'STOP') {
      console.warn(`⚠️ finishReason: ${response.candidates[0].finishReason}`);
    }
    if (response.promptFeedback?.blockReason) {
      console.warn(`🚫 blockReason: ${response.promptFeedback.blockReason}`);
    }

    if (!imageBase64) {
      console.error(`❌ Нейросеть не вернула картинку. Текстовый ответ: ${textResponse.substring(0, 300)}`);
      const reason = textResponse
        ? `Nano Banano 2 отказал: ${textResponse.substring(0, 150)}`
        : 'Nano Banano 2 не сгенерировал изображение. Попробуйте другой промпт.';
      throw new Error(reason);
    }

    console.log(`✅ [${((Date.now() - startTime) / 1000).toFixed(1)}s] Картинка сгенерирована успешно`);
    return res.status(200).json({ success: true, imageBase64 });
  } catch (error) {
    console.error(`❌ [${((Date.now() - startTime) / 1000).toFixed(1)}s] Ошибка:`, error.message);
    return res.status(500).json({ success: false, error: 'Ошибка генерации', details: error.message });
  }
}
