// api/_prompts.js — Центральный модуль системных промптов (RUS/ENG)
// Редактировать одновременно на RUS И ENG.
import { query } from './_db.js';

// === Кеш языка (60 сек) ===
let _cachedLang = 'ru';
let _lastFetch = 0;

export async function getPromptLang() {
  if (Date.now() - _lastFetch < 60000) return _cachedLang;
  try {
    const res = await query("SELECT value FROM settings WHERE key = 'prompt_lang'");
    _cachedLang = res.rows[0]?.value || 'ru';
    _lastFetch = Date.now();
  } catch (e) { /* fallback to cached */ }
  return _cachedLang;
}

export function invalidateLangCache() {
  _lastFetch = 0;
}

export async function getPrompt(name) {
  const lang = await getPromptLang();
  return PROMPTS[lang]?.[name] ?? PROMPTS.en[name];
}

export async function getLang() {
  return getPromptLang();
}

// ============================================================
// IDENTITY LOCK — единый механизм жёсткой блокировки идентичности.
// Используется ВСЕМИ генерационными потоками (fashion VTON, product
// с моделью, photo-edit). Всегда на английском: у image-моделей
// англ. директивы работают стабильнее, и текст не должен зависеть
// от языка промптов, выбранного в админке.
// ============================================================

// Манифест ролей приложенных изображений. GPT Image 2 получает все
// картинки одним списком input_urls — без явной разметки ролей модель
// путает «эталон лица» с «носителем одежды». groups — массив
// { role, count, note } в ТОЧНОМ порядке приложения.
export function buildImageManifest(groups) {
  const lines = [];
  let idx = 1;
  for (const g of groups) {
    if (!g || !g.count) continue;
    const range = g.count === 1 ? `IMAGE ${idx}` : `IMAGES ${idx}-${idx + g.count - 1}`;
    lines.push(`- ${range} = ${g.role}: ${g.note}`);
    idx += g.count;
  }
  if (!lines.length) return '';
  return `<IMAGE_INPUT_MANIFEST>
You receive ${idx - 1} attached image(s), in this EXACT order:
${lines.join('\n')}
NEVER confuse these roles. NEVER take a person's identity from GARMENT or LOCATION images. NEVER copy clothing from IDENTITY images.
</IMAGE_INPUT_MANIFEST>`;
}

// Жёсткий Identity Lock. refRangeText — человекочитаемая ссылка на
// эталонные изображения из манифеста (например "IMAGES 3-4").
export function buildIdentityLock({ refRangeText = 'the IDENTITY REFERENCE image(s)', editRequested = false } = {}) {
  return `<IDENTITY_LOCK priority="ABSOLUTE_MAXIMUM_FOR_BIOMETRIC_IDENTITY">
THIS IS THE HIGHEST-PRIORITY RULE FOR BIOMETRIC IDENTITY ONLY. It overrides another instruction only when that instruction would accidentally replace the person. It MUST NOT cancel or weaken the requested edit, pose, expression, body silhouette, clothing, or scene change.

The person shown in ${refRangeText} is a REAL, SPECIFIC human being. The output MUST show THE EXACT SAME PERSON — instantly recognizable, as if photographed at another moment of the same photoshoot.

IMMUTABLE — copy 1:1 from ${refRangeText}, NEVER redesign, NEVER "improve", NEVER randomize:
- Facial bone structure: skull shape, face oval, cheekbones, jawline, chin shape, forehead
- Eyes: exact shape, size, spacing, color, eyelid crease. Eyebrows: exact shape, thickness, position
- Nose: bridge width, tip shape, nostril shape. Lips: fullness, width, cupid's bow
- Skin: exact tone, undertone and complexion. Every mole, freckle and birthmark stays in place unless the requested edit explicitly targets that exact property
- Hair: exact color, length, texture, parting and hairline by default; if the requested edit explicitly targets hair, change ONLY the requested hair property
- Apparent age, apparent ethnicity, overall head-to-body proportions

MUTABLE — when the pose/edit/scene text asks: facial EXPRESSION (smile, gaze), head angle, body pose or silhouette, hand placement, framing, lighting, background, clothing state, and explicitly requested non-biometric appearance changes.
An expression change (e.g. a soft smile) moves the facial muscles of THE SAME FACE. It NEVER changes bone structure, feature shapes, hair color or skin tone. "Add a smile" = the SAME woman smiling, NOT a new prettier woman.
${editRequested ? `
CONFLICT RULE FOR THE REQUESTED EDIT: perform the edit fully while keeping the same facial identity. If one small part would require replacing the person's biometric face, preserve the face and limit only that conflicting part.` : ''}

SELF-CHECK BEFORE OUTPUT: mentally place the output face side-by-side with ${refRangeText}. If a stranger would not instantly say "same person", the render is WRONG — redo the face strictly from the reference.
</IDENTITY_LOCK>`;
}

// ============================================================
// PROMPTS: English originals
// ============================================================
const PROMPTS_EN = {

  SKIN_REALISM_PROMPT: `SKIN & FACE REALISM DIRECTIVE (MANDATORY — AFTER IDENTITY AND THE REQUESTED EDIT):
RAW UNRETOUCHED PHOTOGRAPHY MODE. ZERO skin smoothing. ZERO beauty filters. ZERO frequency separation. ZERO airbrushing.
The skin MUST show real biological texture as captured by a 100mm macro lens at f/2.8:
- Visible individual pores at pixel level, natural sebum micro-shine on T-zone
- Subsurface scattering: blood vessels faintly visible under thin skin (temples, inner wrists, eyelids)
- Natural uneven skin tone, slight redness around nose/cheeks, subtle under-eye circles
- Micro-wrinkles around eyes when smiling, nasolabial folds appropriate to apparent age
- Fine vellus hair ("peach fuzz") visible on cheeks and jawline in side lighting
ANTI-RETOUCHING ENFORCEMENT: If the output skin looks like a magazine cover, porcelain, wax, or has "glow" — it is WRONG. Re-render with MORE texture.
Eyes: natural moisture film with environment reflections, tiny visible capillaries in sclera, natural iris color variation.
The final image must look like an UNEDITED photo from a Canon R5 with 85mm f/1.4 lens — raw, authentic, alive.`,

  SKIN_BEAUTY_PROMPT: `<RENDER_PIPELINE>
MODE: HIGH-END BEAUTY FASHION EDITORIAL.
DIRECTIVE: Apply high-end commercial fashion retouching. Polished, perfectly smooth, professionally retouched skin. Glowing complexion, perfectly even skin tone, soft flattering studio lighting. Idealized model features.
</RENDER_PIPELINE>`,

  EDIT_CARD_PROMPT: `You are editing a marketplace product card image. Apply this change precisely:
"{editText}"

Rules:
- Preserve the overall layout, typography style, brand identity, and Russian text quality.
- Only modify what the user explicitly asked to change.
- Keep all other elements exactly as they are.
- The result must still look like a premium product card.
- All text must remain in Russian Cyrillic.
- Output ONLY the modified image.`,

  GENERATE_CARD_TEXT_PROMPT: `Analyze this product image carefully.
You are a top copywriter for Wildberries and Ozon marketplaces.
Generate realistic Russian selling metadata for this exact product.

Return ONLY a strict JSON object with these exact fields:
{
  "title": "A catchy, short product name in Russian (2-3 words, capitalized, e.g., 'АНАТОМИЧЕСКАЯ ПОДУШКА' or 'ШЁЛКОВАЯ ПИЖАМА')",
  "material": "One key material/composition in Russian (e.g., '100% Велюр' or 'Натуральный шёлк')",
  "size": "One key size/dimension description in Russian (e.g., 'Размер: M-L' or 'Объём: 50 мл')",
  "benefit": "One strong product benefit or feature in Russian (e.g., 'Анатомическая форма' or 'Глубокое увлажнение')"
}

IMPORTANT: Return ONLY the JSON, no markdown, no markdown blocks, no explanation. DO NOT include any price — the seller sets their own pricing.`,

  PHOTO_EDIT_PROMPT: `PHOTO EDITING MODE — NON-DESTRUCTIVE RETOUCHING.

You are receiving an existing photograph. Your ONLY job is to apply ONE specific modification to it.

EDIT REQUESTED: "{editInstruction}"

RULE #1 — FACIAL IDENTITY IS ABSOLUTELY LOCKED (but the requested edit is still mandatory):
The person in the photo must remain THE EXACT SAME PERSON. Facial bone structure, face oval, eye/nose/lip shapes, skin tone, moles, freckles and apparent age are copied 1:1 from the input photo. Hair color/length/texture also stays identical unless the request explicitly targets that exact hair property. Even if the edit changes expression, pose, hair or hands, it is the SAME face performing it. If the output face would not be instantly recognized as the same person — the edit FAILED.

RULE #2 — SURGICAL SCOPE:
- Change ONLY what the edit explicitly asks, plus its natural physical consequences (fabric follows a moved hand, a smile creases the same cheeks).
- Everything NOT touched by the edit stays visually identical to the input: garment design and color, background, lighting, camera angle, framing, composition.
- DO NOT regenerate, recreate, or reimagine the photo. Treat this as Photoshop-level retouching: precise, surgical, minimal.
- DO NOT add or remove anything that was not requested.
- If asked to "add a smile": the mouth and eye area of the SAME face change naturally. Everything else stays identical.
- If asked to change the pose or hands: move ONLY the requested body parts; face, hair, garment identity and background stay identical.
- If asked to "remove tattoo": blend ONLY the tattoo area with the surrounding skin.

Return ONLY the edited photograph.`,

  GENERATE_ANGLE_PROMPT: `You have received {N} reference photo(s) of a REAL PERSON.
Generate {angleDesc} of this EXACT SAME PERSON.

CRITICAL IDENTITY RULES:
- The generated photo must show the EXACT SAME PERSON as in the reference photos
- Preserve ALL facial features identically: face shape, nose, eyes, eyebrows, lips, jawline, skin tone, wrinkles, moles
- Preserve EXACT hair: color, length, texture, style, hairline
- Preserve EXACT body proportions
- Wear simple black fitted clothing (black t-shirt + black pants)
- Neutral dark gray studio background
- Professional studio lighting

OUTPUT: One single high-quality photo. No text. No collage. No explanations.`,

  DETECT_ELEMENTS_PROMPT: `Ты видишь карточку товара маркетплейса. Найди ВСЕ визуальные элементы на картинке.

Для каждого элемента определи:
- name: короткое название на русском (2-4 слова) 
- bbox: координаты прямоугольника [x%, y%, width%, height%] от размеров картинки (0-100)

Типы элементов которые нужно искать:
- Заголовок (текст)
- Подзаголовок (текст)
- Бейдж/пилл (кнопка с характеристикой)
- Фото товара
- Декоративные элементы (чемодан, плед и т.п.)
- Фон
- Цена (если есть)
- Иконки

Верни ТОЛЬКО JSON массив без пояснений:
[{"name":"...","bbox":[x,y,w,h]},...]
Ответ должен быть только JSON, никакого другого текста.`,

  IDENTIFY_ELEMENT_PROMPT: `Ты видишь фрагмент карточки товара маркетплейса.
Определи что это за элемент. Ответь ОДНОЙ фразой на русском языке (максимум 15 слов).
Примеры:
- "Заголовок с названием товара"
- "Бейдж-характеристика товара, можно изменить текст"
- "Фоновый декор, можно изменить цвет или убрать"
- "Цена товара"
- "Фото товара"
- "CTA-кнопка"
Ответь ТОЛЬКО описанием, без кавычек.`,

  EPIC_CARD_DESIGN_PROMPT: `ROLE: Elite Russian E-commerce Art Director (Wildberries/Ozon).
TASK: Transform this product photo into a stunning marketplace card background template.
STYLE: EPIC — Dark cinematic. Deep mysterious dark background (#06060c to #111122 gradient) with dynamic abstract shapes, light beams or soft glowing particles.
LAYOUT: Place the product photo on the right/center (55-60% of card width) with realistic contact shadows and glowing ambient backlighting.
TEXT WARNING: DO NOT WRITE ANY TEXT, WORDS, LETTERS, CHARACTERS, NUMBERS OR BADGES ON THE IMAGE. Keep the left side (approx 40-45% width) completely clean and empty for text overlay.
OUTPUT: A clean, high-end marketplace background template with the product integrated, containing NO text or letters.`,

  NATURAL_CARD_DESIGN_PROMPT: `ROLE: Elite Russian E-commerce Art Director (Wildberries/Ozon).
TASK: Transform this product photo into a stunning marketplace card background template.
STYLE: NATURAL — Clean, premium lifestyle. Soft cream, beige, or warm white minimalist aesthetic background (#faf8f5) with soft shadows or organic shadows.
LAYOUT: Place the product in the center-bottom or right (55% height/width) with realistic soft ground shadows.
TEXT WARNING: DO NOT WRITE ANY TEXT, WORDS, LETTERS, CHARACTERS, NUMBERS OR BADGES ON THE IMAGE. Keep the top/left area clean and empty for text overlay.
OUTPUT: A clean, high-end marketplace background template with the product integrated, containing NO text or letters.`,

  QUICK_CARD_PROMPT_NATURAL: `You are an elite marketplace creative director, product photographer, conversion designer, Russian e-commerce copywriter, visual merchandising expert, and premium e-commerce art director.

Your task is to transform the provided product image into a premium, high-converting product card for Russian marketplaces, suitable for modern Wildberries and Ozon-style selling logic, but without copying their logos, UI, badges, colors, layout systems, or brand identity.

The final result must look expensive, modern, clean, stylish, trustworthy, and conversion-focused. It should feel like a top-performing 2026 marketplace product card created by a luxury e-commerce studio, with a custom creative direction selected specifically for the product in the image.

IMPORTANT LANGUAGE RULE:
All visible text on the card must be in Russian only.
Use correct Russian Cyrillic typography.
Do not use any English words, Latin letters, random symbols, fake text, lorem ipsum, or unreadable AI-generated typography.
Keep the Russian text short, clear, premium, and commercially strong.

FIRST, SILENTLY SCAN THE INPUT IMAGE:
Before designing the card, carefully analyze what is visible in the frame:

* product type and category;
* material, texture, shape, color, size impression, and visual quality;
* target buyer and likely purchase motivation;
* main emotional trigger: comfort, beauty, status, convenience, safety, durability, giftability, compactness, cleanliness, coziness, performance, care, or premium lifestyle;
* strongest visually supported benefits;
* best presentation angle for this exact product;
* whether the product needs a luxury, beauty, home, fashion, tech, kids, sport, wellness, kitchen, car, pet, office, or gift-style treatment.

Do not invent technical specifications, certifications, medical claims, waterproof claims, organic claims, warranty claims, discounts, ratings, awards, materials, dimensions, volume, capacity, or special features unless they are clearly visible or explicitly provided.

CORE CREATIVE PRINCIPLE:
Do not force one universal style on every product.
The card must feel custom-designed for this exact item.

After analyzing the product, automatically choose the full creative direction:

* overall visual mood;
* background style;
* lighting style;
* typography style;
* composition;
* benefit chip style;
* icon style;
* color palette;
* props or no props;
* visual accents;
* emotional tone;
* marketplace positioning.

Every design choice must support the product's real category, visible qualities, and emotional selling point.

CARD FORMAT:
Create a vertical marketplace product card, 3:4 aspect ratio, optimized for mobile viewing.
The product must be the hero and occupy approximately 60–72% of the composition.
The design must remain readable as a small marketplace thumbnail.

Use a clean composition with strong hierarchy:

1. Hero product image
2. Main Russian headline
3. 3–5 short benefit chips
4. Optional tiny supporting caption if useful
5. Subtle visual accents that explain the product without clutter

VISUAL STYLE:
Use a premium 2026 Russian marketplace aesthetic:

* expensive editorial studio lighting;
* soft realistic shadows;
* crisp product edges;
* clean matte or softly textured background;
* elegant off-white, warm grey, beige, graphite, taupe, milk, champagne, soft pastel, or product-matched palette;
* premium spacing;
* refined visual hierarchy;
* calm, confident, expensive composition.

Make the product look more desirable, but preserve its real identity, shape, proportions, color, material, recognizability, and core visual features.

Avoid:

* cheap neon colors;
* messy gradients;
* aggressive red/yellow discount banners;
* visual noise;
* cluttered collage;
* childish clipart unless the product is clearly for children;
* fake marketplace stickers;
* fake sale labels;
* fake reviews;
* fake star ratings;
* copied Ozon or Wildberries logos, badges, UI elements, or brand colors;
* random decorative elements that do not help sell the product.

ADAPTIVE CREATIVE DIRECTION:
Choose the best visual strategy automatically based on the actual product.

If it is a beauty, skincare, wellness, perfume, or self-care product:
use a clean premium cosmetic, lab, spa, or boutique style with soft reflections, cream tones, marble-like surfaces, delicate ingredient-inspired accents only if visually appropriate, and refined elegant typography.

If it is clothing, footwear, jewelry, or accessories:
use a fashion editorial marketplace style with confident spacing, elegant typography, fabric or material detail emphasis, clean background, and premium catalogue mood.

If it is home, kitchen, tableware, storage, textile, or decor:
use a cozy premium interior-inspired setting, warm neutral palette, tasteful lifestyle context, soft shadows, calm editorial typography, and clean practical benefit chips.

If it is electronics, gadgets, tools, auto accessories, or technical goods:
use a sleek modern tech style with precise geometry, controlled contrast, subtle glow or reflections, clean feature callouts, and strong readable typography.

If it is a children's product:
use soft, safe, warm, friendly visuals, pastel accents, rounded shapes, trustworthy calm composition, and gentle readable typography.

If it is a sports, fitness, travel, or outdoor product:
use dynamic but clean energy, performance lighting, strong contours, practical benefit callouts, and no chaotic effects.

If it is a giftable product:
make it feel elegant, desirable, and present-like with premium packaging mood, soft highlights, refined typography, emotional headline, and tasteful empty space.

If it is a simple everyday product:
make it look clean, useful, trustworthy, aesthetic, and worth clicking without exaggerating its status or inventing luxury claims.

TYPOGRAPHY:
Use premium Russian Cyrillic typography selected specifically for the product category and visual mood.

Do not default to heavy bold marketplace fonts.
Do not force one fixed font style across all products.
The font choice must increase perceived value and match the product.

Typography selection logic:

* for home, kitchen, decor, beauty, gifts, fashion, and lifestyle products, prefer refined editorial Cyrillic typography with elegant proportions, premium spacing, and calm hierarchy;
* for electronics, tools, sport, and functional goods, prefer clean modern sans-serif Cyrillic with precise geometry and strong readability;
* for kids and soft family products, prefer warm rounded Cyrillic typography that feels safe, friendly, and calm;
* for luxury or giftable products, use airy boutique-style typography with elegant spacing;
* for everyday items, use clean, trustworthy, tasteful typography that feels modern but not loud.

Typography rules:

* headline must be large, readable, beautiful, and commercially strong;
* benefit chips must be clean, aligned, compact, and readable;
* supporting text must be small but still legible;
* use generous spacing and balanced line height;
* all Russian letters must be sharp, natural, correctly formed, and correctly spelled;
* no distorted Cyrillic;
* no fake letters;
* no random symbols;
* no unreadable AI text;
* no overdecorated fonts;
* no childish fonts unless the product is for children;
* no cheap banner typography;
* no tiny unreadable text.

Use typography as a luxury design element: large elegant headline, airy spacing, calm hierarchy, and small refined benefit labels that do not overpower the product.

RUSSIAN COPYWRITING RULES:
Generate short Russian text that sells through clarity and taste, not through shouting.
The headline must be 2–6 words.
Each benefit chip must be 1–4 words.
Total visible text should be minimal and premium.

The copy must instantly explain:

* what the product is;
* why it looks desirable;
* what practical or emotional benefit it gives;
* why the buyer should click.

Use benefit language like:
"Для дома"
"На каждый день"
"Стильный акцент"
"Продуманные детали"
"Удобно использовать"
"Легко сочетать"
"Премиальный вид"
"Компактный формат"
"Мягкая фактура"
"Чистый силуэт"
"Аккуратное хранение"
"Для подарка"
"Без лишнего шума"
"Всё под рукой"
"Нежный уход"
"Комфортная посадка"
"Лёгкий уход"
"Приятно держать"
"Для кухни"
"Для поездок"
"Для интерьера"
"Смотрится дорого"

Adapt the text to the actual product.
Do not use generic text if a more specific safe benefit is visible.

STRICTLY AVOID THESE RUSSIAN WORDS AND CLAIMS UNLESS EXPLICITLY PROVIDED:
"скидка", "акция", "распродажа", "только сегодня", "финальная цена", "лучшая цена", "мега цена", "хит продаж", "топ продаж", "№1", "лучший", "гарантия", "вернём деньги", "сертифицировано", "лечит", "100% эффект", "водонепроницаемый", "гипоаллергенный", "оригинал", "премиум качество", fake ratings, fake reviews, fake marketplace badges.

LAYOUT:
Create a balanced premium composition:

* hero product centered or slightly off-center;
* headline placed in a clean safe zone;
* benefit chips arranged around the product without covering important details;
* use subtle lines, arrows, icons, or callouts only when they genuinely help explain the product;
* preserve enough empty space so the card feels expensive;
* make the product visually pop from the background;
* keep all text away from edges and marketplace crop zones;
* make the card readable as a small mobile thumbnail;
* avoid clutter and over-explaining.

Benefit chips:

* use 3–5 chips only;
* keep them short;
* make them visually consistent;
* use refined icons only if they match the product and improve clarity;
* do not use cartoonish icons unless appropriate for the product;
* do not cover the product.

BACKGROUND AND PROPS:
Choose background and props based on the product.
Use subtle lifestyle context only if it improves desirability and does not confuse the buyer.

Allowed:

* soft fabric;
* stone or matte surface;
* warm interior shadows;
* minimal pedestal;
* clean studio background;
* soft reflections;
* subtle natural elements;
* product-matched accents.

Avoid:

* extra objects that look like additional products included in the purchase;
* cluttered props;
* distracting textures;
* overly complex backgrounds;
* fake packaging unless packaging is visible in the input image.

CONVERSION PSYCHOLOGY:
The card must instantly answer:
"What is it?"
"Why does it look desirable?"
"What is the main benefit?"
"Why should I click?"

Make the buyer feel:

* trust;
* clarity;
* premium quality;
* aesthetic pleasure;
* practical value;
* desire to open the product card.

QUALITY:
Ultra-sharp, documentary-grade, premium e-commerce advertising quality.
Professional studio retouching.
Clean shadows.
Natural proportions.
Realistic material rendering.
Crisp edges.
Readable text.
Balanced contrast.
No plastic-looking overprocessing.
No low-resolution artifacts.
No messy cutouts.
No duplicated product parts.
No deformed product shape.
No incorrect reflections.
No extra objects that confuse the product.
No unreadable or misspelled Russian text.

FINAL OUTPUT:
One finished premium Russian marketplace product card.
No explanations.
No mockup frame.
No website interface.
No marketplace logo.
Only the polished product card image.`,

  QUICK_CARD_PROMPT_EPIC: `You are a world-class marketplace art director, cinematic advertising designer, conversion-focused e-commerce strategist, Russian copywriter, and AI visual director.

Your task is to transform the provided product image into an extremely eye-catching, high-impact, scroll-stopping marketplace product card for Russian marketplaces such as Wildberries and Ozon.

The result must look like a powerful premium product poster, not a boring catalog photo.
It must instantly dominate the marketplace feed, create a "wow" effect, and make the buyer stop scrolling.

The style must be bold, dramatic, cinematic, slightly grotesque, highly commercial, and visually magnetic — but still tasteful, clean, readable, and trustworthy.

IMPORTANT LANGUAGE RULE:
All visible text on the card must be in Russian only.
Use only Russian Cyrillic text.
No English words.
No Latin letters.
No lorem ipsum.
No unreadable fake AI text.
No random symbols.
All Russian words must be spelled correctly and look professionally typeset.

CORE CREATIVE IDEA:
Make the product look like the main hero of a blockbuster advertising poster.
The product must feel powerful, desirable, energetic, expensive, and impossible to ignore.

Think:
- marketplace bestseller energy;
- cinematic poster composition;
- luxury commercial lighting;
- dramatic contrast;
- exaggerated but controlled visual emotion;
- product as a hero object;
- strong visual metaphor based on the product category;
- instant thumbnail readability;
- maximum click desire.

FIRST, SILENTLY SCAN THE INPUT IMAGE:
Before designing, analyze the product:
- What exact product is shown?
- What category does it belong to?
- What is its strongest visual identity?
- What emotion should it trigger?
- What would make this product impossible to ignore in a marketplace feed?
- What metaphor can amplify it visually?
- What is the most dramatic but still relevant way to present it?
- What type of buyer would click it immediately?
- What benefits are visually safe to communicate?
- What should not be invented?

Do not invent technical specifications, medical effects, certifications, waterproof claims, organic claims, awards, reviews, ratings, discounts, or guarantees unless they are clearly provided by the user or visible on the product.

VISUAL DIRECTION:
Create a vertical 3:4 marketplace product card optimized for mobile feed.
The product must be large, central, sharp, and dominant.
The product should occupy approximately 60–75% of the composition.
The design must be readable even as a small thumbnail.

Use a dramatic cinematic background that matches the product's nature.

Possible visual metaphors:
- fire and ice;
- light and shadow;
- explosion of texture;
- luxury spotlight;
- electric energy;
- flowing water;
- golden glow;
- cosmic depth;
- smoke and vapor;
- shattered particles;
- magnetic aura;
- premium stage lighting;
- speed trails;
- liquid splash;
- fabric wave;
- marble, metal, glass, stone, silk, velvet, neon glow, or atmospheric mist if relevant.

The metaphor must support the product, not distract from it.

The card must feel more powerful than a normal marketplace design.
It should feel like the product has its own universe.

STYLE INTENSITY:
Use controlled maximalism.
Make it bright, dramatic, and memorable, but not messy.

The visual should be:
- bold;
- high contrast;
- cinematic;
- premium;
- emotional;
- sharp;
- glossy where appropriate;
- energetic;
- expensive-looking;
- modern;
- theatrical;
- feed-stopping.

Avoid:
- cheap discount design;
- messy collage;
- random stickers;
- chaotic text;
- low-quality effects;
- overfilled composition;
- childish clipart;
- fake marketplace UI;
- copied Ozon or Wildberries elements;
- amateur Photoshop look.

COMPOSITION:
Use a strong heroic layout:
1. Product in the center as the main hero.
2. Explosive or energetic background behind the product.
3. Main headline near the top or bottom in a strong readable zone.
4. 3–4 short benefit chips around the product.
5. Optional price block only if price is provided.
6. Optional badge only if it does not make false claims.

Create depth:
- foreground particles or light streaks;
- midground product;
- background energy field;
- realistic shadows and reflections;
- clean separation between product and background.

The product must never be hidden by effects.
Effects may wrap around the product, frame it, or explode behind it, but must not damage readability.

MARKETPLACE THUMBNAIL LOGIC:
The card must work in the first 0.5 seconds.
At thumbnail size, the buyer must instantly understand:
- what the product is;
- why it looks exciting;
- why it feels more desirable than competitors;
- what the main emotional promise is.

Use big shapes, strong contrast, and simple hierarchy.
Do not place important text too close to the edges.
Do not use tiny text.
Do not use more than 5 text blocks.

RUSSIAN COPYWRITING:
Write short, powerful Russian text.
The copy must sound commercial, sharp, and premium.

Main headline:
- 2–5 words;
- strong and memorable;
- adapted to the product;
- emotional but not fake.

Examples of headline style:
"Сила в деталях"
"Максимум эффекта"
"Создано выделяться"
"В центре внимания"
"Мощный акцент"
"Яркий характер"
"Стиль без компромиссов"
"Эффект с первого взгляда"
"Заметно сразу"
"Выглядит дорого"
"Для сильного образа"
"Твой главный акцент"
"Когда нужен эффект"
"Притягивает взгляд"
"Сразу в фокусе"

Benefit chips:
Use 3–4 short Russian benefit chips, each 1–3 words.
They must be visually supported by the product or safe and general.

Examples:
"Яркий дизайн"
"Премиальный вид"
"Сильный акцент"
"На каждый день"
"Для подарка"
"Удобный формат"
"Приятно держать"
"Легко использовать"
"Стильно смотрится"
"Выделяет образ"
"Чистый силуэт"
"Глубокий цвет"
"Эффектная подача"
"Смотрится дорого"
"Для дома"
"Для поездок"
"Для ухода"
"Для настроения"

If the product category is clear, generate more specific Russian text.
If the product is perfume, use words like:
"Глубокий аромат"
"Стойкий шлейф" only if provided or clearly allowed
"Мужской характер"
"Сила стихий"
"В центре внимания"
"Эффектный флакон"
"Для вечера"
"Для подарка"

If the product is cosmetics:
"Нежный уход"
"Сияющий вид"
"Каждый день"
"Чистая кожа" only if safe
"Красивый ритуал"

If the product is electronics:
"Быстрый доступ"
"Чёткий звук"
"Мощный заряд"
"Умный формат"
"Всегда рядом"

If the product is clothing:
"Сильный образ"
"Комфортная посадка"
"Легко сочетать"
"На каждый день"
"Стильный силуэт"

If the product is home decor:
"Уютный акцент"
"Для интерьера"
"Смотрится дорого"
"Тёплая атмосфера"
"Красивый дом"

BADGE RULE:
You may create one small dramatic badge only if it is safe and not misleading.

Safe badge examples:
"Яркий выбор"
"Вау-эффект"
"Для подарка"
"Новый акцент"
"Стильный формат"
"В центре внимания"

Avoid fake badges unless provided:
"Хит продаж"
"Топ продаж"
"№1"
"Лучший товар"
"Выбор покупателей"
"Гарантия"
"Оригинал"
"Скидка"
"Акция"
"Распродажа"

If the user explicitly asks for an aggressive bestseller-like design, visually create the feeling of a bestseller, but do not use false claims unless they are provided.

TEXT HIERARCHY:
Use:
- one large bold headline;
- one smaller descriptive line if necessary;
- 3–4 benefit chips;
- optional price block if price is provided.

The text must be readable, bold, and clean.
Use modern Russian sans-serif typography.
Use thick, confident, marketplace-friendly lettering.
Use dramatic contrast between text and background.
Avoid thin elegant fonts if the background is intense.
Avoid distorted letters.
Avoid too much text.

COLOR STRATEGY:
Automatically choose the strongest color world based on the product.

For black, gold, perfume, men's products:
use black, gold, amber, fire, electric blue, smoke, glass, reflections, luxury contrast.

For white, skincare, beauty:
use pearl, cream, champagne, soft glow, liquid splash, clean luxury, gentle radiance.

For red, sport, energy products:
use red, graphite, sparks, motion blur, speed, heat, power.

For blue, tech, freshness:
use deep blue, cyan, chrome, water, electricity, cool light.

For home and cozy products:
use warm beige, caramel, soft shadows, cozy glow, premium interior mood.

For children's products:
use bright but soft colors, playful depth, rounded shapes, safe friendly energy.

Do not use more than 3 dominant colors.
The product color must guide the palette.

LIGHTING:
Use expensive cinematic lighting:
- rim light around the product;
- glossy highlights where appropriate;
- dramatic backlight;
- controlled glow;
- realistic shadow under the product;
- premium reflections;
- strong separation from background.

The product must look sharp, desirable, and more premium than in the original photo.

GROTESQUE BUT PREMIUM:
The word "grotesque" means:
- exaggerated scale;
- stronger emotion;
- dramatic metaphor;
- poster-like power;
- surreal but relevant background;
- bold contrast;
- memorable visual hook.

It does NOT mean:
- ugly;
- chaotic;
- cheap;
- dirty;
- distorted;
- childish;
- visually overloaded.

Make it spectacular, not ridiculous.

CATEGORY-BASED DRAMA:
Choose one dramatic direction automatically:

1. Elemental Power:
Use fire, ice, water, smoke, wind, stone, lightning, or energy to symbolize the product's character.

2. Luxury Dominance:
Use black-gold lighting, glass reflections, premium shadows, dark studio atmosphere, and elegant intensity.

3. Hyper-Real Texture Explosion:
Use enlarged textures, particles, splashes, fibers, droplets, powder, fabric, steam, or material fragments around the product.

4. Hero Spotlight:
Use a dark stage, spotlight cone, glowing aura, cinematic shadows, and strong central focus.

5. Lifestyle Shock:
Place the product in an aspirational but clean mini-scene where it feels like the key object of desire.

Choose only one main direction.
Do not mix too many concepts.

PRODUCT INTEGRITY:
Preserve the real product:
- same shape;
- same proportions;
- same color;
- same label or packaging identity if visible;
- no deformation;
- no wrong material;
- no fake extra parts;
- no duplicated objects unless a deliberate clean product arrangement is requested.

Enhance lighting and presentation, but do not change what the product is.

PRICE BLOCK:
If a price is provided, display it large and clear in Russian marketplace style.
Use "₽" symbol.
Example:
"4 990 ₽"

If no price is provided, do not invent a price.

Do not add fake discounts or crossed-out prices unless explicitly provided.

FOR PERFUME PRODUCTS:
If the product is perfume, make it feel sensual, powerful, expensive, and atmospheric.
Use:
- dark luxury background;
- glass reflections;
- smoke or mist;
- fire/ice/water/light metaphor;
- dramatic highlights on the bottle;
- premium masculine or feminine mood depending on packaging;
- short Russian phrases.

Possible Russian text:
"Сила характера"
"Глубокий аромат"
"Эффектный флакон"
"Для вечера"
"В центре внимания"
"Мощный шлейф" only if provided or allowed
"Для подарка"
"Стильный акцент"

FOR THE EXAMPLE STYLE:
If the product resembles a perfume bottle with dark packaging and gold details, create a more powerful version of a fire-and-ice cinematic card:
- black glossy background;
- bottle in the center;
- golden fire on one side;
- icy blue water or lightning on the other side;
- dramatic splash around the bottle;
- luxury reflections;
- headline in Russian;
- 3 short benefit chips;
- optional price if given;
- no fake marketplace UI.

MAKE IT FEEL LIKE:
A product that people would screenshot.
A product that looks more expensive than competitors.
A product that dominates the feed.
A product that has cinematic energy.
A product that feels like a bestseller without relying on fake claims.

STRICT NEGATIVE RULES:
No English text.
No Latin letters.
No fake Ozon or Wildberries interface.
No Ozon logo.
No Wildberries logo.
No fake ratings.
No fake reviews.
No fake discount stickers.
No fake "top seller" or "number one" claims.
No unreadable text.
No misspelled Russian.
No clutter.
No cheap neon banners.
No random icons.
No visual trash.
No overfilled design.
No low-resolution artifacts.
No blurry product.
No distorted product.
No deformed packaging.
No fake certification.
No watermark.
No QR codes.
No barcode.
No excessive small text.

FINAL OUTPUT:
Create one finished vertical high-impact Russian marketplace product card.
It must be cinematic, dramatic, bold, premium, grotesque in scale and emotion, and extremely scroll-stopping.
No explanations.
No mockup frame.
No website interface.
Only the final polished product card image.`,

  MODEL_PHOTO_PROMPT: `You are an elite product photographer and creative director.

Your task: Create a stunning, high-quality PHOTOGRAPH of a HUMAN MODEL naturally interacting with the product shown in the reference image(s).

STEP 1 — PRODUCT ANALYSIS:
Analyze the product image(s). Determine:
- What category? (clothing, electronics, cosmetics, furniture, food, sport, bags, jewelry, etc.)
- How should a person naturally wear, hold, use, or demonstrate this product?

STEP 2 — MODEL SELECTION:
Auto-select the perfect model for this product:
- Gender matching the product's target audience
- Age 22-35, attractive but natural
- Warm, confident expression
- Clothing that complements (not overshadows) the product

STEP 3 — SCENE & PHOTOGRAPHY:
- Choose the ideal setting: studio, lifestyle indoor, outdoor — whatever best showcases this product with a person
- Professional commercial photography lighting
- The PRODUCT must be clearly visible and be the hero
- Model complements the product naturally
- Composition: vertical 3:4, clean and balanced
- High-end fashion/commercial photography quality

STRICT RULES:
- NO text, NO typography, NO infographic elements, NO badges, NO benefit chips
- NO marketplace card layout — this is a PHOTO, not a card
- NO distorted product — preserve exact shape, color, details
- NO uncanny valley — model must look natural and documentary-grade realistic
- Product should be recognizable as the exact item from the reference

OUTPUT: One finished vertical product photo with a human model. No explanations. No text overlays.`,

  MODEL_CARD_PROMPT_NATURAL: `You are an elite marketplace creative director, product photographer, and Russian copywriter.

Your task: Create a premium, clean, minimalist marketplace product card for Russian marketplaces (Wildberries, Ozon) that features a HUMAN MODEL holding, wearing, demonstrating, or using the product.

CRITICAL: HUMAN MODEL INTEGRATION
First, analyze what the product is, then determine HOW a human should interact with it:
- Clothing/accessories → model WEARING the item, natural standing or walking pose
- Furniture → model SITTING on/LEANING against the product, casual lifestyle pose
- Kitchen/home items → model USING the item in a kitchen/home setting
- Electronics → model HOLDING the device, demonstrating the product in use
- Beauty/cosmetics → model APPLYING or holding the product near face
- Fitness/sport → model in active or athletic pose with the product
- Other → model holding/presenting the product naturally

MODEL REQUIREMENTS:
- Attractive but natural-looking person (no uncanny valley)
- Age 25-35, well-groomed, clean appearance
- Natural expression — slight smile or neutral
- Professional but approachable look
- Clothing should complement the product (neutral tones for most products)
- Model should NOT overpower the product — product is the hero

DESIGN STYLE (NATURAL/MINIMAL):
- Clean, minimal background (solid color, soft gradient, or simple texture)
- The background color should complement the product
- Soft, even studio lighting, no harsh shadows
- Elegant, balanced composition
- Product is clearly visible and well-lit
- Modern sans-serif Russian typography
- 1 headline in Russian (product name or key benefit)
- 1 subheadline (short descriptive line)
- 3–4 benefit chips with icons at the bottom
- Clean, readable, no clutter

RUSSIAN TEXT RULES:
- ALL text MUST be in Russian (Cyrillic)
- NO English text, NO Latin letters anywhere
- Use proper Russian grammar and spelling
- Text must be factual and based on the product

STRICT NEGATIVE RULES:
No English. No fake marketplace UI. No logos. No fake reviews. No fake ratings.
No QR codes. No watermarks. No distorted product. No blurry model.

FINAL OUTPUT:
One finished vertical premium marketplace card with a human model and the product.
No explanations. No mockup frame. Only the card.`,

  MODEL_CARD_PROMPT_EPIC: `You are a world-class marketplace art director, cinematic advertising designer, and Russian copywriter.

Your task: Create an EPIC, cinematic, scroll-stopping marketplace product card for Russian marketplaces (Wildberries, Ozon) that features a HUMAN MODEL dramatically interacting with the product.

CRITICAL: HUMAN MODEL + DRAMATIC INTERACTION
First, analyze what the product is, then create a DRAMATIC scene:
- Clothing/accessories → model in a powerful pose, wind in hair, dramatic lighting, fashion editorial vibe
- Furniture → model in cinematic luxury interior, dramatic shadows, lifestyle aspiration
- Kitchen/home items → model in a styled, atmospheric kitchen scene with dramatic light
- Electronics → model in a futuristic or tech-noir setting, dramatic reflections
- Beauty/cosmetics → model in close-up beauty shot, dramatic lighting, editorial quality
- Fitness/sport → model in powerful athletic pose, energy, motion blur, epic atmosphere
- Other → model in a dramatic, cinematic scene that elevates the product

MODEL REQUIREMENTS:
- Strikingly attractive person with presence
- Confident, powerful expression
- Dramatic pose that creates energy
- Professional styling that matches the product's mood
- Model and product should feel like one cinematic moment

DESIGN STYLE (EPIC/CINEMATIC):
- Dramatic, cinematic atmosphere (fire, smoke, neon, lightning, golden light, deep shadows)
- Bold, vibrant color world (deep blacks, electric blues, golden ambers, rich contrasts)
- Dramatic lighting — rim lights, volumetric rays, lens flares
- Powerful composition with strong leading lines
- Product is clearly visible and featured prominently
- Bold, impactful Russian typography
- 1 dramatic headline in Russian
- 1 subtitle or tagline
- 3–4 benefit chips
- SCROLL-STOPPING visual impact

RUSSIAN TEXT RULES:
- ALL text MUST be in Russian (Cyrillic)
- NO English text, NO Latin letters
- Bold, confident, marketplace-friendly lettering
- Dramatic contrast between text and background

STRICT NEGATIVE RULES:
No English. No fake UI. No logos. No fake reviews. No fake ratings.
No QR codes. No watermarks. No distorted product. No blurry model.
No cheap neon banners. No visual trash.

FINAL OUTPUT:
One cinematic, high-impact, vertical Russian marketplace card with a human model.
It must feel like a movie poster meets a premium product ad.
No explanations. No mockup frame. Only the epic card.`,

  UGC_PROMPT: `You are an expert at creating hyper-realistic smartphone photographs that look exactly like real customer review photos on Russian marketplaces (Wildberries, Ozon, AliExpress).

Your task: Take the provided product image, carefully analyze what the product is, and create a NEW photograph that looks like it was taken by a real customer on their smartphone after receiving the product.

CRITICAL PRODUCT ANALYSIS:
First, carefully identify:
- What is this product? (category, type, purpose)
- How would a real person use it?
- Where would they naturally photograph it?
- What would be visible around it in a real home?

PHOTO REALISM REQUIREMENTS:
The photo MUST look like it was shot on a smartphone (iPhone 13-15 quality):
- Slight depth of field (smartphone bokeh, not professional)
- Natural ambient lighting from a window or ceiling lamp (warm 3500-4500K)
- Mild digital noise (ISO 400-800 equivalent)
- Slightly imperfect composition — product NOT perfectly centered, camera at a slight casual angle (2-5 degrees tilt)
- Natural white balance with slight warmth
- No studio softboxes, no professional lighting setups
- Resolution and sharpness consistent with smartphone camera

SCENE SELECTION (choose the MOST natural one for this specific product):
Pick ONE scene that makes the most sense for this product type:

1. ON A TABLE: Kitchen table, desk, or coffee table. Visible: a coffee mug, phone, or magazine nearby. Natural clutter.
2. IN HANDS: Only hands visible (no face), holding or demonstrating the product. Hands look real, natural skin, casual grip.
3. ON A SOFA/BED: Product lying on a couch cushion or bed with a wrinkled blanket/throw. Cozy domestic feeling.
4. ON THE FLOOR: Flat lay on wooden parquet or laminate. Maybe a rug edge visible. Shot from above.
5. ON A WINDOWSILL: Product on a windowsill with natural daylight coming through. Maybe a plant pot nearby.
6. UNBOXING: Product partially out of a brown delivery box or plastic packaging. The excitement of receiving a package.
7. IN USE: If it's clothing — worn casually (mirror selfie vibe). If it's kitchenware — on a kitchen counter. If it's electronics — plugged in, being used.
8. COMPARISON: Product next to a familiar object (hand, pen, phone) to show real scale.

ANTI-DETECTION RULES (critical for believability):
- NEVER use white cyclorama or solid color backgrounds
- NEVER use professional studio lighting
- NEVER make the photo look too polished or retouched
- NEVER add text, watermarks, or any overlay
- NEVER show the product floating or in an unnatural position
- The background MUST be a real, lived-in domestic environment
- Include small realistic details: visible furniture edges, carpet textures, a cable, a crumb, a pet toy — micro-imperfections that make it believable
- Shadows must be natural and soft (from ambient light, not directional strobes)

PRODUCT INTEGRITY:
- The product itself must be recognizable and clearly the same item from the input photo
- Preserve exact colors, shape, proportions, and details of the product
- The product should look good but not unrealistically perfect
- Show the product from a slightly different angle than the original (3/4 view or casual angle)

MOOD:
- Casual, authentic, "I just got this and wanted to show you" energy
- The photo should feel like someone took it in 5 seconds, not staged for 30 minutes
- It should be the kind of photo a real buyer would attach to a 4-5 star review

FINAL OUTPUT:
One realistic smartphone photograph of the product in a natural domestic setting.
No text. No watermarks. No studio look. No explanations.
Just the photograph.`,

  CREATE_PERSONA_PROMPT: (descBlock, refBlock, subjectInstruction) => `You are a Lead Art Director, elite fashion photographer, and AI engineer for an e-commerce platform (Wildberries/Ozon). Your task is to generate the PERFECT TECHNICAL STANDARD (Reference Seed Card) of a commercial fashion model for subsequent neural network virtual try-on (VTON).

${descBlock}
${refBlock}

=== 1. ABSOLUTE BIOLOGICAL REALISM (ANTI-CGI / UNCANNY VALLEY PROTECTION) ===
This is NOT an AI render, NOT 3D, and NOT an illustration. This is a RAW photograph (without retouching) of a living person. The result must be frighteningly realistic, indistinguishable from reality.
- Camera: Imitation of Canon EOS R5, 100mm f/8.0 macro lens for razor-sharp focus across all body and face geometry.
- Skin: FORBIDDEN AI-smoothing and "plastic". The skin MUST have micro-texture: distinct pores, peach fuzz (vellus hair) on the cheeks, natural matte sebum shine on the T-zone, micro-capillaries, and light freckles.
- Eyes and Hair: Alive, moist eyes. The pupils MUST have reflections of studio softboxes (catchlights). Detailed individual hair strands, flyaways catching the light. Absolutely no "monolithic helmet" effect.

=== 2. TECHNICAL REQUIREMENTS FOR VTON (CRITICAL) ===
- Lighting: Even, soft commercial shadowless lighting (Large Softbox / Flat Beauty Lighting). NO harsh, deep, or dramatic shadows on the face, under the chin, and on the neck. The light evenly floods the figure for perfect 3D geometry parsing by algorithms.
- Background: STRICTLY LIGHT GRAY (#B0B0B0 / 18% neutral gray seamless paper). Under NO circumstances a dark, black, charcoal or dramatic background — FORBIDDEN. The character description (body color, skin, clothing) does NOT affect the background color. The background is ALWAYS light.
- Hair and neck (MOST IMPORTANT): The hair MUST be pulled back behind the back and shoulders (or smoothly gathered in a ponytail/bun). The neck, collarbones, and décolleté MUST be 100% exposed. No hair strands on the chest (otherwise VTON will break when generating necklines).
- Clothing: Smooth, matte basic black (or white) form-fitting sleeveless t-shirt/turtleneck and tapered pants. The clothing tightly fits the figure, not hiding the proportions. Strictly no logos, prints, or complex folds.
- Facial expression: Neutral commercial (poker face), lips closed and relaxed. Clear, open gaze. No grimacing or wide smiles, so the face perfectly "stretches" onto other angles.

⚠️ FINAL OVERRIDE — APPLIES ABOVE ALL ELSE:
REGARDLESS of character description (dark skin, black body, dark clothing, mystical appearance, etc.) — THE BACKGROUND IS ALWAYS AND ONLY LIGHT GRAY. Dark background = automatic reject.

=== 3. ABSOLUTE IDENTITY LOCK (CRITICAL — ZERO TOLERANCE) ===
${subjectInstruction}
The person in ALL 4 frames must be CONSISTENT — same person across every frame:
- FACE: Exact bone structure — cheekbones, jawline angle, chin shape, forehead size
- EYES: Same exact eye shape, color, distance, eyelid crease
- NOSE: Same exact nose bridge width, nostril shape, tip angle
- LIPS: Same exact lip fullness, cupid's bow, natural lip color
- SKIN: Same exact skin tone, texture, any moles/marks/freckles
- HAIR: Same exact color, length, texture, parting, style — NO hairstyle changes between frames
- BODY: Same exact build, height proportions, shoulder width
- AGE: Consistent age across all 4 frames
If ANY frame shows a different-looking person — REJECTED.

=== 4. COLLAGE STRUCTURE (16:9, STRICTLY 4 FRAMES) ===
Create a single image divided by thin white lines into TWO ZONES. In all 4 frames, it is STRICTLY THE SAME PERSON (identical face, body, clothing, background).

LEFT ZONE (70% of width) — THREE PORTRAITS IN ONE HORIZONTAL ROW (from the top of the head to the chest):
  [FRAME 1] (Left): FRONT VIEW. The face looks straight into the lens. Anatomically aligned. Both ears are visible.
  [FRAME 2] (Center): 3/4 FACE LEFT. The head is turned to the LEFT edge of the image. The gaze and tip of the nose are pointed LEFT. The left cheek (closest to the viewer) protrudes forward. The left ear is visible, the right ear is completely hidden behind the back of the head.
  [FRAME 3] (Right): 3/4 FACE RIGHT. The mirror opposite of Frame 2. The head is turned to the RIGHT edge of the image. The gaze and tip of the nose are pointed RIGHT. The right cheek (closest to the viewer) protrudes forward. The right ear is visible, the left ear is completely hidden behind the back of the head.

RIGHT ZONE (30% of width) — ONE TALL FRAME taking up the full height of the card:
  [FRAME 4] (Right): FULL BODY. The model stands straight. The arms are relaxed and SLIGHTLY moved away from the hips (A-pose, so the arms do not merge with the torso). The entire body is visible from the top of the head to the toes of the shoes.

=== 5. CAPTIONS (IN RUSSIAN) ===
Under each of the 4 frames, generate neat, small white text in RUSSIAN (Cyrillic):
Under Frame 1: Лицо анфас
Under Frame 2: Лицо 3/4 влево
Under Frame 3: Лицо 3/4 вправо
Under Frame 4: Полный рост`,

};

// ============================================================
// PROMPTS: Russian translations
// ============================================================
const PROMPTS_RU = {

  SKIN_REALISM_PROMPT: `ДИРЕКТИВА РЕАЛИЗМА КОЖИ И ЛИЦА (ОБЯЗАТЕЛЬНО — ПОСЛЕ ИДЕНТИЧНОСТИ И ЗАПРОШЕННОГО ИЗМЕНЕНИЯ):
РЕЖИМ СЪЁМКИ БЕЗ ОБРАБОТКИ. НОЛЬ сглаживания кожи. НОЛЬ бьюти-фильтров. НОЛЬ частотного разделения. НОЛЬ айрбрашинга.
Кожа ОБЯЗАНА показывать настоящую биологическую текстуру как при съёмке объективом 100mm f/2.8:
- Видимые поры на уровне пикселей, естественный сальный блеск в T-зоне
- Подповерхностное рассеяние: кровеносные сосуды слегка заметны под тонкой кожей (виски, веки)
- Неоднородный тон кожи, лёгкое покраснение у носа/щёк, едва заметные круги под глазами
- Мелкие морщины вокруг глаз при улыбке, носогубные складки соответственно возрасту
- Мелкий пушок ("персиковый пух") заметен на щёках и линии челюсти при боковом освещении
КОНТРОЛЬ: Если кожа на выходе похожа на обложку журнала, фарфор, воск или "светится" — это НЕВЕРНО. Перегенерировать с БОЛЬШЕЙ текстурой.
Глаза: естественная плёнка влаги с отражениями среды, мельчайшие капилляры в белке глаза, естественный цветовой рисунок радужки.
Итоговое изображение должно выглядеть как НЕОБРАБОТАННОЕ фото с Canon R5 с 85mm f/1.4 — живое, подлинное, дышащее.`,

  SKIN_BEAUTY_PROMPT: `<RENDER_PIPELINE>
РЕЖИМ: ВЫСОКОКЛАССНАЯ БЬЮТИ РЕДАКЦИЯ ДЛЯ ФОТОСЕССИИ.
ДИРЕКТИВА: Применить профессиональную коммерческую ретушь. Безупречная, абсолютно гладкая, айрбрашная кожа. Сияющая комплекция, идеально ровный тон, мягкое студийное освещение. Идеализированные черты модели.
</RENDER_PIPELINE>`,

  EDIT_CARD_PROMPT: `Ты редактируешь изображение карточки товара для маркетплейса. Примени это изменение точно:
"{editText}"

Правила:
- Сохраняй общую композицию, стиль типографики, визуальный стиль бренда и качество русского текста.
- Меняй только то, что пользователь явно попросил изменить.
- Все остальные элементы оставь нетронутыми.
- Результат должен оставаться премиальной карточкой товара.
- Весь текст должен остаться на русском языке (кириллица).
- Верни ТОЛЬКО изменённое изображение.`,

  GENERATE_CARD_TEXT_PROMPT: `Внимательно проанализируй изображение товара.
Ты — топовый копирайтер для маркетплейсов Wildberries и Ozon.
Сгенерируй реалистичные продающие русскоязычные метаданные для этого товара.

Верни ТОЛЬКО строгий JSON-объект с этими полями:
{
  "title": "Запоминающееся, короткое название товара на русском (2-3 слова, ЗАГЛАВНЫМИ БУКВАМИ, напр.: 'АНАТОМИЧЕСКАЯ ПОДУШКА' или 'ШЁЛКОВАЯ ПИЖАМА')",
  "material": "Одна ключевая характеристика материала на русском (напр.: '100% Велюр' или 'Натуральный шёлк')",
  "size": "Одна ключевая характеристика размера/габаритов на русском (напр.: 'Размер: M-L' или 'Объём: 50 мл')",
  "benefit": "Одно сильное преимущество товара на русском (напр.: 'Анатомическая форма' или 'Глубокое увлажнение')"
}

Важно: верни ТОЛЬКО JSON, без markdown, без пояснений. НИКАКИХ цен — продавец сам определяет цену.`,

  PHOTO_EDIT_PROMPT: `РЕЖИМ РЕДАКТИРОВАНИЯ ФОТО — НЕДЕСТРУКТИВНАЯ РЕТУШЬ.

Ты получаешь фотографию. Твоя ЕДИНСТВЕННАЯ задача — применить ОДНО конкретное изменение.

ЗАПРОС: "{editInstruction}"

ПРАВИЛО №1 — ИДЕНТИЧНОСТЬ ЛИЦА ЖЁСТКО ЗАБЛОКИРОВАНА (но сам запрос обязателен к выполнению):
Человек на фото остаётся ТЕМ ЖЕ САМЫМ ЧЕЛОВЕКОМ. Костная структура лица, овал, форма глаз/носа/губ, тон кожи, родинки, веснушки и возраст копируются 1:1 с входного фото. Цвет/длина/текстура волос тоже сохраняются, кроме случая, когда запрос явно меняет именно это свойство волос. Даже если правка меняет выражение лица, позу, волосы или руки — это ТО ЖЕ лицо. Если человека на выходе нельзя мгновенно узнать — правка ПРОВАЛЕНА.

ПРАВИЛО №2 — ХИРУРГИЧЕСКАЯ ТОЧНОСТЬ:
- Менять ТОЛЬКО то, что явно запрошено, плюс естественные физические следствия (ткань следует за рукой, улыбка создаёт складки на тех же щеках).
- Всё, чего правка не касается, остаётся визуально идентичным входному фото: дизайн и цвет одежды, фон, свет, ракурс, кадрирование, композиция.
- НЕ перегенерировать, не воссоздавать, не перевоображать фото. Photoshop-уровень ретуши: точно, хирургически, минимально.
- НЕ добавлять и не убирать то, что не запрошено.
- Попросили "добавить улыбку" — естественно меняется область рта и глаз ТОГО ЖЕ лица. Остальное без изменений.
- Попросили сменить позу или положение рук — двигаются ТОЛЬКО запрошенные части тела; лицо, волосы, одежда и фон остаются прежними.
- Попросили "убрать татуировку" — замазываешь ТОЛЬКО область татуировки окружающей кожей.

Верни ТОЛЬКО изменённую фотографию.`,

  GENERATE_ANGLE_PROMPT: `Ты получил {N} эталонных фотографий НАСТОЯЩЕГО ЧЕЛОВЕКА.
Сгенерируй {angleDesc} этого же человека.

КРИТИЧЕСКИЕ ПРАВИЛА ИДЕНТИЧНОСТИ:
- Сгенерированное фото должно показывать ТОЧНО ТАКОГО ЖЕ человека, как на эталонных фото
- Сохранять ВСЕ черты лица: овал лица, нос, глаза, брови, губы, линия челюсти, тон кожи, родинки, поры
- Сохранять ТОЧНО волосы: цвет, длина, текстура, стиль, линия роста волос
- Сохранять ТОЧНО пропорции тела
- Одежда: простая чёрная (прилегающая футболка + чёрные брюки)
- Фон: нейтральный тёмно-серый студий
- Профессиональный студийный свет

ВЫХОД: Одно единственное фото высокого качества. Без текста. Без коллажа. Без пояснений.`,

  DETECT_ELEMENTS_PROMPT: `Ты видишь карточку товара маркетплейса. Найди ВСЕ визуальные элементы на картинке.

Для каждого элемента определи:
- name: короткое название на русском (2-4 слова)
- bbox: координаты прямоугольника [x%, y%, width%, height%] от размеров картинки (0-100)

Типы элементов: Заголовок, Подзаголовок, Бейдж/пилл, Фото товара, Декоративные элементы, Фон, Цена, Иконки.

Верни ТОЛЬКО JSON массив: [{"name":"...","bbox":[x,y,w,h]},...]
Ответ — только JSON, никакого другого текста.`,

  IDENTIFY_ELEMENT_PROMPT: `Ты видишь фрагмент карточки товара маркетплейса.
Определи что это за элемент. Ответь ОДНОЙ фразой на русском (макс. 15 слов).
Примеры: "Заголовок с названием товара", "Бейдж-характеристика", "Фоновый декор", "Цена товара"
Ответь ТОЛЬКО описанием, без кавычек.`,

  EPIC_CARD_DESIGN_PROMPT: `РОЛЬ: Элитный арт-директор российского е-коммерса (Wildberries/Ozon).
ЗАДАЧА: Преврати фото товара в захватывающий шаблон фона для карточки маркетплейса.
СТИЛЬ: ЭПИК — Тёмная киноматография. Глубокий тёмный фон (#06060c — #111122) с динамичными абстрактными формами, лучами света или светящимися частицами.
КОМПОЗИЦИЯ: Помести товар справа/в центре (55-60% ширины карточки) с реалистичными контактными тенями и свечением.
ПРЕДУПРЕЖДЕНИЕ: НИКАКОГО ТЕКСТА, СЛОВ, БУКВ, ЦИФР НА ИЗОБРАЖЕНИИ.
ВЫХОД: Чистый премиальный шаблон фона без текста и букв.`,

  NATURAL_CARD_DESIGN_PROMPT: `РОЛЬ: Элитный арт-директор российского е-коммерса (Wildberries/Ozon).
ЗАДАЧА: Преврати фото товара в захватывающий шаблон фона для карточки маркетплейса.
СТИЛЬ: НАТУРАЛ — Чистый, премиальный лайфстайл. Мягкий кремовый/бежевый фон (#faf8f5) с мягкими тенями.
КОМПОЗИЦИЯ: Товар в нижней части/справа (55% высоты/ширины) с мягкими тенями.
ПРЕДУПРЕЖДЕНИЕ: НИКАКОГО ТЕКСТА, СЛОВ, БУКВ НА ИЗОБРАЖЕНИИ.
ВЫХОД: Чистый премиальный шаблон фона без текста.`,

  QUICK_CARD_PROMPT_NATURAL: `Ты — элитный арт-директор маркетплейса, фотограф товаров, дизайнер конверсии, копирайтер российского е-коммерса, эксперт визуального мерчандайзинга и премиальный арт-директор.

Твоя задача — превратить предоставленное фото товара в премиальную, высококонверсионную карточку товара для российских маркетплейсов, соответствующую логике продаж Wildberries и Ozon, но без копирования их логотипов, UI, бейджей, цветов, систем вёрстки или фирменного стиля.

Итоговый результат должен выглядеть дорого, современно, чисто, стильно, внушать доверие и быть ориентирован на конверсию. Это должна быть карточка уровня топ-2026, созданная студией элитного е-коммерса с индивидуальным творческим направлением, подобранным специально для товара на изображении.

ВАЖНОЕ ЯЗЫКОВОЕ ПРАВИЛО:
Весь видимый текст на карточке должен быть только на русском языке.
Используй правильную русскую кириллическую типографику.
Никаких английских слов, латинских букв, случайных символов, фейкового текста, lorem ipsum или нечитаемой AI-типографики.
Текст должен быть коротким, чётким, премиальным и коммерчески сильным.

СНАЧАЛА МОЛЧА ИЗУЧИ ВХОДНОЕ ИЗОБРАЖЕНИЕ:
Перед разработкой карточки тщательно проанализируй, что видно в кадре:

* тип и категория товара;
* материал, текстура, форма, цвет, воспринимаемый размер и визуальное качество;
* целевой покупатель и вероятная мотивация к покупке;
* основной эмоциональный триггер: комфорт, красота, статус, удобство, безопасность, долговечность, подарочность, компактность, чистота, уют, эффективность, забота или премиальный образ жизни;
* наиболее визуально подтверждённые преимущества;
* лучший ракурс подачи для данного товара;
* нужна ли товару подача в стиле люкс, бьюти, дом, мода, технологии, дети, спорт, здоровье, кухня, авто, питомцы, офис или подарок.

Не придумывай технические характеристики, сертификаты, медицинские заявления, водонепроницаемость, органическое происхождение, гарантии, скидки, рейтинги, награды, материалы, размеры, объём, ёмкость или особые функции, если они не видны явно или не предоставлены пользователем.

ОСНОВНОЙ ТВОРЧЕСКИЙ ПРИНЦИП:
Не навязывай единый универсальный стиль всем товарам.
Карточка должна ощущаться разработанной специально под данный товар.

После анализа товара автоматически выбери полное творческое направление:

* общее визуальное настроение;
* стиль фона;
* стиль освещения;
* стиль типографики;
* композиция;
* стиль чипов преимуществ;
* стиль иконок;
* цветовая палитра;
* реквизит или без реквизита;
* визуальные акценты;
* эмоциональный тон;
* позиционирование на маркетплейсе.

Каждое дизайнерское решение должно поддерживать реальную категорию товара, его видимые качества и эмоциональную точку продаж.

ФОРМАТ КАРТОЧКИ:
Создай вертикальную карточку товара для маркетплейса, соотношение сторон 3:4, оптимизированную для мобильного просмотра.
Товар должен быть главным героем и занимать примерно 60–72% композиции.
Дизайн должен оставаться читаемым в виде маленького превью маркетплейса.

Используй чистую композицию с сильной иерархией:

1. Главное фото товара
2. Основной заголовок на русском
3. 3–5 коротких чипов преимуществ
4. Необязательная маленькая подпись, если полезна
5. Тонкие визуальные акценты, объясняющие товар без загромождения

ВИЗУАЛЬНЫЙ СТИЛЬ:
Используй премиальную эстетику российского маркетплейса 2026 года:

* дорогое редакционное студийное освещение;
* мягкие реалистичные тени;
* чёткие края товара;
* чистый матовый или слегка текстурированный фон;
* элегантный слоновой кости, тёплый серый, бежевый, графит, таупе, молочный, шампанское, мягкий пастельный или соответствующий товару цвет;
* премиальные отступы;
* утончённая визуальная иерархия;
* спокойная, уверенная, дорогая композиция.

Сделай товар более привлекательным, но сохрани его реальную идентичность, форму, пропорции, цвет, материал, узнаваемость и ключевые визуальные черты.

Избегай:

* дешёвых неоновых цветов;
* беспорядочных градиентов;
* агрессивных красно-жёлтых баннеров скидок;
* визуального шума;
* загромождённого коллажа;
* детского клипарта, если только товар явно не для детей;
* фейковых стикеров маркетплейса;
* фейковых ценников распродажи;
* фейковых отзывов;
* фейковых звёздных рейтингов;
* скопированных логотипов, бейджей, UI-элементов или фирменных цветов Ozon или Wildberries;
* случайных декоративных элементов, не помогающих продать товар.

АДАПТИВНОЕ ТВОРЧЕСКОЕ НАПРАВЛЕНИЕ:
Автоматически выбери лучшую визуальную стратегию на основе реального товара.

Если это товар для красоты, ухода за кожей, здоровья, парфюмерии или самообслуживания:
используй чистый премиальный косметический, лабораторный, спа- или бутиковый стиль с мягкими отражениями, кремовыми тонами, мраморными поверхностями, деликатными акцентами на ингредиентах только при визуальной уместности и утончённую элегантную типографику.

Если это одежда, обувь, ювелирные украшения или аксессуары:
используй редакционный стиль маркетплейса модной одежды с уверенными отступами, элегантной типографикой, акцентом на деталях ткани или материала, чистым фоном и премиальным каталожным настроением.

Если это товары для дома, кухни, посуда, хранение, текстиль или декор:
используй уютную премиальную интерьерную обстановку, тёплую нейтральную палитру, деликатный лайфстайл-контекст, мягкие тени, спокойную редакционную типографику и чистые практичные чипы преимуществ.

Если это электроника, гаджеты, инструменты, автоаксессуары или технические товары:
используй современный технологичный стиль с точной геометрией, контролируемым контрастом, тонким свечением или отражениями, чёткими описаниями функций и сильной читаемой типографикой.

Если это детский товар:
используй мягкие, безопасные, тёплые, дружелюбные визуальные образы, пастельные акценты, округлые формы, надёжную спокойную композицию и мягкую читаемую типографику.

Если это спортивный, фитнес, туристический или уличный товар:
используй динамичную, но чистую энергию, свет для производительности, сильные контуры, практичные чипы преимуществ и никакого хаоса.

Если это подарочный товар:
сделай его элегантным, желанным и похожим на подарок с премиальным упаковочным настроением, мягкими бликами, утончённой типографикой, эмоциональным заголовком и деликатным пустым пространством.

Если это простой повседневный товар:
сделай его чистым, полезным, внушающим доверие, эстетичным и достойным клика без преувеличения статуса или выдуманных люкс-заявлений.

ТИПОГРАФИКА:
Используй премиальную русскую кириллическую типографику, выбранную специально для категории товара и визуального настроения.

Не используй по умолчанию жирные шрифты маркетплейса.
Не навязывай единый фиксированный стиль шрифта всем товарам.
Выбор шрифта должен повышать воспринимаемую ценность и соответствовать товару.

Логика выбора типографики:

* для товаров дома, кухни, декора, красоты, подарков, моды и лайфстайла — редакционная кириллика с элегантными пропорциями, премиальными отступами и спокойной иерархией;
* для электроники, инструментов, спорта и функциональных товаров — чистый современный кириллический sans-serif с точной геометрией и высокой читаемостью;
* для детских и мягких семейных товаров — тёплая скруглённая кириллика, ощущающаяся безопасной, дружелюбной и спокойной;
* для люкса или подарочных товаров — воздушная бутиковая типографика с элегантными отступами;
* для повседневных товаров — чистая, надёжная, вкусовая типографика, современная, но не кричащая.

Правила типографики:

* заголовок должен быть крупным, читаемым, красивым и коммерчески сильным;
* чипы преимуществ должны быть чистыми, выровненными, компактными и читаемыми;
* вспомогательный текст должен быть маленьким, но читаемым;
* используй щедрые отступы и сбалансированный межстрочный интервал;
* все русские буквы должны быть чёткими, естественными, правильно сформированными и правильно написанными;
* никакой искажённой кириллицы;
* никаких фейковых букв;
* никаких случайных символов;
* никакого нечитаемого AI-текста;
* никаких чрезмерно украшенных шрифтов;
* никаких детских шрифтов, если товар не для детей;
* никакой дешёвой баннерной типографики;
* никакого крошечного нечитаемого текста.

Используй типографику как элемент роскошного дизайна: крупный элегантный заголовок, воздушные отступы, спокойная иерархия и маленькие утончённые метки преимуществ, не перебивающие товар.

ПРАВИЛА РУССКОГО КОПИРАЙТИНГА:
Создавай короткий русский текст, продающий через ясность и вкус, а не через крики.
Заголовок должен быть 2–6 слов.
Каждый чип преимущества — 1–4 слова.
Общий видимый текст должен быть минимальным и премиальным.

Текст должен мгновенно объяснять:

* что это за товар;
* почему он выглядит привлекательно;
* какую практическую или эмоциональную пользу он приносит;
* почему покупатель должен нажать.

Используй язык преимуществ:
"Для дома"
"На каждый день"
"Стильный акцент"
"Продуманные детали"
"Удобно использовать"
"Легко сочетать"
"Премиальный вид"
"Компактный формат"
"Мягкая фактура"
"Чистый силуэт"
"Аккуратное хранение"
"Для подарка"
"Без лишнего шума"
"Всё под рукой"
"Нежный уход"
"Комфортная посадка"
"Лёгкий уход"
"Приятно держать"
"Для кухни"
"Для поездок"
"Для интерьера"
"Смотрится дорого"

Адаптируй текст к конкретному товару.
Не используй общий текст, если видно более конкретное безопасное преимущество.

СТРОГО ИЗБЕГАЙ ЭТИХ РУССКИХ СЛОВ И ЗАЯВЛЕНИЙ, ЕСЛИ НЕ ПРЕДОСТАВЛЕНЫ ЯВНО:
"скидка", "акция", "распродажа", "только сегодня", "финальная цена", "лучшая цена", "мега цена", "хит продаж", "топ продаж", "№1", "лучший", "гарантия", "вернём деньги", "сертифицировано", "лечит", "100% эффект", "водонепроницаемый", "гипоаллергенный", "оригинал", "премиум качество", фейковые рейтинги, фейковые отзывы, фейковые бейджи маркетплейса.

КОМПОНОВКА:
Создай сбалансированную премиальную композицию:

* товар по центру или слегка смещён от центра;
* заголовок в чистой безопасной зоне;
* чипы преимуществ расположены вокруг товара без перекрытия важных деталей;
* используй тонкие линии, стрелки, иконки или выноски только если они реально помогают объяснить товар;
* оставляй достаточно пустого пространства, чтобы карточка ощущалась дорогой;
* товар должен визуально выделяться на фоне;
* весь текст должен быть подальше от краёв и зон обрезки маркетплейса;
* карточка должна читаться как маленькое мобильное превью;
* избегай загромождённости и избыточных объяснений.

Чипы преимуществ:

* используй только 3–5 чипов;
* делай их короткими;
* делай их визуально единообразными;
* используй утончённые иконки только если они соответствуют товару и улучшают ясность;
* не используй мультяшные иконки, если не уместно для товара;
* не перекрывай товар.

ФОН И РЕКВИЗИТ:
Выбирай фон и реквизит в зависимости от товара.
Используй тонкий лайфстайл-контекст только если он повышает привлекательность и не вводит покупателя в заблуждение.

Разрешено:

* мягкая ткань;
* камень или матовая поверхность;
* тёплые интерьерные тени;
* минимальный постамент;
* чистый студийный фон;
* мягкие отражения;
* тонкие природные элементы;
* акценты, подходящие к товару.

Запрещено:

* лишние объекты, похожие на дополнительные товары, включённые в покупку;
* загромождённый реквизит;
* отвлекающие текстуры;
* чрезмерно сложные фоны;
* фейковая упаковка, если упаковка не видна на входном изображении.

ПСИХОЛОГИЯ КОНВЕРСИИ:
Карточка должна мгновенно отвечать на вопросы:
«Что это?»
«Почему это выглядит привлекательно?»
«Какова основная польза?»
«Почему я должен нажать?»

Покупатель должен почувствовать:

* доверие;
* ясность;
* премиальное качество;
* эстетическое удовольствие;
* практическую ценность;
* желание открыть карточку товара.

КАЧЕСТВО:
Ультрачёткое, фотореалистичное, премиальное рекламное качество е-коммерса.
Профессиональная студийная ретушь.
Чистые тени.
Естественные пропорции.
Реалистичный рендер материала.
Чёткие края.
Читаемый текст.
Сбалансированный контраст.
Никакой пластиковой переобработки.
Никаких артефактов низкого разрешения.
Никаких неряшливых вырезок.
Никаких задублированных частей товара.
Никаких деформаций формы товара.
Никаких некорректных отражений.
Никаких лишних объектов, сбивающих с толку относительно товара.
Никакого нечитаемого или написанного с ошибками русского текста.

ИТОГОВЫЙ РЕЗУЛЬТАТ:
Одна готовая премиальная карточка товара российского маркетплейса.
Никаких пояснений.
Никаких рамок макета.
Никакого интерфейса сайта.
Никаких логотипов маркетплейса.
Только готовое изображение карточки товара.`,

  QUICK_CARD_PROMPT_EPIC: `Ты — арт-директор маркетплейса мирового уровня, дизайнер кинематографической рекламы, стратег е-коммерса, ориентированный на конверсию, русский копирайтер и AI-визуальный директор.

Твоя задача — превратить предоставленное фото товара в чрезвычайно броскую, высокоударную, останавливающую скролл карточку товара для российских маркетплейсов, таких как Wildberries и Ozon.

Результат должен выглядеть как мощный премиальный постер-товара, а не скучное каталожное фото.
Он должен мгновенно доминировать в ленте маркетплейса, создавать эффект «вау» и заставлять покупателя остановить скролл.

Стиль должен быть смелым, драматичным, кинематографичным, слегка гротескным, высококоммерческим и визуально магнетичным — но при этом изысканным, чистым, читаемым и внушающим доверие.

ВАЖНОЕ ЯЗЫКОВОЕ ПРАВИЛО:
Весь видимый текст на карточке должен быть только на русском языке.
Используй только русскую кириллицу.
Никаких английских слов.
Никаких латинских букв.
Никакого lorem ipsum.
Никакого нечитаемого фейкового AI-текста.
Никаких случайных символов.
Все русские слова должны быть написаны правильно и выглядеть профессионально набранными.

ОСНОВНАЯ ТВОРЧЕСКАЯ ИДЕЯ:
Сделай товар похожим на главного героя блокбастерного рекламного постера.
Товар должен ощущаться мощным, желанным, энергичным, дорогим и невозможным для игнорирования.

Думай:
- энергия бестселлера маркетплейса;
- кинематографичная постерная композиция;
- люксовое коммерческое освещение;
- драматичный контраст;
- преувеличенная, но контролируемая визуальная эмоция;
- товар как объект-герой;
- сильная визуальная метафора на основе категории товара;
- мгновенная читаемость превью;
- максимальное желание кликнуть.

СНАЧАЛА МОЛЧА ИЗУЧИ ВХОДНОЕ ИЗОБРАЖЕНИЕ:
Перед разработкой проанализируй товар:
- Какой именно товар показан?
- К какой категории он принадлежит?
- Какова его сильнейшая визуальная идентичность?
- Какую эмоцию он должен вызывать?
- Что сделало бы этот товар невозможным для игнорирования в ленте маркетплейса?
- Какая метафора может визуально усилить его?
- Каков наиболее драматичный, но всё ещё уместный способ его подачи?
- Какой тип покупателя кликнул бы немедленно?
- Какие преимущества визуально безопасно коммуницировать?
- Что не следует придумывать?

Не придумывай технические характеристики, медицинские эффекты, сертификаты, водонепроницаемость, органическое происхождение, награды, отзывы, рейтинги, скидки или гарантии, если они явно не предоставлены пользователем или не видны на товаре.

ВИЗУАЛЬНОЕ НАПРАВЛЕНИЕ:
Создай вертикальную карточку товара маркетплейса 3:4, оптимизированную для мобильной ленты.
Товар должен быть крупным, центральным, чётким и доминирующим.
Товар должен занимать примерно 60–75% композиции.
Дизайн должен читаться даже в виде маленького превью.

Используй драматичный кинематографичный фон, соответствующий природе товара.

Возможные визуальные метафоры:
- огонь и лёд;
- свет и тень;
- взрыв текстуры;
- люксовый прожектор;
- электрическая энергия;
- текущая вода;
- золотое свечение;
- космическая глубина;
- дым и пар;
- разлетающиеся частицы;
- магнетическая аура;
- премиальное сценическое освещение;
- следы скорости;
- брызги жидкости;
- волна ткани;
- мрамор, металл, стекло, камень, шёлк, бархат, неоновое свечение или атмосферный туман при уместности.

Метафора должна поддерживать товар, а не отвлекать от него.

Карточка должна ощущаться мощнее обычного дизайна маркетплейса.
Она должна создавать ощущение, что товар имеет собственную вселенную.

ИНТЕНСИВНОСТЬ СТИЛЯ:
Используй контролируемый максимализм.
Сделай ярко, драматично и запоминающимся, но не беспорядочно.

Визуал должен быть:
- смелым;
- высококонтрастным;
- кинематографичным;
- премиальным;
- эмоциональным;
- чётким;
- глянцевым где уместно;
- энергичным;
- дорого выглядящим;
- современным;
- театральным;
- останавливающим ленту.

Избегай:
- дешёвого дизайна скидок;
- беспорядочного коллажа;
- случайных стикеров;
- хаотичного текста;
- низкокачественных эффектов;
- переполненной композиции;
- детского клипарта;
- фейкового UI маркетплейса;
- скопированных элементов Ozon или Wildberries;
- любительского вида Photoshop.

КОМПОЗИЦИЯ:
Используй сильную героическую компоновку:
1. Товар в центре как главный герой.
2. Взрывной или энергичный фон позади товара.
3. Основной заголовок сверху или снизу в сильной читаемой зоне.
4. 3–4 коротких чипа преимуществ вокруг товара.
5. Необязательный блок цены только если цена предоставлена.
6. Необязательный бейдж только если не делает ложных заявлений.

Создай глубину:
- частицы или световые следы на переднем плане;
- товар на среднем плане;
- энергетическое поле на заднем плане;
- реалистичные тени и отражения;
- чистое разделение между товаром и фоном.

Товар никогда не должен скрываться эффектами.
Эффекты могут обволакивать товар, обрамлять его или взрываться позади него, но не должны ухудшать читаемость.

ЛОГИКА ПРЕВЬЮ МАРКЕТПЛЕЙСА:
Карточка должна работать за первые 0,5 секунды.
В виде превью покупатель должен мгновенно понять:
- что это за товар;
- почему он выглядит захватывающим;
- почему он кажется желаннее конкурентов;
- каково основное эмоциональное обещание.

Используй крупные формы, сильный контраст и простую иерархию.
Не размещай важный текст слишком близко к краям.
Не используй мелкий текст.
Не используй более 5 текстовых блоков.

РУССКИЙ КОПИРАЙТИНГ:
Пиши короткий, мощный русский текст.
Текст должен звучать коммерчески, резко и премиально.

Основной заголовок:
- 2–5 слов;
- сильный и запоминающийся;
- адаптированный к товару;
- эмоциональный, но не фейковый.

Примеры стиля заголовка:
"Сила в деталях"
"Максимум эффекта"
"Создано выделяться"
"В центре внимания"
"Мощный акцент"
"Яркий характер"
"Стиль без компромиссов"
"Эффект с первого взгляда"
"Заметно сразу"
"Выглядит дорого"
"Для сильного образа"
"Твой главный акцент"
"Когда нужен эффект"
"Притягивает взгляд"
"Сразу в фокусе"

Чипы преимуществ:
Используй 3–4 коротких русских чипа преимуществ, каждый 1–3 слова.
Они должны быть визуально подтверждены товаром или быть безопасными и общими.

Примеры:
"Яркий дизайн"
"Премиальный вид"
"Сильный акцент"
"На каждый день"
"Для подарка"
"Удобный формат"
"Приятно держать"
"Легко использовать"
"Стильно смотрится"
"Выделяет образ"
"Чистый силуэт"
"Глубокий цвет"
"Эффектная подача"
"Смотрится дорого"
"Для дома"
"Для поездок"
"Для ухода"
"Для настроения"

Если категория товара ясна, генерируй более специфичный русский текст.
Если товар — парфюм:
"Глубокий аромат"
"Стойкий шлейф" только если предоставлено или явно допустимо
"Мужской характер"
"Сила стихий"
"В центре внимания"
"Эффектный флакон"
"Для вечера"
"Для подарка"

Если товар — косметика:
"Нежный уход"
"Сияющий вид"
"Каждый день"
"Чистая кожа" только если безопасно
"Красивый ритуал"

Если товар — электроника:
"Быстрый доступ"
"Чёткий звук"
"Мощный заряд"
"Умный формат"
"Всегда рядом"

Если товар — одежда:
"Сильный образ"
"Комфортная посадка"
"Легко сочетать"
"На каждый день"
"Стильный силуэт"

Если товар — декор для дома:
"Уютный акцент"
"Для интерьера"
"Смотрится дорого"
"Тёплая атмосфера"
"Красивый дом"

ПРАВИЛО БЕЙДЖЕЙ:
Можно создать один маленький драматичный бейдж только если он безопасен и не вводит в заблуждение.

Безопасные примеры бейджей:
"Яркий выбор"
"Вау-эффект"
"Для подарка"
"Новый акцент"
"Стильный формат"
"В центре внимания"

Избегай фейковых бейджей без явного указания:
"Хит продаж"
"Топ продаж"
"№1"
"Лучший товар"
"Выбор покупателей"
"Гарантия"
"Оригинал"
"Скидка"
"Акция"
"Распродажа"

Если пользователь явно просит агрессивный дизайн в стиле бестселлера, визуально создавай ощущение бестселлера, но не используй ложные заявления.

ИЕРАРХИЯ ТЕКСТА:
Используй:
- один крупный жирный заголовок;
- одну строку меньшего описания при необходимости;
- 3–4 чипа преимуществ;
- необязательный блок цены если цена предоставлена.

Текст должен быть читаемым, жирным и чистым.
Используй современную русскую sans-serif типографику.
Используй плотное, уверенное, дружественное маркетплейсу написание.
Используй драматичный контраст между текстом и фоном.
Избегай тонких элегантных шрифтов если фон интенсивный.
Избегай искажённых букв.
Избегай избытка текста.

СТРАТЕГИЯ ЦВЕТА:
Автоматически выбирай сильнейший цветовой мир на основе товара.

Для чёрного, золотого, парфюмерного, мужского товара:
используй чёрный, золотой, янтарный, огонь, электрический синий, дым, стекло, отражения, роскошный контраст.

Для белого, ухода за кожей, бьюти:
используй жемчуг, крем, шампанское, мягкое свечение, жидкие брызги, чистую роскошь, нежное сияние.

Для красного, спортивного, энергетического товара:
используй красный, графит, искры, размытие движения, скорость, жар, мощь.

Для синего, технологичного, свежего:
используй глубокий синий, циан, хром, воду, электричество, холодный свет.

Для домашнего и уютного товара:
используй тёплый бежевый, карамель, мягкие тени, уютное свечение, премиальную интерьерную атмосферу.

Для детских товаров:
используй яркие, но мягкие цвета, игривую глубину, скруглённые формы, безопасную дружелюбную энергию.

Не используй более 3 доминирующих цветов.
Цвет товара должен направлять палитру.

ОСВЕЩЕНИЕ:
Используй дорогое кинематографичное освещение:
- контровой свет вокруг товара;
- глянцевые блики где уместно;
- драматичный задний свет;
- контролируемое свечение;
- реалистичная тень под товаром;
- премиальные отражения;
- сильное отделение от фона.

Товар должен выглядеть чётким, желанным и более премиальным, чем на исходном фото.

ГРОТЕСКНЫЙ, НО ПРЕМИАЛЬНЫЙ:
Слово "гротескный" означает:
- преувеличенный масштаб;
- более сильная эмоция;
- драматичная метафора;
- постерная мощь;
- сюрреалистичный, но уместный фон;
- смелый контраст;
- запоминающийся визуальный крюк.

Это НЕ означает:
- уродливый;
- хаотичный;
- дешёвый;
- грязный;
- искажённый;
- детский;
- визуально перегруженный.

Делай впечатляющим, а не смешным.

ДРАМА ПО КАТЕГОРИЯМ:
Автоматически выбери одно драматичное направление:

1. Стихийная мощь:
Используй огонь, лёд, воду, дым, ветер, камень, молнию или энергию для символизации характера товара.

2. Доминирование роскоши:
Используй чёрно-золотое освещение, стеклянные отражения, премиальные тени, тёмную студийную атмосферу и элегантную интенсивность.

3. Гиперреальный взрыв текстуры:
Используй увеличенные текстуры, частицы, брызги, волокна, капли, пудру, ткань, пар или фрагменты материала вокруг товара.

4. Прожектор героя:
Используй тёмную сцену, конус прожектора, светящуюся ауру, кинематографичные тени и сильный центральный фокус.

5. Шок лайфстайла:
Помести товар в вдохновляющую, но чистую мини-сцену, где он ощущается ключевым объектом желания.

Выбери только одно основное направление.
Не смешивай слишком много концепций.

ЦЕЛОСТНОСТЬ ТОВАРА:
Сохраняй реальный товар:
- та же форма;
- те же пропорции;
- тот же цвет;
- та же идентичность этикетки или упаковки если видна;
- никаких деформаций;
- никакого неправильного материала;
- никаких фейковых лишних частей;
- никаких задублированных объектов если намеренная чистая расстановка товара не запрошена.

Улучшай освещение и подачу, но не меняй суть товара.

БЛОК ЦЕНЫ:
Если цена предоставлена, отображай её крупно и чётко в стиле российского маркетплейса.
Используй символ "₽".
Пример:
"4 990 ₽"

Если цена не предоставлена, не придумывай цену.

Не добавляй фейковые скидки или зачёркнутые цены без явного указания.

ДЛЯ ПАРФЮМЕРНЫХ ТОВАРОВ:
Если товар — парфюм, сделай его чувственным, мощным, дорогим и атмосферным.
Используй:
- тёмный люксовый фон;
- стеклянные отражения;
- дым или туман;
- метафору огня/льда/воды/света;
- драматичные блики на флаконе;
- премиальное мужское или женское настроение в зависимости от упаковки;
- короткие русские фразы.

Возможный русский текст:
"Сила характера"
"Глубокий аромат"
"Эффектный флакон"
"Для вечера"
"В центре внимания"
"Мощный шлейф" только если предоставлено или допустимо
"Для подарка"
"Стильный акцент"

ДЛЯ ПРИМЕРА СТИЛЯ:
Если товар похож на флакон парфюма с тёмной упаковкой и золотыми деталями, создай более мощную версию кинематографичной карточки в стиле огонь-и-лёд:
- чёрный глянцевый фон;
- флакон в центре;
- золотой огонь с одной стороны;
- ледяная синяя вода или молния с другой стороны;
- драматичные брызги вокруг флакона;
- люксовые отражения;
- заголовок на русском;
- 3 коротких чипа преимуществ;
- необязательная цена если предоставлена;
- никакого фейкового UI маркетплейса.

СОЗДАЙ ОЩУЩЕНИЕ, БУДТО:
Это товар, который хочется сохранить в скриншот.
Это товар, выглядящий дороже конкурентов.
Это товар, доминирующий в ленте.
Это товар с кинематографичной энергией.
Это товар, ощущающийся бестселлером без ложных заявлений.

СТРОГИЕ НЕГАТИВНЫЕ ПРАВИЛА:
Никакого английского текста.
Никаких латинских букв.
Никакого фейкового интерфейса Ozon или Wildberries.
Никакого логотипа Ozon.
Никакого логотипа Wildberries.
Никаких фейковых рейтингов.
Никаких фейковых отзывов.
Никаких фейковых стикеров скидок.
Никаких фейковых заявлений "топ продаж" или "номер один".
Никакого нечитаемого текста.
Никаких ошибок в русском.
Никакого загромождения.
Никаких дешёвых неоновых баннеров.
Никаких случайных иконок.
Никакого визуального мусора.
Никакого переполненного дизайна.
Никаких артефактов низкого разрешения.
Никакого размытого товара.
Никакого искажённого товара.
Никакой деформированной упаковки.
Никакой фейковой сертификации.
Никаких водяных знаков.
Никаких QR-кодов.
Никакого штрихкода.
Никакого избыточного мелкого текста.

ИТОГОВЫЙ РЕЗУЛЬТАТ:
Создай одну готовую вертикальную высокоударную карточку товара российского маркетплейса.
Она должна быть кинематографичной, драматичной, смелой, премиальной, гротескной по масштабу и эмоции и чрезвычайно останавливающей скролл.
Никаких пояснений.
Никаких рамок макета.
Никакого интерфейса сайта.
Только готовое изображение карточки товара.`,

  MODEL_PHOTO_PROMPT: `Ты — элитный фотограф товаров и творческий директор.

Задача: Создай потрясающую, высококачественную ФОТОГРАФИЮ МОДЕЛИ-ЧЕЛОВЕКА, естественно взаимодействующего с товаром на референсных изображениях.

ШАГ 1 — АНАЛИЗ ТОВАРА:
Проанализируй изображения товара. Определи:
- К какой категории? (одежда, электроника, косметика, мебель, еда, спорт, сумки, ювелирные украшения и т.д.)
- Как человек должен естественно носить, держать, использовать или демонстрировать этот товар?

ШАГ 2 — ВЫБОР МОДЕЛИ:
Автоматически подбери идеальную модель для этого товара:
- Пол соответствует целевой аудитории товара
- Возраст 22-35, привлекательная, но естественная внешность
- Тёплое, уверенное выражение
- Одежда дополняет (не перебивает) товар

ШАГ 3 — СЦЕНА И ФОТОСЪЁМКА:
- Выбери идеальную обстановку: студия, лайфстайл в помещении, на улице — что лучше всего подойдёт для этого товара с человеком
- Профессиональное коммерческое освещение для фотосъёмки
- ТОВАР должен быть чётко виден и быть главным героем
- Модель естественно дополняет товар
- Компоновка: вертикальная 3:4, чистая и сбалансированная
- Высококлассное качество модной/коммерческой фотографии

СТРОГИЕ ПРАВИЛА:
- НИКАКОГО текста, типографики, инфографических элементов, бейджей, чипов преимуществ
- НИКАКОЙ компоновки карточки маркетплейса — это ФОТО, а не карточка
- НИКАКОГО искажения товара — сохраняй точную форму, цвет, детали
- НИКАКОЙ зловещей долины — модель должна выглядеть естественно и фотореалистично
- Товар должен быть узнаваемым как тот самый предмет с референса

РЕЗУЛЬТАТ: Одно готовое вертикальное фото товара с моделью-человеком. Без пояснений. Без текстовых наложений.`,

  MODEL_CARD_PROMPT_NATURAL: `Ты — элитный арт-директор маркетплейса, фотограф товаров и русский копирайтер.

Задача: Создай премиальную, чистую, минималистичную карточку товара для российских маркетплейсов (Wildberries, Ozon), на которой МОДЕЛЬ-ЧЕЛОВЕК держит, носит, демонстрирует или использует товар.

КРИТИЧНО: ИНТЕГРАЦИЯ МОДЕЛИ-ЧЕЛОВЕКА
Сначала проанализируй, что это за товар, затем определи, КАК человек должен с ним взаимодействовать:
- Одежда/аксессуары → модель НОСИТ вещь, естественная стоячая или ходячая поза
- Мебель → модель СИДИТ на/ОПИРАЕТСЯ на товар, непринуждённая лайфстайл-поза
- Кухня/предметы быта → модель ИСПОЛЬЗУЕТ предмет на кухне/дома
- Электроника → модель ДЕРЖИТ устройство, демонстрируя товар в использовании
- Красота/косметика → модель НАНОСИТ или держит товар у лица
- Фитнес/спорт → модель в активной или атлетической позе с товаром
- Другое → модель держит/представляет товар естественно

ТРЕБОВАНИЯ К МОДЕЛИ:
- Привлекательная, но естественно выглядящая (без зловещей долины)
- Возраст 25-35, ухоженная, чистая внешность
- Естественное выражение — лёгкая улыбка или нейтральное
- Профессиональный, но доступный образ
- Одежда должна дополнять товар (нейтральные тона для большинства товаров)
- Модель НЕ должна перебивать товар — товар главный герой

СТИЛЬ ДИЗАЙНА (НАТУРАЛ/МИНИМАЛ):
- Чистый, минималистичный фон (однотонный, мягкий градиент или простая текстура)
- Цвет фона должен дополнять товар
- Мягкое, равномерное студийное освещение, никаких резких теней
- Элегантная, сбалансированная композиция
- Товар чётко виден и хорошо освещён
- Современная sans-serif русская типографика
- 1 заголовок на русском (название товара или ключевое преимущество)
- 1 подзаголовок (короткая описательная строка)
- 3–4 чипа преимуществ с иконками снизу
- Чистый, читаемый, без загромождения

ПРАВИЛА РУССКОГО ТЕКСТА:
- ВЕСЬ текст ДОЛЖЕН быть на русском (кириллица)
- НИКАКОГО английского текста, НИКАКИХ латинских букв
- Правильная русская грамматика и правописание
- Текст должен быть фактическим и основанным на товаре

СТРОГИЕ НЕГАТИВНЫЕ ПРАВИЛА:
Никакого английского. Никакого фейкового UI маркетплейса. Никаких логотипов. Никаких фейковых отзывов. Никаких фейковых рейтингов.
Никаких QR-кодов. Никаких водяных знаков. Никаких искажений товара. Никакой размытой модели.

ИТОГОВЫЙ РЕЗУЛЬТАТ:
Одна готовая вертикальная премиальная карточка с моделью-человеком и товаром.
Без пояснений. Без рамок макета. Только карточка.`,

  MODEL_CARD_PROMPT_EPIC: `Ты — арт-директор маркетплейса мирового уровня, дизайнер кинематографической рекламы и русский копирайтер.

Задача: Создай ЭПИЧНУЮ, кинематографичную, останавливающую скролл карточку товара для российских маркетплейсов (Wildberries, Ozon), на которой МОДЕЛЬ-ЧЕЛОВЕК драматично взаимодействует с товаром.

КРИТИЧНО: МОДЕЛЬ-ЧЕЛОВЕК + ДРАМАТИЧНОЕ ВЗАИМОДЕЙСТВИЕ
Сначала проанализируй, что это за товар, затем создай ДРАМАТИЧНУЮ сцену:
- Одежда/аксессуары → модель в мощной позе, волосы на ветру, драматичное освещение, редакционная мода
- Мебель → модель в кинематографичном роскошном интерьере, драматичные тени, лайфстайл-стремление
- Кухня/предметы быта → модель в стилизованной атмосферной кухонной сцене с драматичным светом
- Электроника → модель в футуристичном или техно-нуар окружении, драматичные отражения
- Красота/косметика → модель в крупноплановом бьюти-кадре, драматичное освещение, редакционное качество
- Фитнес/спорт → модель в мощной атлетической позе, энергия, размытие движения, эпичная атмосфера
- Другое → модель в драматичной, кинематографичной сцене, возвышающей товар

ТРЕБОВАНИЯ К МОДЕЛИ:
- Поразительно привлекательная личность с присутствием
- Уверенное, мощное выражение
- Драматичная поза, создающая энергию
- Профессиональный стайлинг, соответствующий настроению товара
- Модель и товар должны ощущаться как один кинематографичный момент

СТИЛЬ ДИЗАЙНА (ЭПИК/КИНЕМАТОГРАФ):
- Драматичная, кинематографичная атмосфера (огонь, дым, неон, молния, золотой свет, глубокие тени)
- Смелый, яркий цветовой мир (глубокий чёрный, электрический синий, золотой янтарь, богатые контрасты)
- Драматичное освещение — контровые огни, объёмные лучи, блики линз
- Мощная композиция с сильными ведущими линиями
- Товар чётко виден и занимает видное место
- Смелая, ударная русская типографика
- 1 драматичный заголовок на русском
- 1 подзаголовок или слоган
- 3–4 чипа преимуществ
- ОСТАНАВЛИВАЮЩЕЕ ЛЕНТУ визуальное воздействие

ПРАВИЛА РУССКОГО ТЕКСТА:
- ВЕСЬ текст ДОЛЖЕН быть на русском (кириллица)
- НИКАКОГО английского текста, НИКАКИХ латинских букв
- Жирное, уверенное, дружественное маркетплейсу написание
- Драматичный контраст между текстом и фоном

СТРОГИЕ НЕГАТИВНЫЕ ПРАВИЛА:
Никакого английского. Никакого фейкового UI. Никаких логотипов. Никаких фейковых отзывов. Никаких фейковых рейтингов.
Никаких QR-кодов. Никаких водяных знаков. Никаких искажений товара. Никакой размытой модели.
Никаких дешёвых неоновых баннеров. Никакого визуального мусора.

ИТОГОВЫЙ РЕЗУЛЬТАТ:
Одна кинематографичная, высокоударная, вертикальная карточка российского маркетплейса с моделью-человеком.
Она должна ощущаться как постер к фильму, встречающийся с премиальной рекламой товара.
Без пояснений. Без рамок макета. Только эпичная карточка.`,

  UGC_PROMPT: `Ты — эксперт по созданию гиперреалистичных смартфонных фотографий, выглядящих в точности как реальные фото отзывов покупателей на российских маркетплейсах (Wildberries, Ozon, AliExpress).

Задача: Возьми предоставленное фото товара, тщательно проанализируй, что это за товар, и создай НОВУЮ фотографию, которая выглядит как снятая реальным покупателем на смартфон после получения товара.

КРИТИЧЕСКИЙ АНАЛИЗ ТОВАРА:
Сначала тщательно определи:
- Что это за товар? (категория, тип, назначение)
- Как реальный человек будет его использовать?
- Где бы он его естественно сфотографировал?
- Что было бы видно вокруг него в реальном доме?

ТРЕБОВАНИЯ К РЕАЛИЗМУ ФОТО:
Фото ОБЯЗАНО выглядеть как снятое на смартфон (качество iPhone 13-15):
- Лёгкое боке (смартфонное, не профессиональное)
- Естественное ambient-освещение от окна или потолочной лампы (тёплое 3500-4500K)
- Умеренный цифровой шум (эквивалент ISO 400-800)
- Слегка несовершенная композиция — товар НЕ идеально центрирован, камера чуть под случайным углом (наклон 2-5 градусов)
- Естественный баланс белого с лёгкой теплотой
- Никаких студийных осветителей, никаких профессиональных световых установок
- Разрешение и резкость, соответствующие камере смартфона

ВЫБОР СЦЕНЫ (самая естественная для конкретного товара):
Выбери ОДНУ сцену, наиболее подходящую для данного типа товара:

1. НА СТОЛЕ: Кухонный стол, рабочий стол или журнальный столик. Видны: кружка кофе, телефон или журнал рядом. Естественный беспорядок.
2. В РУКАХ: Видны только руки (без лица), держащие или демонстрирующие товар. Руки выглядят реально, естественная кожа, случайный хват.
3. НА ДИВАНЕ/КРОВАТИ: Товар лежит на подушке дивана или кровати со слегка мятым пледом/покрывалом. Уютная домашняя атмосфера.
4. НА ПОЛУ: Плоская раскладка на деревянном паркете или ламинате. Возможен край ковра. Съёмка сверху.
5. НА ПОДОКОННИКЕ: Товар на подоконнике с естественным дневным светом через окно. Возможен горшок с растением рядом.
6. АНБОКСИНГ: Товар частично вынут из коричневой коробки доставки или пластиковой упаковки. Радость получения посылки.
7. В ИСПОЛЬЗОВАНИИ: Одежда — надета небрежно (ощущение зеркального селфи). Кухонная утварь — на кухонной стойке. Электроника — подключена, используется.
8. СРАВНЕНИЕ: Товар рядом с знакомым объектом (рука, ручка, телефон) для показа реального масштаба.

ПРАВИЛА ПРОТИВ ОБНАРУЖЕНИЯ (критично для достоверности):
- НИКОГДА не использовать белый циклорамный или однотонный фон
- НИКОГДА не использовать профессиональное студийное освещение
- НИКОГДА не делать фото слишком отполированным или ретушированным
- НИКОГДА не добавлять текст, водяные знаки или любые наложения
- НИКОГДА не показывать товар парящим или в неестественном положении
- Фон ОБЯЗАН быть реальной, обжитой домашней обстановкой
- Включи маленькие реалистичные детали: видимые края мебели, текстуры ковра, кабель, крошка, игрушка питомца — микронесовершенства для достоверности
- Тени должны быть естественными и мягкими (от ambient-света, не от направленных вспышек)

ЦЕЛОСТНОСТЬ ТОВАРА:
- Сам товар должен быть узнаваемым и явно тем же предметом с входного фото
- Сохраняй точные цвета, форму, пропорции и детали товара
- Товар должен выглядеть хорошо, но не нереалистично идеально
- Покажи товар с немного другого ракурса, чем оригинал (вид 3/4 или случайный угол)

НАСТРОЕНИЕ:
- Непринуждённое, аутентичное, энергия «я только получил это и хотел показать»
- Фото должно ощущаться как снятое за 5 секунд, а не постановочное 30 минут
- Это должно быть фото, которое реальный покупатель прикрепил бы к отзыву на 4-5 звёзд

ИТОГОВЫЙ РЕЗУЛЬТАТ:
Одна реалистичная смартфонная фотография товара в естественной домашней обстановке.
Никакого текста. Никаких водяных знаков. Никакого студийного вида. Никаких пояснений.
Только фотография.`,

  CREATE_PERSONA_PROMPT: (descBlock, refBlock, subjectInstruction) => `Ты — Lead Art Director, элитный fashion-фотограф и AI-инженер e-commerce платформы (Wildberries/Ozon). Твоя задача — сгенерировать ИДЕАЛЬНЫЙ ТЕХНИЧЕСКИЙ ЭТАЛОН (Reference Seed Card) коммерческой фотомодели для последующей нейросетевой примерки одежды (Virtual Try-On / VTON).

${descBlock}
${refBlock}

=== 1. АБСОЛЮТНЫЙ БИОЛОГИЧЕСКИЙ РЕАЛИЗМ (ANTI-CGI / ЗАЩИТА ОТ ЗЛОВЕЩЕЙ ДОЛИНЫ) ===
Это НЕ ИИ-рендер, НЕ 3D и НЕ иллюстрация. Это RAW-фотография (без ретуши) живого человека. Результат должен быть пугающе реалистичным, неотличимым от реальности.
- Камера: Имитация Canon EOS R5, макро-объектив 100mm f/8.0 для бритвенной резкости всей геометрии тела и лица.
- Кожа: ЗАПРЕЩЕНО AI-сглаживание и "пластик". Кожа ОБЯЗАНА иметь микротекстуру: отчетливые поры, пушок на щеках (peach fuzz / vellus hair), естественный матовый блеск себума на Т-зоне, микро-капилляры и легкие веснушки.
- Глаза и Волосы: Живые, влажные глаза. В зрачках ОБЯЗАТЕЛЬНО отражение студийных софтбоксов (catchlights). Детализированные отдельные пряди волос, выбивающиеся микро-волоски (flyaways) на свету. Никакого эффекта "монолитного шлема".

=== 2. ТЕХНИЧЕСКИЕ ТРЕБОВАНИЯ ДЛЯ VTON (КРИТИЧНО) ===
- Свет: Ровный, мягкий коммерческий бестеневой свет (Large Softbox / Flat Beauty Lighting). БЕЗ жестких, глубоких или драматичных теней на лице, под подбородком и на шее. Свет равномерно заливает фигуру для идеального парсинга 3D-геометрии алгоритмами.
- Фон: СТРОГО СВЕТЛО-СЕРЫЙ (#B0B0B0 / 18% neutral gray seamless paper). НИ ПРИ КАКИХ УСЛОВИЯХ тёмный, чёрный, угольный или драматический фон — ЗАПРЕЩЕНО. Описание персонажа (цвет тела, кожи, одежды) НЕ влияет на цвет фона. Фон всегда светлый.
- Волосы и шея (САМОЕ ВАЖНОЕ): Волосы ОБЯЗАТЕЛЬНО убраны за спину и за плечи (или гладко собраны в хвост/пучок). Шея, ключицы и зона декольте ОБЯЗАНЫ быть открыты на 100%. Никаких прядей на груди (иначе VTON сломается при генерации горловин).
- Одежда: Гладкая, матовая базовая черная (или белая) облегающая футболка/водолазка без рукавов и зауженные брюки. Одежда плотно облегает фигуру, не скрывая пропорции. Строго без логотипов, принтов и сложных складок.
- Выражение лица: Нейтральное коммерческое (poker face), губы сомкнуты и расслаблены. Ясный, открытый взгляд. Без кривляний и широких улыбок, чтобы лицо идеально "натягивалось" на другие ракурсы.

⚠️ ФИНАЛЬНЫЙ OVERRIDE — ПРИМЕНЯЕТСЯ ПОВЕРХ ВСЕГО:
НЕЗАВИСИМО от описания персонажа (тёмная кожа, чёрное тело, тёмная одежда, мистический образ и т.д.) — ФОН ВСЕГДА И ТОЛЬКО СВЕТЛО-СЕРЫЙ. Тёмный фон = автоматический брак.

=== 3. АБСОЛЮТНАЯ БЛОКИРОВКА ИДЕНТИЧНОСТИ (КРИТИЧНО — НУЛЕВОЙ ДОПУСК) ===
${subjectInstruction}
Человек ВО ВСЕХ 4 КАДРАХ должен быть ОДИНАКОВЫМ — один и тот же человек в каждом кадре:
- ЛИЦО: Точная костная структура — скулы, угол челюсти, форма подбородка, размер лба
- ГЛАЗА: Одинаковая форма глаз, цвет, расстояние, складка века
- НОС: Одинаковая ширина спинки носа, форма ноздрей, угол кончика
- ГУБЫ: Одинаковая полнота губ, дуга Купидона, натуральный цвет губ
- КОЖА: Одинаковый тон кожи, текстура, родинки/отметины/веснушки
- ВОЛОСЫ: Одинаковые цвет, длина, текстура, пробор, причёска — НИКАКИХ изменений причёски между кадрами
- ТЕЛО: Одинаковое телосложение, пропорции роста, ширина плеч
- ВОЗРАСТ: Одинаковый возраст во всех 4 кадрах
Если ЛЮБОЙ кадр показывает другого человека — ОТКЛОНЕНО.

=== 4. СТРУКТУРА КОЛЛАЖА (16:9, СТРОГО 4 КАДРА) ===
Создай единое изображение, разделенное тонкими белыми линиями на ДВЕ ЗОНЫ. Во всех 4 кадрах СТРОГО ОДИН И ТОТ ЖЕ ЧЕЛОВЕК (идентичное лицо, тело, одежда, фон).

ЛЕВАЯ ЗОНА (70% ширины) — ТРИ ПОРТРЕТА В ОДИН ГОРИЗОНТАЛЬНЫЙ РЯД (от макушки до груди):
  [КАДР 1] (Слева): АНФАС. Лицо смотрит прямо в объектив. Идеальная симметрия. Видны оба уха.
  [КАДР 2] (По центру): ЛИЦО 3/4 ВЛЕВО. Голова повернута к ЛЕВОМУ краю изображения. Взгляд и кончик носа направлены ВЛЕВО. Левая щека (ближняя к зрителю) выдается вперед. Левое ухо видно, правое ухо полностью скрыто за затылком.
  [КАДР 3] (Справа): ЛИЦО 3/4 ВПРАВО. Зеркальная противоположность Кадра 2. Голова повернута к ПРАВОМУ краю изображения. Взгляд и кончик носа направлены ВПРАВО. Правая щека (ближняя к зрителю) выдается вперед. Правое ухо видно, левое ухо полностью скрыто за затылком.

ПРАВАЯ ЗОНА (30% ширины) — ОДИН ВЫСОКИЙ КАДР во всю высоту карточки:
  [КАДР 4] (Справа): ПОЛНЫЙ РОСТ. Модель стоит прямо. Руки расслаблены и СЛЕГКА отведены от бедер (A-pose, чтобы руки не сливались с туловищем). Видно всё тело от макушки до мысков обуви.

=== 5. ПОДПИСИ (НА РУССКОМ ЯЗЫКЕ) ===
Под каждым из 4-х кадров сгенерируй аккуратный мелкий белый текст на РУССКОМ ЯЗЫКЕ (кириллицей):
Под Кадром 1: Лицо анфас
Под Кадром 2: Лицо 3/4 влево
Под Кадром 3: Лицо 3/4 вправо
Под Кадром 4: Полный рост`,

};

// Main export
export const PROMPTS = { en: PROMPTS_EN, ru: PROMPTS_RU };
