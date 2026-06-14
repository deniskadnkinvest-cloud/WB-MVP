// ═══════════════════════════════════════════════════════════════
//  Промпты для Reve API — СЖАТЫЕ версии для карточек маркетплейса
//  Reve API имеет лимит на длину промпта (~2000 chars).
//  Эти промпты оптимизированы для максимального качества в пределах лимита.
// ═══════════════════════════════════════════════════════════════

export const NATURAL_CARD_PROMPT = `Create a premium vertical 3:4 Russian marketplace product card (Wildberries/Ozon style).

STYLE: Clean, expensive, editorial. Soft warm cream or off-white background (#faf8f5). Premium studio lighting, soft realistic shadows, crisp product edges. Elegant minimalist aesthetic — calm, confident, expensive.

LAYOUT:
- Product is the hero, occupying 60-70% of composition, centered or slightly off-center
- Large Russian headline (2-4 words) in premium typography — product name
- 3-5 short benefit chips (1-3 words each) with minimal icons around the product
- Optional small tagline
- Clean safe zones, generous spacing, no clutter

TEXT RULES (CRITICAL):
- ALL text must be in RUSSIAN CYRILLIC only
- NO English, NO Latin letters, NO fake text, NO lorem ipsum
- Correct Russian spelling, natural Cyrillic letterforms
- Headline: bold, large, readable (e.g. "Элегантный стакан", "Стильный аксессуар")
- Benefit chips: short phrases (e.g. "Прочное стекло", "Для дома", "Премиальный вид")

AVOID: price tags, discounts, fake ratings, fake badges, Ozon/WB logos, neon colors, clutter, English text.

QUALITY: Ultra-sharp photorealistic, studio retouching, clean shadows, no artifacts, no deformation.
OUTPUT: One finished polished product card image only. No frame, no mockup.`;

export const EPIC_CARD_PROMPT = `Create an extremely eye-catching, cinematic vertical 3:4 Russian marketplace product card.

STYLE: Bold, dramatic, high-impact poster. Dark cinematic background with dramatic lighting — rim light, backlight, controlled glow. Premium stage lighting, glossy highlights, strong product separation. The product must feel powerful and impossible to ignore.

VISUAL DRAMA: Choose ONE metaphor matching the product — fire/ice, light/shadow, texture explosion, luxury spotlight, electric energy, smoke/vapor, golden glow, or premium stage lighting. Effects wrap AROUND the product, never hiding it.

LAYOUT:
- Product centered as the main hero, 60-75% of composition
- Energetic background behind the product
- Large bold Russian headline (2-5 words) in strong readable zone
- 3-4 short benefit chips around the product
- Foreground particles or light streaks for depth

TEXT RULES (CRITICAL):
- ALL text in RUSSIAN CYRILLIC only
- NO English, NO Latin, NO fake text
- Correct Russian spelling, thick confident marketplace lettering
- Headline: strong, memorable (e.g. "Сила в деталях", "В центре внимания")
- Benefit chips: 1-3 words each (e.g. "Яркий дизайн", "Премиальный вид")

AVOID: price, discounts, fake ratings, Ozon/WB logos, clutter, cheap neon, English text.

QUALITY: Cinematic, photorealistic, sharp, glossy, dramatic contrast. No artifacts.
OUTPUT: One finished scroll-stopping product card only. No frame, no mockup.`;

// Динамические промпты с внедрением распознанных данных товара
export const getNaturalCardPrompt = (title, benefit, material, size) => {
  const t = title || 'СТИЛЬНЫЙ ТОВАР';
  const b = benefit || 'Премиум дизайн';
  const m = material || 'Высокое качество';
  const s = size ? `, "${size}"` : '';

  return `Create a premium vertical 3:4 Russian marketplace product card (Wildberries/Ozon style) for the product.

STYLE: Clean, expensive, editorial. Soft warm cream or off-white studio background (#faf8f5). Premium lighting, soft realistic shadows, crisp product edges. Elegant minimalist aesthetic.

LAYOUT: Product is the main hero (60-72% of composition), centered. Clean safe zones, generous spacing, no clutter.

TYPOGRAPHY & TEXT:
- ALL visible text must be in RUSSIAN CYRILLIC only (No English, no Latin, no fake letters).
- Main Headline (large, bold, readable): "${t.toUpperCase()}".
- 3-4 short benefit chips (1-3 words each in pill shapes or neat text blocks): "${b}", "${m}"${s}, "Премиум вид".

AVOID: price tags, discounts, fake ratings/badges, logos, neon colors, clutter, English text.

QUALITY: Ultra-sharp photorealistic, studio retouching, clean shadows, no artifacts, no deformation.
OUTPUT: One finished polished product card image only. No mockup frames.`;
};

export const getEpicCardPrompt = (title, benefit, material, size) => {
  const t = title || 'СТИЛЬНЫЙ ТОВАР';
  const b = benefit || 'Премиум дизайн';
  const m = material || 'Высокое качество';
  const s = size ? `, "${size}"` : '';

  return `Create a cinematic vertical 3:4 Russian marketplace product card.

STYLE: Bold, dramatic, high-impact poster. Dark cinematic background, dramatic lighting (rim light, backlight, controlled glow). Strong product separation. Visual metaphor matching the product (e.g. spotlight, elegant glow, stage lighting).

LAYOUT: Product centered as the main hero (60-75% of composition). Foreground particles or light streaks for depth.

TYPOGRAPHY & TEXT:
- ALL visible text must be in RUSSIAN CYRILLIC only (No English, no Latin, no fake letters).
- Main Headline (bold, strong, readable): "${t.toUpperCase()}".
- 3-4 short benefit chips around the product (1-3 words each): "${b}", "${m}"${s}, "Смотрится дорого".

AVOID: price, discounts, fake ratings/badges, logos, clutter, cheap neon, English text.

QUALITY: Cinematic, photorealistic, sharp, glossy, dramatic contrast. No artifacts.
OUTPUT: One finished scroll-stopping product card only. No mockup frames.`;
};
