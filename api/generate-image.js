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
    } = req.body;

    // ═══ PHOTO EDIT MODE — precise, non-destructive editing ═══
    // Sends the EXISTING photo + edit instruction to Gemini.
    // Does NOT regenerate from scratch — only modifies what the user asked for.
    if (isPhotoEdit && editInstruction) {
      console.log(`✏️ [${new Date().toISOString()}] Photo Edit: "${editInstruction}"`);
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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

        const editPrompt = `You are a professional photo retoucher. You will receive a photograph.

YOUR TASK: Apply ONLY the following edit to this photograph:
"${editInstruction}"

CRITICAL RULES:
1. Keep the ENTIRE image IDENTICAL — same person, same pose, same clothing, same background, same lighting, same camera angle, same composition, same colors.
2. Change ONLY what the user explicitly requested. Nothing else.
3. If the user asks to remove something (e.g. tattoo), seamlessly blend the area with natural surrounding skin/surface.
4. If the user asks to add something (e.g. sunglasses), add it naturally while keeping everything else untouched.
5. Maintain the exact same image resolution. 
6. The result must look like the original photo with a single precise edit — NOT a regenerated image.

OUTPUT: Return ONLY the edited image. No text.`;

        const parts = [
          { text: editPrompt },
          { inlineData: { data: sourceData.base64str, mimeType: sourceData.mimeType } },
        ];

        const response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-image-preview',
          contents: [{ role: 'user', parts }],
          config: { responseModalities: ['IMAGE', 'TEXT'], temperature: 0.3 },
        });

        let imageBase64 = null;
        let textResponse = '';
        if (response.candidates?.[0]?.content?.parts) {
          for (const part of response.candidates[0].content.parts) {
            if (part.inlineData?.mimeType?.startsWith('image/')) { imageBase64 = part.inlineData.data; break; }
            if (part.text) { textResponse += part.text; }
          }
        }
        if (!imageBase64) {
          console.error(`❌ Photo edit failed. Text: ${textResponse.substring(0, 300)}`);
          return res.status(200).json({ success: false, error: textResponse || 'Gemini не вернул отредактированное изображение.' });
        }
        console.log(`✅ [${((Date.now() - startTime) / 1000).toFixed(1)}s] Photo edit complete`);
        return res.status(200).json({ success: true, imageBase64 });
      } catch (editError) {
        console.error(`❌ Photo edit error:`, editError.message);
        return res.status(200).json({ success: false, error: `Ошибка редактирования: ${editError.message}` });
      }
    }

    // ═══ GARMENT SOURCE RESOLUTION ═══
    // Priority: URLs (lightweight) → base64 (legacy) → single base64 (legacy v1)
    let garmentImages = [];
    if (garmentImageUrls.length > 0) {
      // New path: download from Firebase Storage (server-to-server, instant inside Google network)
      console.log(`☁️ Downloading ${garmentImageUrls.length} garment(s) from Firebase Storage...`);
      const downloads = await Promise.all(garmentImageUrls.map(url => downloadToBase64(url)));
      garmentImages = downloads
        .filter(d => d !== null)
        .map(d => `data:${d.mimeType};base64,${d.base64str}`);
      console.log(`☁️ Downloaded ${garmentImages.length}/${garmentImageUrls.length} garment(s) successfully`);
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
