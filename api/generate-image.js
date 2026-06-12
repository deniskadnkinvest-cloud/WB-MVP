
import { alertOnError } from './_admin-alerts.js';
import { ensureFirebaseAdmin } from './_firebase-admin.js';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

ensureFirebaseAdmin();
const _db = getFirestore();

// Атомарно инкрементирует глобальный счётчик в Firestore
async function incrementGlobalCounter(field) {
  try {
    const today = new Date().toISOString().slice(0, 10); // "2026-06-04"
    await _db.doc('_stats/global').set({
      [field]: FieldValue.increment(1),
    }, { merge: true });
    await _db.doc(`_stats/daily/${today}/counts`).set({
      [field]: FieldValue.increment(1),
    }, { merge: true });
  } catch (e) {
    // Не ломаем основной флоу — тихо пишем в лог
    console.warn('[stats counter] Failed:', e.message);
  }
}

// Записывает подробный лог генерации в Firestore
async function saveGenerationLog({ userId, success, imageUrl, error, reqBody, durationMs }) {
  try {
    const generationId = `gen_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();
    
    const docData = {
      id: generationId,
      userId: userId || 'anonymous',
      success,
      createdAt: now,
      durationMs,
      type: reqBody?.isProductMode ? 'product' : reqBody?.isCalibration ? 'calibration' : 'fashion',
      aspectRatio: reqBody?.aspectRatio || '3:4',
      garmentUrls: reqBody?.garmentImageUrls || [],
      modelPreset: reqBody?.modelPreset || '',
      posePreset: reqBody?.posePreset || '',
      backgroundPreset: reqBody?.backgroundPreset || '',
      // Расширенные метаданные для панели деталей в «Мои работы»
      cameraAngle: reqBody?.cameraAngle || '',
      categoryId: reqBody?.categoryId || '',
      withHumanModel: reqBody?.withHumanModel || false,
      isCardDesign: reqBody?.isCardDesign || false,
      cardStyle: reqBody?.cardStyle || '',
      isBeautyMode: reqBody?.isBeautyMode || false,
      isPhotoEdit: reqBody?.isPhotoEdit || false,
      editInstruction: reqBody?.editInstruction || '',
      customPoseText: reqBody?.customPoseText || '',
      attributes: reqBody?.attributes || null,
    };
    
    if (imageUrl) docData.imageUrl = imageUrl;
    if (error) docData.error = error;
    
    await _db.collection('generations').doc(generationId).set(docData);
    console.log(`📊 [stats] Logged generation ${generationId} for user ${userId || 'anonymous'} (${success ? 'success' : 'failed'})`);
  } catch (e) {
    console.warn('[stats log] Failed to write generation log:', e.message);
  }
}

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

const KIE_API_KEY = process.env.KIE_API_KEY;
const TASK_URL = 'https://api.kie.ai/api/v1/jobs/createTask';
const GET_TASK_URL = 'https://api.kie.ai/api/v1/jobs/recordInfo?taskId=';
const FILE_UPLOAD_URL = 'https://kieai.redpandaai.co/api/file-base64-upload';

// Upload a base64 image to KIE.ai File Upload API and return the download URL
async function uploadBase64ToKie(base64DataUrl, apiKey, index = 0) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    const resp = await fetch(FILE_UPLOAD_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        base64Data: base64DataUrl,
        uploadPath: 'images/vton',
        fileName: `garment_${index}_${Date.now()}.png`
      }),
      signal: controller.signal
    });
    const data = await resp.json();
    if (data.code === 200 && data.data && data.data.downloadUrl) {
      console.log(`   ✅ Image ${index} uploaded to KIE: ${data.data.downloadUrl.substring(0, 80)}...`);
      return data.data.downloadUrl;
    }
    console.warn(`   ⚠️ Image ${index} upload failed: ${data.msg || JSON.stringify(data)}`);
    return null;
  } catch (err) {
    console.warn(`   ⚠️ Image ${index} upload error: ${err.message}`);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function executeKieTask(prompt, imageInputs = [], modelName = "nano-banana-2") {
  const rawKey = process.env.KIE_API_KEY;
  if (!rawKey) throw new Error("API key missing. Set KIE_API_KEY in .env");
  // Strip BOM, zero-width chars, and whitespace that PowerShell/editors inject
  const apiKey = rawKey.replace(/[\uFEFF\u200B\u200C\u200D\uFFFE\r\n]/g, '').trim();

  // Upload base64 images to KIE File Upload API first (KIE.ai requires URLs, not inline base64)
  let uploadedImageUrls = [];
  if (imageInputs.length > 0) {
    console.log(`   📤 Uploading ${imageInputs.length} image(s) to KIE File Upload API...`);
    for (let idx = 0; idx < imageInputs.length; idx++) {
      const url = await uploadBase64ToKie(imageInputs[idx], apiKey, idx);
      if (url) uploadedImageUrls.push(url);
    }
    console.log(`   📤 Uploaded ${uploadedImageUrls.length}/${imageInputs.length} images`);
  }

  const reqBody = {
    model: modelName,
    input: {
      prompt: prompt,
      image_input: uploadedImageUrls,
      aspect_ratio: "auto",
      resolution: "1K",
      output_format: "png"
    }
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 sec timeout for creation
  let response;
  try {
    response = await fetch(TASK_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(reqBody),
      signal: controller.signal
    });
  } catch (err) {
    throw new Error(`KIE.ai API network error: ${err.message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
     const txt = await response.text();
     throw new Error(`KIE.ai API error (${response.status}): ${txt}`);
  }
  
  const data = await response.json();
  if (data.code && data.code !== 200) {
     throw new Error(`KIE.ai API returned code ${data.code}: ${data.msg || 'Unknown error'}`);
  }
  if (!data.data || !data.data.taskId) {
     throw new Error(`KIE.ai failed to return taskId. Result: ${JSON.stringify(data)}`);
  }
  
  const taskId = data.data.taskId;
  console.log(`⏳ KIE.ai Task created. Model: ${modelName}. TaskID: ${taskId}. Polling...`);

  for (let i = 0; i < 100; i++) { // Max 5 mins (100 * 3s)
    await new Promise(resolve => setTimeout(resolve, i === 0 ? 2000 : 3000)); // First poll faster
    
    const pollController = new AbortController();
    const pollTimeout = setTimeout(() => pollController.abort(), 15000);
    let pollResp;
    try {
      pollResp = await fetch(`${GET_TASK_URL}${taskId}`, {
         headers: { 'Authorization': `Bearer ${apiKey}` },
         signal: pollController.signal
      });
    } catch (err) {
      console.warn(`   ⚠️ KIE poll network error: ${err.message}`);
      continue;
    } finally {
      clearTimeout(pollTimeout);
    }
    
    if (!pollResp.ok) continue;
    const pollData = await pollResp.json();
    
    if (pollData?.data?.state === 'success') {
       const resultStr = pollData.data.resultJson;
       if (!resultStr) throw new Error("Task success but no resultJson");
       let resultObj;
       try { resultObj = JSON.parse(resultStr); } catch (e) { throw new Error("Failed to parse resultJson: " + resultStr); }
       
       const imageUrls = resultObj.resultUrls || resultObj.images || [];
       if (imageUrls.length > 0) return imageUrls[0];
       throw new Error("No image URLs in result: " + resultStr);
    } else if (pollData?.data?.state === 'failed' || pollData?.data?.failCode) {
       throw new Error(`Task failed: ${pollData.data.failMsg || pollData.data.failCode || 'Unknown error'}`);
    } else {
       console.log(`   ...Task ${taskId} state: ${pollData?.data?.state || 'unknown'} (poll ${i+1}/60)`);
    }
  }
  
  throw new Error("Task timed out after 5 minutes.");
}

const extractBase64 = (dataUrl) => {
  let mimeType = 'image/jpeg', base64str = dataUrl;
  const match = dataUrl.match(/^data:(image\/\w+);base64,/);
  if (match) { mimeType = match[1]; base64str = dataUrl.replace(/^data:image\/\w+;base64,/, ''); }
  return { mimeType, base64str };
};

// Download image from URL and return base64
const downloadToBase64 = async (url) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 sec timeout
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    const arrBuf = await resp.arrayBuffer();
    const b64 = Buffer.from(arrBuf).toString('base64');
    const contentType = resp.headers.get('content-type') || 'image/jpeg';
    return { mimeType: contentType, base64str: b64 };
  } catch (err) {
    console.warn(`⚠️ Failed to download image from ${url.substring(0, 50)}...:`, err.message);
    return null;
  }
};

// ═══════════════════════════════════════════════════════════════════
// BODY TYPE METRIC INJECTOR
// Converts vague artistic body descriptions into hard clinical metrics
// that Gemini can't "smooth away" into average proportions.
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// GENDER-ISOLATED ATTRIBUTE DICTIONARIES
// ═══════════════════════════════════════════════════════════════════
const DICT_FEMALE = {
  'Худощавое': '<BODY_OVERRIDE>TARGET: SLENDER PETITE FEMALE. Very thin feminine frame, delicate narrow shoulders, slender limbs, visible collarbones. Deform clothing to drape over a noticeably thin female body.</BODY_OVERRIDE>',
  'Спортивное': '<BODY_OVERRIDE>TARGET: FIT FEMALE / YOGA BODY. Toned feminine figure, subtle healthy muscle definition on arms and core. Maintain soft feminine curves and female breast contour. Adjust clothing for an active female fit.</BODY_OVERRIDE>',
  'Среднее': '<BODY_OVERRIDE>TARGET: AVERAGE NORMAL FEMALE. Standard healthy feminine proportions, natural female curves, soft body lines.</BODY_OVERRIDE>',
  'Полное': '<BODY_OVERRIDE>TARGET: PLUS-SIZE FEMALE. Voluptuous curvy feminine figure, heavy-set. Full hips, thick feminine thighs, larger bust. Expand clothing heavily to naturally fit a confident plus-size woman (XXL).</BODY_OVERRIDE>',
  'Мускулистое': '<BODY_OVERRIDE>TARGET: STRONG FEMALE ATHLETE / CROSSFIT BUILD. Strictly retain FEMININE body structure. Defined abdominal muscles, strong toned female arms. ABSOLUTELY NO masculine chest, NO thick male neck. Deform clothing to fit a very muscular BIOLOGICAL WOMAN.</BODY_OVERRIDE>',
  'Брюнетка': '<HAIR_COLOR>Deep rich dark brunette brown female hair</HAIR_COLOR>',
  'Шатенка': '<HAIR_COLOR>Warm chestnut brown female hair</HAIR_COLOR>',
  'Блондинка': '<HAIR_COLOR>Bright golden blonde female hair</HAIR_COLOR>',
  'Рыжая': '<HAIR_COLOR>Vibrant copper ginger red female hair</HAIR_COLOR>',
  'Чёрные': '<HAIR_COLOR>Jet black female hair, pure dark</HAIR_COLOR>',
  'Седые': '<HAIR_COLOR>Elegant silver-gray white mature female hair</HAIR_COLOR>',
  'Короткие': '<HAIR_LENGTH>Chic short feminine haircut, pixie cut or short bob framing a female face.</HAIR_LENGTH>',
  'Средние': '<HAIR_LENGTH>Medium-length elegant female hair, reaching the collarbones.</HAIR_LENGTH>',
  'Длинные': '<HAIR_LENGTH>Long, beautiful flowing feminine hair cascading well past the chest.</HAIR_LENGTH>',
  'Бритая': '<HAIR_LENGTH>TARGET: COMPLETELY BALD FEMALE / SHAVED HEAD. Bare scalp on a biological woman. CRITICAL: Maintain highly elegant, delicate FEMININE facial bone structure and flawless makeup. Do NOT make her look masculine.</HAIR_LENGTH>',
  'Нейтральная': '<EXPRESSION>Calm, relaxed feminine face, soft neutral gaze, relaxed lips.</EXPRESSION>',
  'Лёгкая улыбка': '<EXPRESSION>Gentle, warm, inviting feminine smile, soft friendly eyes.</EXPRESSION>',
  'Серьёзная': '<EXPRESSION>Intense high-fashion editorial female look, striking feminine features, slight pout, no smile.</EXPRESSION>',
  'Уверенная': '<EXPRESSION>Powerful, confident woman, chin slightly raised, commanding gaze.</EXPRESSION>',
  'Дерзкая': '<EXPRESSION>Fierce femme-fatale attitude, seductive or playful smirk, bold confident female energy.</EXPRESSION>',
  'Уши': '<PIERCING>MANDATORY RENDER: Shiny metallic earrings clearly visible in the woman\'s earlobes.</PIERCING>',
  'Нос': '<PIERCING>MANDATORY RENDER: Delicate female nose ring/stud piercing clearly visible on her nostril.</PIERCING>',
  'Уши + Нос': '<PIERCING>MANDATORY RENDER: Feminine earrings AND a delicate nostril nose ring clearly visible.</PIERCING>',
  'Минимализм': '<TATTOO>MANDATORY RENDER: Elegant minimalist fine-line black ink tattoos visible on exposed female skin.</TATTOO>',
  'Рукав': '<TATTOO>MANDATORY RENDER: Detailed artistic tattoo sleeve fully covering one of the woman\'s arms.</TATTOO>',
  'Шея': '<TATTOO>MANDATORY RENDER: Prominent artistic dark ink tattoo strictly located on the woman\'s neck/throat area. Do NOT thicken the neck!</TATTOO>',
};

const DICT_MALE = {
  'Худощавое': '<BODY_OVERRIDE>TARGET: LEAN/SLIM MALE. Lanky boyish build, narrow shoulders, thin masculine arms, low body fat. Force clothing to drape loosely on a thin male frame.</BODY_OVERRIDE>',
  'Спортивное': '<BODY_OVERRIDE>TARGET: FIT ATHLETIC MALE. Gym-goer / swimmer physique, defined masculine chest and arms, flat core, broad shoulders. Reshape clothing to highlight athletic male contours.</BODY_OVERRIDE>',
  'Среднее': '<BODY_OVERRIDE>TARGET: AVERAGE MALE. Standard everyday male body, regular build, healthy proportions.</BODY_OVERRIDE>',
  'Полное': '<BODY_OVERRIDE>TARGET: HEAVY-SET MALE. Stocky, large male frame, broad thick waist, visible belly, thick arms. Expand clothing heavily to fit a large male figure (XXL).</BODY_OVERRIDE>',
  'Мускулистое': '<BODY_OVERRIDE>TARGET: HYPER-MUSCULAR MALE BODYBUILDER. Massive masculine build. Hyper-defined biceps, broad powerful shoulders (V-taper), thick masculine neck, heavy chest muscles. Stretch clothing extremely tightly across massive male muscles.</BODY_OVERRIDE>',
  'Брюнет': '<HAIR_COLOR>Deep rich dark brunette brown male hair</HAIR_COLOR>',
  'Шатен': '<HAIR_COLOR>Warm chestnut brown male hair</HAIR_COLOR>',
  'Блондин': '<HAIR_COLOR>Bright golden blonde male hair</HAIR_COLOR>',
  'Рыжий': '<HAIR_COLOR>Vibrant copper ginger red male hair</HAIR_COLOR>',
  'Чёрные': '<HAIR_COLOR>Jet black male hair, pure dark</HAIR_COLOR>',
  'Седые': '<HAIR_COLOR>Silver fox, sophisticated silver-gray white mature male hair</HAIR_COLOR>',
  'Короткие': '<HAIR_LENGTH>Classic short male haircut, neat fade or styled crop.</HAIR_LENGTH>',
  'Средние': '<HAIR_LENGTH>Medium-length male hair, stylish modern flow or surfer look.</HAIR_LENGTH>',
  'Длинные': '<HAIR_LENGTH>Long masculine hair, reaching shoulders, Viking or rockstar aesthetic.</HAIR_LENGTH>',
  'Бритый': '<HAIR_LENGTH>TARGET: COMPLETELY BALD MALE. Clean shaved masculine scalp, strong skull shape, sharp male jawline.</HAIR_LENGTH>',
  'Нейтральная': '<EXPRESSION>Calm, stoic masculine face, relaxed strong jaw, steady gaze.</EXPRESSION>',
  'Лёгкая улыбка': '<EXPRESSION>Approachable, friendly male smile, warm eyes.</EXPRESSION>',
  'Серьёзный': '<EXPRESSION>Intense, sharp masculine gaze, serious focused editorial look, furrowed brow.</EXPRESSION>',
  'Уверенный': '<EXPRESSION>Strong alpha presence, self-assured male expression, solid eye contact.</EXPRESSION>',
  'Дерзкий': '<EXPRESSION>Rebellious, edgy masculine attitude, defiant smirk, squinted challenging eyes.</EXPRESSION>',
  'Уши': '<PIERCING>MANDATORY RENDER: Shiny metallic stud/hoop earrings clearly visible in the man\'s earlobes.</PIERCING>',
  'Нос': '<PIERCING>MANDATORY RENDER: Masculine nose ring/stud piercing clearly visible on his nostril.</PIERCING>',
  'Уши + Нос': '<PIERCING>MANDATORY RENDER: Male earrings AND a nostril nose ring clearly visible.</PIERCING>',
  'Минимализм': '<TATTOO>MANDATORY RENDER: Sharp minimalist fine-line black ink tattoos visible on exposed male skin.</TATTOO>',
  'Рукав': '<TATTOO>MANDATORY RENDER: Dense, dark ink FULL TATTOO SLEEVE completely covering ONE ENTIRE ARM.</TATTOO>',
  'Шея': '<TATTOO>MANDATORY RENDER: Prominent artistic dark ink tattoo strictly located on the man\'s neck/throat area.</TATTOO>',
};

// ═══════════════════════════════════════════════════════════════════
// POSE LIBRARIES (50 female + 50 male)
// ═══════════════════════════════════════════════════════════════════
const FEMALE_POSES = [
  "Classic frontal stance, arms relaxed down with slight space between arms and torso to show garment shape.",
  "Weight shifted to one leg, natural soft hip curve, hands resting naturally at sides.",
  "Subtle 3/4 turn towards the camera, looking over the front shoulder, arms loose.",
  "Symmetrical standing, perfect posture, chin parallel to the floor, high fashion catalog look.",
  "Casual straight stance, feet shoulder-width apart, arms hanging with relaxed hands.",
  "One foot slightly forward, natural effortless posture, chest open and facing the lens.",
  "Delicate lean backward, weight on the back heel, front leg extended slightly.",
  "Soft A-frame stance, hands gently clasped behind the back to fully expose the front garment.",
  "Upright posture, slight tilt of the head, hands resting softly on upper thighs.",
  "Elegant simplicity, standing tall, shoulders completely relaxed, soft facial expression.",
  "One hand resting lightly on the waist, opposite arm straight down, confident look.",
  "Both hands placed gently on the hips, elbows pointing outward to create a strong silhouette.",
  "Thumbs hooked casually into front pockets, hands resting low to keep the shirt visible.",
  "One hand touching the lower hip/thigh, slight twist of the torso, dynamic catalog pose.",
  "Right hand on waist, left hand lightly touching the jawline, editorial attitude.",
  "Fingers loosely resting on the belt loops, shoulders dropped, effortless cool.",
  "One hand placed on the lower back to push the chest slightly forward, proud posture.",
  "Asymmetrical hip placement, one hand low on the waist, creating an hourglass shape.",
  "Subtle power pose, hands on waist but pulled back so the front of the garment is unobstructed.",
  "Casual frame, hands touching the side seams of the pants/skirt, looking straight.",
  "Mid-stride forward walk, right foot leading, natural arm swing capturing movement.",
  "Stepping confidently towards the camera, wind-blown aesthetic, fabric in motion.",
  "Dynamic step to the side, shifting weight sharply, creating diagonal energy.",
  "Mid-turn, body twisted sideways but face looking back at the camera over the shoulder.",
  "Striding forward rapidly, shoulders back, chin high, runway walk momentum.",
  "Light stepping motion, one heel lifted, floating and airy sensation.",
  "Stepping heavily on the front foot, leaning slightly into the motion, strong street-style walk.",
  "Walking away from the lens but upper torso completely turned to look back.",
  "Subtle swaying motion, weight shifting from left to right, capturing soft fabric drape.",
  "Action stance, stepping down as if descending a stair, dynamic angles.",
  "Avant-garde geometry, one shoulder raised, sharp collarbones, intense gaze.",
  "Dramatic lean, torso angled 45 degrees, face turned to the camera, arms dropped.",
  "One hand resting behind the neck, elbow pointing up, chest perfectly open and visible.",
  "High-fashion slouch, upper back slightly rounded, chin tucked, intense moody look.",
  "Asymmetrical arm placement, one arm extended slightly outward, creating negative space.",
  "Vogue cover pose, chin lifted high, one hand lightly touching the collarbone.",
  "Subtle torso twist, creating an S-curve, hands kept entirely out of the garment's way.",
  "Architectural stance, sharp angles with the body, leaning sideways into an invisible wall.",
  "Fashion drop, one shoulder aggressively dropped down, neck elongated.",
  "Elegant power, hands crossed but placed extremely low below the hips.",
  "Wide confident stance, feet apart, alpha female energy, intense straight gaze.",
  "Strong athletic ready-stance, slight knee bend, focused powerful presence.",
  "Urban attitude, leaning slightly forward, hands relaxed but body full of tension.",
  "Fists gently clenched by the sides, feet firmly planted, strong aesthetic.",
  "Power pose: chest pushed forward, shoulders rolled back, absolute dominance.",
  "One foot planted heavily forward, strong torso angle, rebellious attitude.",
  "Casual streetwear slouch, hands deep in front pockets, straight unbothered look.",
  "Wide stance, slightly squatting or low-angle lean, edgy urban posture.",
  "Looking directly into the lens with a fierce, challenging smirk, chest out.",
  "Standing perfectly tall, unshakeable confidence, commanding runway presence.",
];

const MALE_POSES = [
  "Strong upright stance, arms relaxed by the sides, shoulders squared to the camera.",
  "Weight shifted slightly to one leg, relaxed masculine posture, natural arms.",
  "Frontal view, feet shoulder-width apart, arms hanging straight down, classic catalog.",
  "Subtle 3/4 angle, face turned to the camera, strong jawline display, relaxed arms.",
  "Symmetrical stance, perfect posture, chest slightly open, professional male model look.",
  "Relaxed straight stand, subtle droop in one shoulder for an unposed feel.",
  "One foot slightly forward, arms detached from torso to clearly show garment fit.",
  "Frontal stance, chest relaxed, hands resting in back pockets, easygoing stance.",
  "Perfect vertical posture, chin parallel to the floor, neutral masculine grounding.",
  "Slight forward lean from the waist, engaging the camera directly, arms loose.",
  "Right hand fully in the pants pocket, left arm relaxed by the side, effortless casual look.",
  "Both hands resting lightly in front pockets, thumbs visible pointing inward.",
  "Left hand in pocket, right arm slightly bent, casual street-style leaning posture.",
  "One hand casually hooked onto the belt loop, weight on one leg, confident relaxed vibe.",
  "Both thumbs resting lightly in the front pockets, hands hanging loose, modern casual.",
  "Hands resting on hips but positioned low near the belt line, strong casual stance.",
  "One hand in pocket, the other hand adjusting the opposite cuff or watch.",
  "Casual slouch, one hand in pocket, shoulders relaxed forward, urban aesthetic.",
  "Both hands deep in pockets, slight lean back, confident and effortlessly stylish.",
  "Hands resting in back pockets, chest pushed forward, extremely relaxed weekend vibe.",
  "Mid-stride confident walk, right foot forward, natural masculine arm swing.",
  "Urban street walk, stepping directly towards the camera, intense focused gaze.",
  "Walking casually, looking off to the side, one hand swinging, dynamic fabric movement.",
  "Stepping heavily forward, strong momentum, wide shoulders, commanding presence.",
  "Looking back over the shoulder while mid-stride away from the camera, dynamic turn.",
  "Fast paced walk, slight lean forward, energetic and modern city vibe.",
  "Walking posture with one hand sliding into a pocket, capturing mid-movement flow.",
  "Slightly elevated step, representing walking up stairs or uneven ground, active look.",
  "Striding with purpose, both arms swinging naturally, chest leading the movement.",
  "Urban motion, stopping mid-step, shifting weight backward, highly dynamic tension.",
  "High fashion male pose, subtle torso twist, strong neck, angular and sharp posture.",
  "One hand touching the back of the neck, elbow raised, highly editorial framing.",
  "Slight lean to the side as if resting on an invisible wall, relaxed but striking.",
  "Shoulder dropped, chin raised slightly, arrogant high-fashion editorial look.",
  "Hands gently clasped in front of the lower waist, highly formal and composed.",
  "Tilted head, intense eye contact, body turned slightly, emphasizing the jaw and shoulders.",
  "Leaning forward slightly, looking up from under the brow, intense moody editorial.",
  "Hands rubbing together slowly, elbows slightly out, sophisticated dynamic tension.",
  "Adjusting the collar or tie, sharp focused look, classic menswear editorial.",
  "One hand resting on the chin/jawline, the thinker pose, highly intellectual and sharp.",
  "Wide dominant stance, arms crossed firmly over the lower chest, kept low to show clothing.",
  "Strong athletic ready position, wide feet, slight knee bend, intense alpha focus.",
  "Legs wide apart, fists slightly clenched by the hips, exuding raw power and strength.",
  "Power pose: chest pushed forward, broad shoulders expanded, looking down slightly.",
  "One foot heavily forward, leaning into the stance, aggressive and confident posture.",
  "Athletic rest pose, hands on hips, chest expanding, heavy breath look.",
  "Arms folded loosely, dominant posture, unshakeable solid grounding.",
  "Standing extremely tall, military-like straight posture, commanding alpha presence.",
  "Flexing subtly, arms slightly bent, emphasizing arm and shoulder definition.",
  "Legs wide, hands resting on upper thighs, slightly leaning forward, fierce masculine dominance.",
];

// ═══════════════════════════════════════════════════════════════════
// BIOMETRIC NOISE + POSE SELECTOR
// ═══════════════════════════════════════════════════════════════════
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

function detectGender(modelPreset) {
  if (!modelPreset) return 'female';
  const lower = modelPreset.toLowerCase();
  if (/\b(male|мужск|славянин|азиат\b|европеец|африканец|латиноамериканец)\b/i.test(lower)) return 'male';
  return 'female';
}

function selectPoseFromSeed(seed, gender) {
  const poses = gender === 'male' ? MALE_POSES : FEMALE_POSES;
  const numericSeed = Math.abs(parseInt(seed, 36)) || Math.floor(Math.random() * 100000);
  return poses[numericSeed % poses.length];
}

function buildGenderLock(gender) {
  return gender === 'male'
    ? '<GENDER_LOCK>BIOLOGICAL MALE. You MUST strictly enforce male anatomy, masculine bone structure, masculine hands with wider knuckles, and male features. The model is a MAN.</GENDER_LOCK>'
    : '<GENDER_LOCK>BIOLOGICAL FEMALE. You MUST strictly enforce 100% biological female anatomy: female breast contour, narrow waist, highly feminine facial features, DELICATE FEMININE HANDS (slender fingers, narrow wrists, soft skin, NO masculine knuckles or veins), and elegant feminine posture. Under NO circumstances should ANY body part — especially hands and arms — look masculine, even if she is muscular or bald. Every visible limb must read as unmistakably female.</GENDER_LOCK>';
}

// ═══════════════════════════════════════════════════════════════════
// SKIN RENDER MODES
// ═══════════════════════════════════════════════════════════════════
const SKIN_BEAUTY_PROMPT = `<RENDER_PIPELINE>
MODE: HIGH-END BEAUTY FASHION EDITORIAL.
DIRECTIVE: Apply high-end commercial fashion retouching. Flawless, perfectly smooth, airbrushed skin. Glowing complexion, perfectly even skin tone, soft flattering studio lighting. Idealized model features.
</RENDER_PIPELINE>`;

// ═══════════════════════════════════════════════════════════════════
// ATTRIBUTE DIRECTIVE BUILDER (gender-aware)
// ═══════════════════════════════════════════════════════════════════
function buildAttributeDirectives(attributes, gender) {
  if (!attributes || typeof attributes !== 'object') return '';
  const dict = gender === 'male' ? DICT_MALE : DICT_FEMALE;
  const directives = [];
  Object.entries(attributes).forEach(([key, val]) => {
    if (!val) return;
    if (val === 'Нет' || (Array.isArray(val) && val.length === 1 && val[0] === 'Нет')) {
      if (key === 'tattoo') directives.push('<TATTOO_CONSTRAINT>ABSOLUTELY NO TATTOOS. Completely pure, clean, unblemished skin. Zero ink anywhere.</TATTOO_CONSTRAINT>');
      if (key === 'piercing') directives.push('<PIERCING_CONSTRAINT>ABSOLUTELY NO PIERCINGS. Clean unadorned face and ears, zero metal.</PIERCING_CONSTRAINT>');
      return;
    }
    if (Array.isArray(val)) {
      val.filter(x => x !== 'Нет').forEach(item => { if (dict[item]) directives.push(dict[item]); });
    } else {
      if (dict[val]) directives.push(dict[val]);
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
async function sanitizeGarmentImage(imageBase64, index) {
  // Sanitization skipped — nano-banana-2 handles garment reference via text prompt.
  // Direct image editing requires separate model which is deprecated.
  console.log(`   ℹ️ Garment ${index + 1}: sanitization skipped (using direct reference)`);
  return imageBase64;
}

// ═══════════════════════════════════════════════════════════════════
// PRODUCT MODE — XML-тегированная система промптов для предметной съемки
// Аналог Fashion Mode cognitive_override, но с ОБРАТНОЙ логикой:
// "Исходный товар = Sacred Blueprint, заморозь его пиксели 1:1"
// ═══════════════════════════════════════════════════════════════════

const CATEGORY_CONFIGS = {
  cosmetics: {
    materials: `<material_rendering_directive>
- SURFACES: High-fidelity separation between frosted glass, matte soft-touch plastics, and glossy acrylics.
- VOLUMETRICS: Apply Subsurface Scattering (SSS) to semi-translucent creams, serums, and liquids for a natural, premium organic glow.
- LABELS: Maintain crisp, perfectly flat typography and brand logos. Zero perspective warping or distortion on the text.
- REFLECTIONS: Smooth, continuous specular highlights on cylindrical and curved edges.
</material_rendering_directive>`,
    lighting: `<lighting_protocol>
- STYLE: High-end softbox beauty lighting.
- SETUP: Large diffused overhead modifiers and strip-lights.
- GOAL: Clean, luminous shadows. Fill lights must ensure the front label is perfectly lit and 100% legible. Zero harsh or distracting drop-shadows on the product face.
</lighting_protocol>`
  },

  // 'fragrance' matches presets.js ID (Deep Think used 'perfume')
  fragrance: {
    materials: `<material_rendering_directive>
- REFRACTION & OPTICS: Accurate Index of Refraction (IOR) for heavy crystal glass and perfume liquid. Generate realistic optical distortion and internal reflections.
- METALS: Heavy polished metallic atomizers, collars, and caps must reflect the surrounding environment cleanly with high contrast.
- FLUIDS: Simulate volumetric light transmission and subtle chromatic aberration through the liquid.
</material_rendering_directive>`,
    lighting: `<lighting_protocol>
- STYLE: Luxury cinematic lighting.
- SETUP: Strong directional backlighting or side-lighting to illuminate the liquid from within, making it glow.
- FX: Intense, realistic glass and liquid caustics projected onto the resting surface.
- LENS: Heavy, creamy cinematic bokeh (shallow depth of field) in the background to isolate the tack-sharp product in the foreground.
</lighting_protocol>`
  },

  jewelry: {
    materials: `<material_rendering_directive>
- METALS: Flawless metallic surface rendering (Gold/Silver/Platinum/Rose Gold). Anisotropic reflections for brushed metals, pure mirror-like speculars for polished metals.
- GEMSTONES: Physically accurate light dispersion (diamond fire), internal ray-traced refractions, multi-faceted brilliance, and prism effects.
- MICRO-DETAILS: Extreme macro resolution. Hallmarks, intricate engravings, and prongs must have razor-sharp micro-contrast. Zero melting of small metal links.
</material_rendering_directive>`,
    lighting: `<lighting_protocol>
- STYLE: Extreme macro dramatic studio lighting.
- SETUP: Pinpoint LED spot lights directly aimed at gemstones to trigger maximum sparkle and sharp caustics.
- GOAL: Use simulated black and white bounce reflection cards around the product to create deep, striking edge gradients on metal curves. Focus stacking simulation (entire piece is 100% sharp).
</lighting_protocol>`
  },

  // ── Full CGI configs from Deep Think Parts 1-3 ──
  supplements: {
    materials: `<material_rendering_directive>
- PLASTICS & SURFACES: Render medical-grade plastics with distinct PBR properties: high-gloss reflections for PET, light-absorbing soft-touch for matte HDPE bottles.
- TYPOGRAPHY & LABELS: Extreme crispness protocol. Nutritional facts, barcodes, and logos must maintain razor-sharp vector-like precision with zero AI bleeding or distortion.
- CONTENTS: If visible, apply realistic gelatin semi-translucency with Subsurface Scattering (SSS) for capsules, and dry, granular micro-textures for organic powders.
- PURITY: Maintain absolute clinical hygiene. Flawless surface rendering with zero dust, smudges, or organic imperfections.
</material_rendering_directive>`,
    lighting: `<lighting_protocol>
- STYLE: Clinical, trustworthy, high-key commercial studio lighting (5000K-5500K).
- SETUP: Massive overhead diffusion panels and broad wrap-around fill light.
- GOAL: Eliminate deep shadows. Establish a pure, airy, shadowless medical aesthetic that conveys premium health standards and safety.
</lighting_protocol>`
  },

  decor_candles: {
    materials: `<material_rendering_directive>
- WAX VOLUMETRICS: Apply deep Subsurface Scattering (SSS) to soy, beeswax, or paraffin wax. The wax must exhibit organic depth and milky semi-translucency, absorbing and scattering light near the flame.
- FLAME & WICK: Render charred micro-details on the braided cotton/wood wick. The flame must have a structurally accurate hot core with localized volumetric light emission.
- VESSELS: High-fidelity IOR for heavy glass jars, organic micro-porosity for unglazed ceramics, and anisotropic reflections for brushed metal lids.
- STRUCTURAL INTEGRITY: Maintain perfect circular geometry of the jar lip. Zero melting of the container's structural shape into the wax.
</material_rendering_directive>`,
    lighting: `<lighting_protocol>
- STYLE: Intimate, moody, and cozy atmospheric ambient lighting.
- COLOR TEMP: Warm incandescent and candlelight (2700K-3000K).
- FX: Soft volumetric glow radiating from the flame, casting warm ambient bounce light onto surrounding textures. Soft, elongated drop-shadows with a natural warm fall-off.
</lighting_protocol>`
  },

  electronics: {
    materials: `<material_rendering_directive>
- HARD SURFACE GEOMETRY: Strict hard surface CGI rendering. Absolute mathematical precision. Zero distortion, bending, or organic melting of parallel lines, bezels, and sharp geometric corners.
- TEXTURES: High-resolution PBR micro-bump mapping for accessories (matte friction-grip silicone, porous full-grain leather, woven carbon fiber, or rugged polycarbonate).
- REFLECTIONS: Perfect planar mirror-like reflection mapping on glossy glass screens. Smooth, continuous anisotropic gradients on machined aluminum or steel edges.
- SCREENS & LENSES: If visible, render with perfect pixel-grid simulation, OLED backlight emission, zero UI glare, and perfectly circular, pristine camera lenses.
</material_rendering_directive>`,
    lighting: `<lighting_protocol>
- STYLE: Premium, cool-toned futuristic tech studio lighting (5000K-6500K).
- SETUP: Precision gradient light modifiers (long strip softboxes) casting smooth, continuous zebra-stripe reflections across flat surfaces and glossy panels.
- EDGES: Intense, sharp accent rim lights to brilliantly define the product's silhouette, trace edge chamfers, and separate the device from the background.
</lighting_protocol>`
  },

  pet_supplies: {
    materials: `<material_rendering_directive>
- TEXTURE & TACTILITY: High-fidelity micro-textures. Render plush fabrics with distinct soft fibers. Emphasize high-friction matte or glossy surfaces for rubber/silicone chew toys.
- PACKAGING: Preserve ultra-clean, vibrant, and cheerful vector illustrations. Zero AI bleeding, smudging, or text distortion on packaging.
- CONTENTS: If pet food/treats are visible, render realistic porous baked kibble micro-textures or natural organic meat grains. Zero plastic sheen on food.
- PLASTICS: Safe, smooth, non-toxic pet-grade plastic rendering with clean specular highlights.
</material_rendering_directive>`,
    lighting: `<lighting_protocol>
- STYLE: Cheerful, bright, uplifting commercial lifestyle lighting.
- COLOR TEMP: Warm, friendly, and sunny daylight (4000K).
- SETUP: Broad diffused softbox illumination with bright fill lights to eliminate harsh or dramatic shadows.
- GOAL: Create a positive, safe, and approachable atmosphere.
</lighting_protocol>`
  },

  stationery: {
    materials: `<material_rendering_directive>
- PAPER & CARDBOARD: Authentic paper fiber micro-grain. Differentiate paper thickness (GSM) and render precise, razor-sharp edges for layered pages.
- LEATHER & BINDING: High-resolution bump mapping for full-grain or faux leather covers. Crisp, perfect geometric stitching and highly precise foil debossing/embossing.
- HARDWARE: Physically accurate metallic reflections on binder rings, clips, and zippers (brushed brass, polished chrome, matte black).
- INK & WRITING: Absolute vector-precision for printed lines, grids, and typography.
</material_rendering_directive>`,
    lighting: `<lighting_protocol>
- STYLE: Clean, minimal, airy natural workspace daylight (Flat lay optimized).
- COLOR TEMP: Pure overcast daylight (5500K).
- SETUP: Large overhead softbox simulating massive window light.
- GOAL: Extremely soft, short drop-shadows. Maintain even illumination across the flat lay without muddying the composition with deep contrast.
</lighting_protocol>`
  },

  food: {
    materials: `<material_rendering_directive>
- FOOD STYLING PBR: Maximize appetite appeal. Render rich specular gloss for viscous liquids (honey/syrup), tempered satin sheen for chocolate, and organic porous roughness for nuts/baked goods.
- FRESHNESS & FX: Apply photorealistic condensation droplets with accurate IOR on cold surfaces, and volumetric ray-traced steam/vapor for hot items.
- PACKAGING: Distinct tactile fidelity for raw fibrous kraft paper, crinkly foil, transparent glass, or food-safe plastics.
- HERO INGREDIENTS: Companion ingredients must look plump, vibrant, and organically fresh with natural subsurface scattering on fruits and leaves.
</material_rendering_directive>`,
    lighting: `<lighting_protocol>
- STYLE: High-end commercial food styling lighting with a golden hour feel.
- COLOR TEMP: Warm, appetizing, and inviting hero light (3500K-4000K).
- SETUP: Strong directional backlight (kicker) to reveal translucency in liquids/leaves, enhance micro-textures, and naturally illuminate steam.
- FILL: Bright simulated bounce cards from below to eliminate muddy "dead" shadows and maintain vibrant color purity.
</lighting_protocol>`
  },

  sports: {
    materials: `<material_rendering_directive>
- TECHNICAL MATERIALS: Strict PBR rendering of athletic gear. Matte stretch porosity for neoprene, cellular macro-texture for EVA foam, and tight woven patterns for nylon straps.
- GRIP & HARDWARE: Deep, mathematically perfect tactile friction patterns on rubber grips and treads. Anisotropic reflections on machined aluminum or brushed steel buckles.
- STRUCTURAL INTEGRITY: Zero organic melting. Equipment must look highly tensioned, robust, and structurally sound. Perfect geometric cylinders for weights/bars.
</material_rendering_directive>`,
    lighting: `<lighting_protocol>
- STYLE: High-contrast, dynamic, energetic athletic studio lighting.
- COLOR TEMP: Cool, intense key light (5000K) paired with a contrasting warm fill or rim light.
- SETUP: Hard directional edge/rim lighting (kickers) to deeply carve out grip textures, woven fabrics, and metallic edges. Dynamic angle.
- GOAL: Dramatic, moody background falloff with sharp shadows to emphasize action, strength, and premium performance.
</lighting_protocol>`
  },

  // Фолбэк для неизвестных категорий
  default: {
    materials: `<material_rendering_directive>
- SURFACES: Physically accurate PBR materials based on the original image.
- DETAILS: Maintain correct surface roughness, specularity, and exact color preservation.
</material_rendering_directive>`,
    lighting: `<lighting_protocol>
- STYLE: Professional E-commerce Studio Lighting.
- SETUP: Balanced softbox lighting. Clear shadows to ground the object, crisp highlights to define shape.
</lighting_protocol>`
  }
};

/**
 * Собирает полный XML-промпт для предметной фотосъемки товаров
 * Аналог buildMasterPrompt() для Fashion Mode, но с обратной логикой
 */
function buildProductPrompt({
  categoryId,
  productPrompt,
  compositionPrompt,
  bgPrompt,
  effectPrompt = '',
  aspectRatio = '1:1',
  withHumanModel = false,
  humanModelPrompt = '',
  isBeautyMode = false
}) {
  const category = CATEGORY_CONFIGS[categoryId] || CATEGORY_CONFIGS.default;

  // Блок модели-человека: когда продавец хочет показать товар вместе с живой моделью
  const humanModelBlock = withHumanModel && humanModelPrompt ? `
<human_model_integration>
CRITICAL DUAL-SUBJECT PROTOCOL:
This shot contains TWO subjects: the PRODUCT and a LIVING HUMAN MODEL.

HUMAN MODEL PROFILE: "${humanModelPrompt}"
- Generate a photorealistic living human model matching the profile above.
- The model must naturally interact with the product: holding it, demonstrating it, using it, or presenting it.
- The PRODUCT remains the HERO — the model is the SUPPORTING ACTOR. The product must be clearly visible, unobstructed, and prominently featured.
- Do NOT let the model's hands, arms, or body obscure the product label, brand, or key visual features.

${isBeautyMode ? SKIN_BEAUTY_PROMPT : SKIN_REALISM_PROMPT}

INTERACTION STYLE:
- For cosmetics/skincare: model applies or holds the product near the face/hands, showing glowing skin.
- For electronics/cases: model holds the device naturally, showing the product in real-world context.
- For food/beverages: model enjoys or presents the product, creating appetite appeal.
- For sports gear: model demonstrates athletic use of the product in an active pose.
- For jewelry: extreme close-up of the product ON the model's body (wrist, neck, ear, finger).
- For supplements: model holds the container confidently, health-conscious lifestyle vibe.
- Default: model holds and presents the product at chest level, making eye contact with camera.
</human_model_integration>
` : '';


  return `<system_directive>
ROLE: Elite Commercial Product Photographer, Master CGI Compositor & Material Specialist.
TASK: ${withHumanModel ? '1:1 Product-to-Scene integration with a living human model demonstrating the product.' : '1:1 Product-to-Scene integration with photorealistic rendering.'}
</system_directive>

<product_identity_lock>
CRITICAL PROTOCOL: The input image is the ABSOLUTE TRUTH ("Sacred Blueprint").
- PRESERVE 1:1: Exact physical geometry, silhouette, scale, and physical proportions.
- PRESERVE 1:1: Brand colors, label layout, typography, barcode, and logo placement.
- PRODUCT DESCRIPTION: ${productPrompt}
</product_identity_lock>

<zero_invention_products>
RESTRICTION PROTOCOL: ZERO INVENTION.
- DO NOT hallucinate, morph, or invent new structural elements.
- DO NOT add fake caps, nozzles, lids, ribbons, or dispensing mechanisms.
- DO NOT hallucinate fake text, typos, or AI squiggles on labels.
- ZERO morphing or blending between the product and the environment. The product is a solid, separate physical object.
</zero_invention_products>

${category.materials.trim()}

${category.lighting.trim()}

${humanModelBlock}

<scene_composition>
  - PLACEMENT & STAGING: ${compositionPrompt}
  - ENVIRONMENT & BACKGROUND: ${bgPrompt}
  - SPECIAL EFFECTS: ${effectPrompt || 'None'}
  - ASPECT RATIO TARGET: ${aspectRatio}
  - CAMERA LENS: 85mm-100mm macro/portrait lens. Commercial photography framing.
  - INTEGRATION: Ground the product naturally onto the surface with accurate contact shadows, ambient occlusion, and bounced environmental light. Do NOT let the product float.
</scene_composition>

<output_rules>
- The final image must be INDISTINGUISHABLE from a real professional product photograph.
- No watermarks, no text overlays, no separate product shots.
- OUTPUT FORMAT: You MUST output ONLY a generated IMAGE. Do NOT output text. Do NOT describe the image. Generate the photo directly as pixel data.
</output_rules>`;
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
      garmentImageUrls = [],
      modelReferenceImages,
      locationImages,
      customPoseText,
      previewMode,
      isCalibration = false,
      isPhotoEdit = false,
      sourceImageBase64,
      sourceImageUrl,
      editInstruction,
      attributes,
      isBeautyMode = false,
      biometricSeed,
      isProductMode = false,
      categoryId = 'default',
      withHumanModel = false,
      humanModelPrompt = '',
      humanModelRefImages,
      isCardDesign = false,
      cardStyle = 'natural',
    } = req.body;

    // ═══ PHOTO EDIT MODE — precise, non-destructive editing ═══
    // Sends the EXISTING photo + edit instruction to Gemini.
    // Does NOT regenerate from scratch — only modifies what the user asked for.
    if (isPhotoEdit && editInstruction) {
      console.log(`✏️ [${new Date().toISOString()}] Photo Edit: "${editInstruction}"`);
      try {
        // Get source image data
        let sourceData = null;
        if (sourceImageUrl) {
          sourceData = await downloadToBase64(sourceImageUrl);
        } else if (sourceImageBase64) {
          const { mimeType, base64str } = extractBase64(sourceImageBase64);
          sourceData = { mimeType, base64str };
        }
        if (!sourceData) {
          return res.status(200).json({ success: false, error: 'Нет исходного изображения для редактирования.' });
        }

        console.log(`✏️ Source image: ${sourceData.mimeType}, ${Math.round(sourceData.base64str.length / 1024)}KB base64`);

        const editPrompt = `PHOTO EDITING MODE — NON-DESTRUCTIVE RETOUCHING.

You are receiving an existing photograph. Your ONLY job is to make ONE specific modification to it.

EDIT REQUESTED: "${editInstruction}"

ABSOLUTE REQUIREMENTS:
- DO NOT regenerate, recreate, or reimagine this image.
- DO NOT change the person's identity, face shape, body shape, skin color, hair, clothing, or pose.
- DO NOT change the background, lighting, camera angle, or composition.
- DO NOT add or remove anything that was NOT explicitly requested.
- The output image MUST be visually identical to the input image in every way EXCEPT for the specific edit requested.
- Treat this as Photoshop-level retouching: precise, surgical, minimal.
- If asked to "add a smile": change ONLY the mouth area. Everything else stays pixel-identical.
- If asked to "remove tattoo": blend ONLY the tattoo area with surrounding skin. Nothing else changes.

Return ONLY the edited photograph.`;

        const resultUrl = await executeKieTask(editPrompt, [`data:${sourceData.mimeType};base64,${sourceData.base64str}`], 'nano-banana-2');
        console.log(`✅ [${((Date.now() - startTime) / 1000).toFixed(1)}s] Photo edit complete. Downloading result...`);
        const dl = await downloadToBase64(resultUrl);
        if (!dl) throw new Error("Failed to download edited image");
        
        return res.status(200).json({ success: true, imageBase64: `data:${dl.mimeType};base64,${dl.base64str}`, imageUrl: resultUrl });
      } catch (editError) {
        console.error(`❌ Photo edit error:`, editError.message);
        return res.status(200).json({ success: false, error: `Ошибка редактирования: ${editError.message}` });
      }
    }

    // ═══ GARMENT SOURCE RESOLUTION ═══
    // Handles: Firebase Storage URLs, base64 data URLs (fallback), legacy fields
    let garmentImages = [];
    if (garmentImageUrls.length > 0) {
      console.log(`☁️ Processing ${garmentImageUrls.length} garment source(s)...`);
      const processed = await Promise.all(garmentImageUrls.map(async (url) => {
        if (url.startsWith('data:')) {
          // Already a base64 data URL — use directly (fallback mode when Storage is down)
          console.log('  📎 Using base64 data URL directly (Storage fallback)');
          return url;
        }
        // Firebase Storage URL — download server-side
        const dl = await downloadToBase64(url);
        return dl ? `data:${dl.mimeType};base64,${dl.base64str}` : null;
      }));
      garmentImages = processed.filter(Boolean);
      console.log(`☁️ Resolved ${garmentImages.length}/${garmentImageUrls.length} garment(s) successfully`);
    } else if (garmentImagesBase64.length > 0) {
      garmentImages = garmentImagesBase64;
    } else if (garmentImageBase64) {
      garmentImages = [garmentImageBase64];
    }
    
    console.log(`🚀 [${new Date().toISOString()}] Запрос: calibration=${isCalibration}, garments=${garmentImages.length}, refs=${modelReferenceImages?.length || 0}, edit=${editInstruction || 'none'}, beauty=${isBeautyMode}, source=${garmentImageUrls.length > 0 ? 'URLs' : 'base64'}`);

    // Detect gender from model preset text
    const gender = detectGender(modelPreset);

    // Build XML attribute directives from structured selections (gender-aware)
    const attrDirectives = buildAttributeDirectives(attributes, gender);
    const bioNoise = getBiometricNoise(biometricSeed);
    const skinPrompt = isBeautyMode ? SKIN_BEAUTY_PROMPT : SKIN_REALISM_PROMPT;
    const genderLock = buildGenderLock(gender);
    const selectedPose = selectPoseFromSeed(biometricSeed, gender);

    const enhancedActorProfile = enhanceBodyMetrics(modelPreset, editInstruction);



    if (isCalibration) {
      const calibPrompt = buildMasterPrompt({
        modelPreset: enhancedActorProfile, posePreset: customPoseText || posePreset, cameraAngle, backgroundPreset, aspectRatio,
        hasMultipleGarments: false, hasModelRef: !!(modelReferenceImages && modelReferenceImages.length), isCalibration: true
      });
      let imageInputs = [];
      if (modelReferenceImages && Array.isArray(modelReferenceImages) && modelReferenceImages.length > 0) {
        for (const img of modelReferenceImages.slice(0, 5)) {
          if (!img) continue;
          if (img.startsWith('data:')) { imageInputs.push(img); }
          else if (img.startsWith('http')) { 
            const dl = await downloadToBase64(img); 
            if (dl) imageInputs.push(`data:${dl.mimeType};base64,${dl.base64str}`); 
          }
        }
      }
      console.log(`⏳ [${((Date.now() - startTime) / 1000).toFixed(1)}s] Отправляем калибровку в KIE.ai...`);
      const resultUrl = await executeKieTask(calibPrompt, imageInputs, 'nano-banana-2');
      console.log(`✅ [${((Date.now() - startTime) / 1000).toFixed(1)}s] Калибровка успешна. Downloading result...`);
      const dl = await downloadToBase64(resultUrl);
      if (!dl) throw new Error("Failed to download generated image");
      return res.status(200).json({ success: true, imageBase64: `data:${dl.mimeType};base64,${dl.base64str}`, imageUrl: resultUrl });
    }

    // ═══ CARD DESIGN MODE — маркетплейсная карточка товара ═══
    if (isCardDesign) {
      const elapsed = () => ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`🎴 [${elapsed()}s] Card Design: style=${cardStyle}, source=${sourceImageUrl ? 'url' : sourceImageBase64 ? 'base64' : 'garment'}`);
      try {
        let cardImageInputs = [];
        if (sourceImageUrl) {
          const dl = await downloadToBase64(sourceImageUrl);
          if (dl) cardImageInputs.push(`data:${dl.mimeType};base64,${dl.base64str}`);
        } else if (sourceImageBase64) {
          cardImageInputs.push(sourceImageBase64.startsWith('data:') ? sourceImageBase64 : `data:image/jpeg;base64,${sourceImageBase64}`);
        } else if (garmentImages && garmentImages.length > 0) {
          for (const img of garmentImages.slice(0, 1)) {
            if (img.startsWith('data:')) { cardImageInputs.push(img); }
            else if (img.startsWith('http')) {
              const result = await downloadToBase64(img);
              if (result) cardImageInputs.push(`data:${result.mimeType};base64,${result.base64str}`);
            }
          }
        }
        if (cardImageInputs.length === 0) {
          return res.status(200).json({ success: false, error: 'Нет исходного фото для создания карточки.' });
        }

        const EPIC_CARD_PROMPT = `ROLE: Elite Russian E-commerce Art Director (Wildberries/Ozon).
TASK: Transform this product photo into a COMPLETE marketplace card design.
STYLE: EPIC — Dark cinematic. Deep background (#1a1a2e to #16213e gradient). Gold/amber accent typography.
LAYOUT: Product photo dominant center-right (60% width). Left column for text.
TEXT (ALL IN RUSSIAN — generate realistic text based on the product you see):
  - Top-left badge: discount pill (example: -30%)
  - Brand/category label: small gold caps
  - Product name: 2-3 word bold headline in white
  - 3 benefit bullets with gold checkmarks
  - Price block: current price large + strikethrough old price
  - CTA button: gold pill "Купить"
  - Rating: gold stars + review count
OUTPUT: A COMPLETE, FINISHED card design image. ALL text in RUSSIAN. NO placeholder text. Generate realistic product name and benefits from the actual product visible in the photo.`;

        const NATURAL_CARD_PROMPT = `ROLE: Elite Russian E-commerce Art Director (Wildberries/Ozon).
TASK: Transform this product photo into a COMPLETE marketplace card design.
STYLE: NATURAL — Clean, premium lifestyle. Soft cream/warm white background (#faf8f5). Elegant dark typography.
LAYOUT: Product photo right/center (55-60% of card). Text area left/above with generous white space.
TEXT (ALL IN RUSSIAN — generate realistic text based on the product you see):
  - Brand label: thin sans-serif, warm gray, top
  - Product name: 2-3 word elegant headline, near-black
  - Tagline: one poetic benefit sentence, italic warm gray
  - 3 feature bullets with minimal dot icons
  - Price: clean style, dark charcoal
  - CTA: "Подробнее" underlined or minimal outlined button
OUTPUT: A COMPLETE, FINISHED card design image. ALL text in RUSSIAN. NO placeholder text. Generate realistic product name and benefits from the actual product visible in the photo.`;

        const cardPrompt = cardStyle === 'epic' ? EPIC_CARD_PROMPT : NATURAL_CARD_PROMPT;

        console.log(`🎴 [${elapsed()}s] Sending to KIE.ai nano-banana-2...`);
        const resultUrl = await executeKieTask(cardPrompt, cardImageInputs, 'nano-banana-2');
        console.log(`✅ [${elapsed()}s] Card design ready. Downloading...`);
        const dl = await downloadToBase64(resultUrl);
        if (!dl) throw new Error('Failed to download card design from KIE.ai');

        incrementGlobalCounter('generationsCard').catch(() => {});
        saveGenerationLog({ userId: req.body?.userId, success: true, imageUrl: resultUrl, reqBody: req.body, durationMs: Date.now() - startTime }).catch(() => {});

        return res.status(200).json({ success: true, imageBase64: `data:${dl.mimeType};base64,${dl.base64str}`, imageUrl: resultUrl });
      } catch (cardErr) {
        console.error(`❌ Card Design error:`, cardErr.message);
        alertOnError(cardErr, `generate-image [card_design]`).catch(() => {});
        return res.status(200).json({ success: false, error: `Ошибка создания карточки: ${cardErr.message.substring(0, 200)}` });
      }
    }

    // ═══ PRODUCT MODE — предметная съемка товаров ═══
    // Использует buildProductPrompt() вместо fashion pipeline
    if (isProductMode) {

      console.log(`📦 [${((Date.now() - startTime) / 1000).toFixed(1)}s] Product Mode: category=${categoryId}, images=${garmentImages.length}, withModel=${withHumanModel}`);
      
      const effectPrompt = customPoseText || '';
      const productPromptText = buildProductPrompt({
        categoryId,
        productPrompt: modelPreset,
        compositionPrompt: posePreset,
        bgPrompt: backgroundPreset,
        effectPrompt,
        aspectRatio,
        withHumanModel,
        humanModelPrompt,
        isBeautyMode
      });

      let imageInputs = [];
      for (const img of garmentImages.slice(0, 9)) {
        imageInputs.push(img.startsWith('data:') ? img : `data:image/jpeg;base64,${extractBase64(img).base64str}`);
      }

      // Референсы модели-человека
      if (withHumanModel && humanModelRefImages && Array.isArray(humanModelRefImages) && humanModelRefImages.length > 0) {
        for (const img of humanModelRefImages.slice(0, 5)) {
          if (!img) continue;
          if (img.startsWith('data:')) { imageInputs.push(img); }
          else if (img.startsWith('http')) {
            const result = await downloadToBase64(img);
            if (result) imageInputs.push(`data:${result.mimeType};base64,${result.base64str}`);
          }
        }
      }

      // Поддержка локаций для товаров
      if (locationImages && Array.isArray(locationImages) && locationImages.length > 0) {
        for (const img of locationImages.slice(0, 5)) {
          if (img.startsWith('data:')) { imageInputs.push(img); }
          else if (img.startsWith('http')) {
            const result = await downloadToBase64(img);
            if (result) imageInputs.push(`data:${result.mimeType};base64,${result.base64str}`);
          }
        }
      }

      console.log(`⏳ [${((Date.now() - startTime) / 1000).toFixed(1)}s] Product Mode → KIE.ai (nano-banana-2), ${imageInputs.length} image(s), model=${withHumanModel}...`);
      const resultUrl = await executeKieTask(productPromptText, imageInputs, 'nano-banana-2');
      console.log(`✅ [${((Date.now() - startTime) / 1000).toFixed(1)}s] Product shot ready. Downloading...`);
      const dl = await downloadToBase64(resultUrl);
      if (!dl) throw new Error("Failed to download product image from KIE.ai");
      return res.status(200).json({ success: true, imageBase64: `data:${dl.mimeType};base64,${dl.base64str}`, imageUrl: resultUrl });
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
        garmentImages.map((img, i) => sanitizeGarmentImage(img, i))
      );
      console.log(`🧹 [${((Date.now() - startTime) / 1000).toFixed(1)}s] Sanitization complete`);
    }

    let promptText = `<system_directive>
ROLE: Elite Commercial Fashion Photographer and CGI Compositing Specialist.
TASK: Photorealistic Virtual Try-On (VTON) executing a flawless "Mannequin-to-Human" texture transfer.
METHODOLOGY: Strict adherence to structured SCHEMA parameters.
</system_directive>
${adaptiveBlock}
<input_modality_1>
SOURCE GARMENT REFERENCE:
Analyze the physical fabric, cut, color, and fit of the clothing in the attached images.
WARNING: Treat the entity currently wearing the clothing as an INVISIBLE, IRRELEVANT SCAFFOLD (Plastic Mannequin). Do NOT extract biometrics.
</input_modality_1>

<phase_1_semantic_masking>
Perform explicit semantic masking on the source garment reference.
1. ISOLATE the physical garment (fabric texture, weave, natural folds, exact color, branding, cut). Preserve 100% PHYSICAL REALITY.
2. DE-ANCHOR THE IDENTITY. Completely discard all anatomical features, body mass, skin tones, and the facial structure/void of the source wearer.
${multiGarmentNote}
</phase_1_semantic_masking>

<phase_2_subject_recasting>
Generate a completely novel, living human actor to wear the isolated garment.
${genderLock}
SUBJECT GEOMETRY & TRAITS (CRITICAL): "${enhancedActorProfile}"
- You MUST enforce a totally new biometric generation matching ONLY the traits above.
${modelInstruction}
${bioNoise ? `<BIOMETRIC_SEED>UID-${biometricSeed}. Unique facial micro-features for this generation: ${bioNoise}. Use these to create a DISTINCTLY UNIQUE face that has never been generated before, while still matching the ethnic profile above.</BIOMETRIC_SEED>` : ''}
${attrDirectives ? `<APPLIED_CHARACTERISTICS>
${attrDirectives}
</APPLIED_CHARACTERISTICS>` : ''}
<POSE_AND_CAMERA_DIRECTIVE>
TARGET POSE: "${customPoseText || posePreset || selectedPose}"
IMPERATIVE RULES FOR POSE EXECUTION:
1. GARMENT VISIBILITY IS ABSOLUTE: Execute the target pose, but hands, arms, and accessories MUST NEVER completely cover or obscure the main design, logos, or chest/stomach area of the clothing. If the pose dictates crossed arms, place them loose and low.
2. FABRIC PHYSICS & GRAVITY: The clothing must dynamically adapt to this specific pose. Calculate realistic fabric tension, drape, stretching, and wrinkles based on the model's body angle and limb positioning.
3. EDITORIAL VIBE: The final image must look like a high-end fashion magazine lookbook. Break the flat "mannequin" syndrome entirely.
</POSE_AND_CAMERA_DIRECTIVE>
</phase_2_subject_recasting>
`;

    let imageInputs = [];
    for (const img of garmentImages.slice(0, 9)) {
       imageInputs.push(img.startsWith('data:') ? img : `data:image/jpeg;base64,${extractBase64(img).base64str}`);
    }

    if (modelReferenceImages && Array.isArray(modelReferenceImages) && modelReferenceImages.length > 0) {
      promptText += `\n<identity_reference>\nACTOR IDENTITY LOCK:\nThe generated person MUST closely resemble the REAL person in the attached reference photos. Match facial features, ethnicity, and skin tone.\n</identity_reference>\n`;
      for (const img of modelReferenceImages.slice(0, 5)) {
        if (!img) continue;
        if (img.startsWith('data:')) {
          imageInputs.push(img);
        } else if (img.startsWith('http')) {
          const result = await downloadToBase64(img);
          if (result) imageInputs.push(`data:${result.mimeType};base64,${result.base64str}`);
        }
      }
    }

    if (locationImages && Array.isArray(locationImages) && locationImages.length > 0) {
      promptText += `\n<location_reference>\nUse the attached location images as reference for the background.\n</location_reference>\n`;
      for (const img of locationImages.slice(0, 5)) {
        if (img.startsWith('data:')) {
          imageInputs.push(img);
        } else if (img.startsWith('http')) {
          const result = await downloadToBase64(img);
          if (result) imageInputs.push(`data:${result.mimeType};base64,${result.base64str}`);
        }
      }
    }

    promptText += `<schema_generation_directive>
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

    console.log(`⏳ [${((Date.now() - startTime) / 1000).toFixed(1)}s] Отправляем запрос в KIE.ai (nano-banana-2)...`);
    
    const resultUrl = await executeKieTask(promptText, imageInputs, 'nano-banana-2');
    console.log(`✅ [${((Date.now() - startTime) / 1000).toFixed(1)}s] Картинка сгенерирована. Downloading result...`);
    const dl = await downloadToBase64(resultUrl);
    if (!dl) throw new Error("Failed to download final generated image from KIE.ai");

    // ═══ STATS: атомарно инкрементируем счётчик генераций ═══
    const mode = req.body?.isProductMode ? 'generationsProduct' : req.body?.isCalibration ? 'generationsCalibration' : 'generationsFashion';
    incrementGlobalCounter('generationsTotal').catch(() => {});
    incrementGlobalCounter(mode).catch(() => {});

    // Записываем детальный лог успешной генерации
    saveGenerationLog({
      userId: req.body?.userId,
      success: true,
      imageUrl: resultUrl,
      reqBody: req.body,
      durationMs: Date.now() - startTime
    }).catch(() => {});

    return res.status(200).json({ success: true, imageBase64: `data:${dl.mimeType};base64,${dl.base64str}`, imageUrl: resultUrl });
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`❌ [${elapsed}s] Ошибка:`, error.message);
    
    // Записываем детальный лог ошибки генерации
    saveGenerationLog({
      userId: req.body?.userId,
      success: false,
      error: error.message,
      reqBody: req.body,
      durationMs: Date.now() - startTime
    }).catch(() => {});

    // ═══ ADMIN ALERT — отправка в Telegram (фоновая, не блокирует ответ) ═══
    const mode = req.body?.isProductMode ? 'product' : req.body?.isCalibration ? 'calibration' : req.body?.isPhotoEdit ? 'photo_edit' : 'fashion';
    alertOnError(error, `generate-image [${mode}] ${elapsed}s`).catch(() => {});
    
    // Detect quota/rate-limit errors and return friendly messages
    const msg = error.message || '';
    if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota') || msg.includes('rate')) {
      return res.status(200).json({ 
        success: false, 
        error: '⏳ Лимит запросов временно исчерпан. Подождите 1-2 минуты и попробуйте снова.',
        isQuotaError: true
      });
    }
    if (msg.includes('422') || msg.includes('not supported')) {
      return res.status(200).json({ 
        success: false, 
        error: '⚠️ Модель генерации временно недоступна. Попробуйте позже.'
      });
    }
    if (msg.includes('400') || msg.includes('INVALID_ARGUMENT')) {
      return res.status(200).json({ 
        success: false, 
        error: '❌ Некорректный запрос. Попробуйте другие настройки или фото.'
      });
    }
    
    return res.status(500).json({ success: false, error: 'Ошибка генерации', details: msg.substring(0, 300) });
  }
}
