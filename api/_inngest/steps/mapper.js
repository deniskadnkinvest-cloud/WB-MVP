// ═══════════════════════════════════════════════════════════════
//  STEP 2: Core Brain — AI-Арт-Директор
//  Маппинг: классификация → поза, фон, модель
//  + Lookbook Seed Hashing (детерминированная рандомизация)
// ═══════════════════════════════════════════════════════════════
import { createHash } from 'crypto';

// ── Пулы моделей по "вайбам" каталога ──────────────────────
const VIBE_POOLS = {
  y2k_streetwear: {
    female: [
      { id: 'slavic_blonde', prompt: '20-to-28-year-old Slavic female, fair skin, blonde hair, high cheekbones, Y2K aesthetic' },
      { id: 'slavic_brunette', prompt: '20-to-28-year-old Slavic female, dark brunette hair, green eyes, natural beauty' },
      { id: 'asian', prompt: '20-to-28-year-old East Asian female, clear porcelain skin, sleek dark hair, modern K-beauty look' },
      { id: 'mixed', prompt: '20-to-28-year-old mixed-race female, warm olive skin, curly hair, striking features' },
    ],
    male: [
      { id: 'slavic_male', prompt: '22-to-30-year-old Slavic male, strong jawline, styled hair, streetwear model look' },
      { id: 'asian_male', prompt: '22-to-30-year-old East Asian male, clean-cut, styled dark hair, K-fashion aesthetic' },
      { id: 'european_male', prompt: '22-to-30-year-old Western European male, groomed stubble, confident look' },
      { id: 'mixed_male', prompt: '22-to-30-year-old mixed-race male, warm skin tone, athletic build, modern aesthetic' },
    ]
  },
  classic_elegant: {
    female: [
      { id: 'european_brunette', prompt: '22-to-32-year-old European female, classic beauty, dark hair, elegant features' },
      { id: 'african', prompt: '22-to-32-year-old African female, glowing dark skin, regal cheekbones, elegant presence' },
      { id: 'latina', prompt: '22-to-32-year-old Latina female, olive skin, warm brown eyes, sophisticated look' },
      { id: 'scandinavian', prompt: '22-to-32-year-old Scandinavian female, platinum blonde, ice-blue eyes, minimal makeup' },
    ],
    male: [
      { id: 'european_male', prompt: '25-to-35-year-old European male, defined jawline, dark hair, classic handsome look' },
      { id: 'african_male', prompt: '25-to-35-year-old African male, dark glowing skin, strong confident look, groomed' },
      { id: 'latino_male', prompt: '25-to-35-year-old Latino male, olive skin, sharp features, polished appearance' },
      { id: 'slavic_male', prompt: '25-to-35-year-old Slavic male, strong cheekbones, light eyes, refined aesthetic' },
    ]
  },
  sport_athleisure: {
    female: [
      { id: 'athletic_blonde', prompt: '20-to-28-year-old athletic female, toned body, blonde ponytail, sporty look' },
      { id: 'athletic_brunette', prompt: '20-to-28-year-old athletic female, dark hair, sports bra visible, fit physique' },
      { id: 'asian_fit', prompt: '20-to-28-year-old East Asian athletic female, lean toned body, yoga/fitness aesthetic' },
      { id: 'mixed_fit', prompt: '20-to-28-year-old mixed-race athletic female, strong defined body, activewear model' },
    ],
    male: [
      { id: 'athletic_male', prompt: '22-to-30-year-old athletic male, muscular build, short hair, fitness model look' },
      { id: 'slim_male', prompt: '22-to-30-year-old lean athletic male, runner build, modern sporty aesthetic' },
      { id: 'asian_fit_male', prompt: '22-to-30-year-old East Asian athletic male, toned build, minimalist sport look' },
      { id: 'dark_athletic', prompt: '22-to-30-year-old dark-skinned athletic male, powerful build, confident athlete' },
    ]
  }
};

// ── Маппинг: категория → допустимые позы ───────────────────
const POSE_MAP = {
  dress:    ['walking with natural arm swing', 'elegant standing with slight hip shift', 'standing with one hand on waist', 'twirling mid-motion showing dress flow'],
  jacket:   ['walking confidently, hands in jacket pockets', 'standing with collar popped up, confident look', 'casual lean against wall, one hand in pocket', 'standing dynamic, jacket unzipped'],
  't-shirt': ['casual relaxed standing, hands at sides', 'walking mid-stride, natural pose', 'standing with hands on hips, confident', 'leaning casually against a surface'],
  pants:    ['walking mid-stride showing pants movement', 'standing wide stance, showing full pant silhouette', 'seated on stool with legs crossed', 'standing straight, hands in pockets'],
  skirt:    ['walking naturally showing skirt flow', 'standing with slight hip shift', 'twirling to show skirt movement', 'elegant standing pose, front facing'],
  swimwear: ['standing full body stretch on beach', 'dynamic beach walking, arms relaxed', 'confident standing pose, hands on hips', 'walking along waterline, carefree'],
  sweater:  ['cozy standing, arms crossed loosely', 'walking naturally, relaxed pose', 'sitting casually, warm atmosphere', 'standing with hands in pockets'],
  hoodie:   ['streetwear stance, hood down, hands in kangaroo pocket', 'walking dynamically, urban setting', 'casual lean, relaxed confident look', 'standing with crossed arms'],
  coat:     ['walking confidently in coat, city street', 'standing elegantly, coat buttoned up', 'dynamic walking with coat flowing', 'standing, one hand holding coat collar'],
  shorts:   ['casual walking, summer vibe', 'standing relaxed, hands at sides', 'active sporty pose', 'sitting casually on outdoor surface'],
};

// ── Маппинг: сезон + стиль → описание фона ─────────────────
const BG_MAP = {
  'winter+streetwear':    'snowy urban city street, cold muted lighting, modern architecture, light snowfall',
  'winter+casual':        'cozy winter city park, bare trees, soft overcast lighting, urban benches',
  'winter+formal':        'elegant hotel lobby entrance, marble columns, warm interior lighting visible',
  'winter+sport':         'modern gym exterior, cold winter morning, city background',
  'winter+evening':       'upscale winter gala entrance, warm golden lighting, snow dusted steps',
  'summer+streetwear':    'vibrant summer city street, colorful graffiti walls, warm golden hour sunlight',
  'summer+casual':        'sun-drenched cafe terrace, Mediterranean feel, soft warm shadows, summer flowers',
  'summer+formal':        'elegant garden party setting, manicured hedges, dappled sunlight',
  'summer+sport':         'outdoor running track, bright sunny day, green grass, blue sky',
  'summer+evening':       'rooftop bar at sunset, city skyline, warm ambient string lights',
  'demi-season+streetwear': 'autumn city street, fallen leaves, warm golden light, modern urban setting',
  'demi-season+casual':    'park pathway in autumn, colorful leaves, soft natural daylight',
  'demi-season+formal':    'classic European city boulevard, elegant architecture, overcast sophisticated light',
  'demi-season+sport':     'outdoor yoga deck, morning mist, natural green setting',
  'demi-season+evening':   'theatre district at dusk, elegant city lights, sophisticated atmosphere',
  'all-season+streetwear': 'modern urban street, clean minimalist architecture, natural daylight',
  'all-season+casual':    'clean minimalist white cyclorama studio, professional soft lighting',
  'all-season+formal':    'minimalist studio with cyclorama, hard directional lighting, fashion editorial setup',
  'all-season+sport':     'modern fitness studio, clean equipment, bright even lighting',
  'all-season+evening':   'luxury boutique interior, marble floors, warm ambient lighting, elegant atmosphere',
};

// ── Цвета, которые конфликтуют (одежда и фон не должны сливаться) ──
const COLOR_CONFLICTS = {
  white: ['white', 'cyclorama', 'minimalist white'],
  black: ['dark', 'black'],
  navy: ['dark', 'night'],
  red: ['red'],
  green: ['green grass'],
  beige: ['beige', 'sand'],
};

// ═══════════════════════════════════════════════════════════════
//  ГЛАВНАЯ ФУНКЦИЯ: mapParameters
// ═══════════════════════════════════════════════════════════════
export function mapParameters(classification, skuId, vibeName = 'classic_elegant') {
  const { category, fit, seasonality, dominant_color, style, gender } = classification;

  // 1. Детерминированный выбор модели (Lookbook Seed Hashing)
  const vibePool = VIBE_POOLS[vibeName] || VIBE_POOLS.classic_elegant;
  const genderPool = vibePool[gender] || vibePool.female;
  const hash = createHash('md5').update(skuId).digest('hex');
  const modelIndex = parseInt(hash.substring(0, 8), 16) % genderPool.length;
  const selectedModel = genderPool[modelIndex];

  // 2. Выбор поз (2 случайных из допустимых для категории)
  const poses = POSE_MAP[category] || POSE_MAP['t-shirt'];
  const poseHash = parseInt(hash.substring(8, 16), 16);
  const poseIndex = poseHash % poses.length;
  const selectedPose = poses[poseIndex];

  // 3. Выбор фона по сезону + стилю
  const bgKey = `${seasonality}+${style}`;
  let selectedBg = BG_MAP[bgKey] || BG_MAP['all-season+casual'];

  // 4. Проверка цветовой гармонии
  const conflicts = COLOR_CONFLICTS[dominant_color?.toLowerCase()] || [];
  const hasConflict = conflicts.some(c => selectedBg.toLowerCase().includes(c));
  if (hasConflict) {
    // Переключаемся на нейтральный фон
    selectedBg = 'neutral gray seamless backdrop, soft gradient lighting, professional fashion studio';
  }

  return {
    model: selectedModel.id,
    modelPrompt: selectedModel.prompt,
    pose: selectedPose,
    background: selectedBg,
    gender,
    category,
    fit,
    seasonality,
    style,
    dominant_color,
  };
}
