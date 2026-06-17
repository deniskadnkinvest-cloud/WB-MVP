// ═══════════════════════════════════════════
//  ПРЕСЕТЫ МОДЕЛЕЙ, ПОЗ, ФОНОВ И ФОРМАТОВ
//  для Virtual Try-On (PAN.X MVP)
// ═══════════════════════════════════════════

export const MODEL_PRESETS = [
  // ── Женщины ──
  {
    id: 'slavic_female',
    gender: 'female',
    label: 'Славянка',
    emoji: '🪆',
    prompt: '20-to-30-year-old Slavic female, authentic Eastern European phenotype, fair skin, natural structural beauty, high cheekbones',
  },
  {
    id: 'asian_female',
    gender: 'female',
    label: 'Азиатка',
    emoji: '🏯',
    prompt: '20-to-30-year-old Asian female, authentic East Asian phenotype, clear skin, natural beauty',
  },
  {
    id: 'european_female',
    gender: 'female',
    label: 'Европейка',
    emoji: '🏰',
    prompt: '20-to-30-year-old Western European female, classic European facial structure, fair skin, soft features',
  },
  {
    id: 'african_female',
    gender: 'female',
    label: 'Африканка',
    emoji: '🌍',
    prompt: '20-to-30-year-old African female, authentic Sub-Saharan phenotype, glowing dark skin, elegant features',
  },
  {
    id: 'latina_female',
    gender: 'female',
    label: 'Латина',
    emoji: '🌺',
    prompt: '20-to-30-year-old Latina female, olive skin, authentic Latin American phenotype, warm brown eyes',
  },
  // ── Мужчины ──
  {
    id: 'slavic_male',
    gender: 'male',
    label: 'Славянин',
    emoji: '🪆',
    prompt: '22-to-32-year-old Slavic male, authentic Eastern European phenotype, masculine structure, strong jawline',
  },
  {
    id: 'asian_male',
    gender: 'male',
    label: 'Азиат',
    emoji: '🏯',
    prompt: '22-to-32-year-old Asian male, authentic East Asian phenotype, modern aesthetic, styled dark hair',
  },
  {
    id: 'european_male',
    gender: 'male',
    label: 'Европеец',
    emoji: '🏰',
    prompt: '22-to-32-year-old Western European male, strong defined jawline, groomed hair',
  },
  {
    id: 'african_male',
    gender: 'male',
    label: 'Африканец',
    emoji: '🌍',
    prompt: '22-to-32-year-old African male, authentic Sub-Saharan phenotype, dark glowing skin, strong confident look',
  },
  {
    id: 'latino_male',
    gender: 'male',
    label: 'Латино',
    emoji: '🌺',
    prompt: '22-to-32-year-old Latino male, authentic Latin American phenotype, olive skin, sharp jawline',
  },
];

// ═══════════════════════════════════════════
//  Детальные настройки внешности модели
// ═══════════════════════════════════════════
export const getModelDetails = (gender) => ({
  bodyType: { 
    id: 'bodyType',
    label: 'Телосложение', 
    options: ['Худощавое', 'Спортивное', 'Среднее', 'Полное', 'Мускулистое'] 
  },
  hairColor: { 
    id: 'hairColor',
    label: 'Цвет волос', 
    options: gender === 'female' 
      ? ['Брюнетка', 'Шатенка', 'Блондинка', 'Рыжая', 'Чёрные', 'Седые'] 
      : ['Брюнет', 'Шатен', 'Блондин', 'Рыжий', 'Чёрные', 'Седые']
  },
  hairLength: { 
    id: 'hairLength',
    label: 'Длина волос', 
    options: gender === 'female'
      ? ['Короткие', 'Средние', 'Длинные', 'Бритая']
      : ['Короткие', 'Средние', 'Длинные', 'Бритый']
  },
  emotion: { 
    id: 'emotion',
    label: 'Эмоция', 
    options: gender === 'female'
      ? ['Нейтральная', 'Лёгкая улыбка', 'Серьёзная', 'Уверенная', 'Дерзкая']
      : ['Нейтральная', 'Лёгкая улыбка', 'Серьёзный', 'Уверенный', 'Дерзкий']
  },
  piercing: { 
    id: 'piercing',
    label: 'Пирсинг', 
    options: ['Нет', 'Уши', 'Нос', 'Уши + Нос'] 
  },
  tattoo: { 
    id: 'tattoo',
    label: 'Тату', 
    options: ['Нет', 'Минимализм', 'Рукав', 'Шея'] 
  },
});

export const POSE_PRESETS = [
  {
    id: 'front_standing',
    label: 'Прямо',
    emoji: '🧍',
    prompt: 'standing straight, confident posture, facing the camera directly, hands relaxed at sides',
  },
  {
    id: 'half_turn',
    label: 'Вполоборота',
    emoji: '↩️',
    prompt: 'standing at a 45-degree angle, slight body rotation, looking toward the camera over the shoulder',
  },
  {
    id: 'walking',
    label: 'В движении',
    emoji: '🚶',
    prompt: 'mid-stride dynamic walking pose, one foot forward, natural arm swing, confident stride',
  },
  {
    id: 'sitting',
    label: 'Сидя',
    emoji: '🪑',
    prompt: 'sitting on a minimalist stool, relaxed elegant posture, legs crossed, looking at the camera',
  },
  {
    id: 'leaning',
    label: 'Облокотившись',
    emoji: '🏙️',
    prompt: 'casually leaning against a plain wall, one leg bent, relaxed cool demeanor',
  },
  {
    id: 'hands_on_hips',
    label: 'Руки на бёдрах',
    emoji: '💃',
    prompt: 'standing with hands on hips, power pose, chest forward, confident commercial look',
  },
];

export const BACKGROUND_PRESETS = [
  {
    id: 'white_studio',
    label: 'Белая студия',
    emoji: '⬜',
    prompt: 'clean minimalist white cyclorama, professional studio environment',
  },
  {
    id: 'gray_studio',
    label: 'Серая студия',
    emoji: '🔘',
    prompt: 'neutral gray seamless backdrop, soft gradient lighting',
  },
  {
    id: 'urban_street',
    label: 'Улица',
    emoji: '🏙️',
    prompt: 'stylish urban street background, modern city architecture, natural daylight',
  },
  {
    id: 'moscow_street',
    label: 'Улицы Москвы',
    emoji: '🇷🇺',
    prompt: 'iconic Moscow street setting, historic russian architecture, stylish urban fashion background, natural daylight',
  },
  {
    id: 'milan_street',
    label: 'Улица Милана',
    emoji: '🇮🇹',
    prompt: 'elegant Milan street setting, Italian fashion district architecture, Via Montenapoleone luxury boutique facades, warm Mediterranean sunlight, cobblestone pavement, European high-fashion atmosphere',
  },
  {
    id: 'luxury_interior',
    label: 'Лакшери интерьер',
    emoji: '🏛️',
    prompt: 'luxury boutique interior, marble floors, elegant warm ambient lighting',
  },
  {
    id: 'nature',
    label: 'Природа',
    emoji: '🌿',
    prompt: 'lush green park setting, soft natural daylight filtering through trees, bokeh background',
  },
];

export const ASPECT_RATIOS = [
  { id: '3:4',  label: '3:4 — Wildberries / Ozon', icon: '📦' },
  { id: '1:1',  label: '1:1 — Instagram / Квадрат', icon: '📸' },
  { id: '9:16', label: '9:16 — Stories / Reels', icon: '📱' },
  { id: '4:3',  label: '4:3 — Горизонтальный', icon: '🖥️' },
  { id: '16:9', label: '16:9 — Широкий баннер', icon: '🎬' },
];

export const CAMERA_ANGLES = [
  { id: 'full_body',  label: 'В полный рост',                  prompt: 'full body shot' },
  { id: 'waist_up',   label: 'По пояс',                        prompt: 'medium shot, waist up' },
  { id: 'close_up',   label: 'Крупно (деталь)',                 prompt: 'close-up detail shot of the garment on body' },
];

// ═══════════════════════════════════════════
//  ПРЕСЕТЫ ДЛЯ ПРЕДМЕТНОЙ СЪЕМКИ ТОВАРОВ
// ═══════════════════════════════════════════

export const PRODUCT_CATEGORIES = [
  {
    id: 'cosmetics',
    label: 'Косметика и уход',
    emoji: '🧴',
    defaultPrompt: 'cosmetic bottle skincare container product packaging, glossy design, detailed'
  },
  {
    id: 'supplements',
    label: 'БАДы и витамины',
    emoji: '💊',
    defaultPrompt: 'supplement bottle capsule jar container, clean medical nutrition branding'
  },
  {
    id: 'decor_candles',
    label: 'Декор и свечи',
    emoji: '🕯️',
    defaultPrompt: 'scented wax candle in a glass jar, minimalist decor item'
  },
  {
    id: 'electronics',
    label: 'Электроника и чехлы',
    emoji: '📱',
    defaultPrompt: 'smartphone protective case premium tech accessory, perfect geometry'
  },
  {
    id: 'pet_supplies',
    label: 'Зоотовары',
    emoji: '🧸',
    defaultPrompt: 'pet toy organic cat dog product packaging pet accessory'
  },
  {
    id: 'fragrance',
    label: 'Парфюмерия',
    emoji: '💨',
    defaultPrompt: 'luxury perfume bottle fragrance container, elegant glass bottle with liquid inside, dramatic refraction, high-end'
  },
  {
    id: 'stationery',
    label: 'Канцелярия',
    emoji: '📔',
    defaultPrompt: 'elegant designer notebook diary, luxury planner journal on flat lay, premium paper texture'
  },
  {
    id: 'jewelry',
    label: 'Ювелирные изделия',
    emoji: '💎',
    defaultPrompt: 'fine diamond ring luxury jewelry, precious metal silver gold finish, sparkling gems close-up'
  },
  {
    id: 'food',
    label: 'Продукты питания',
    emoji: '🍯',
    defaultPrompt: 'premium organic food jar container, artisanal packaging, gourmet food ingredient'
  },
  {
    id: 'sports',
    label: 'Спортивные товары',
    emoji: '🧘',
    defaultPrompt: 'fitness yoga mat gym accessory product packaging, premium sports gear'
  }
];

export const PRODUCT_COMPOSITIONS = [
  {
    id: 'still_life',
    label: 'Натюрморт (Спереди)',
    emoji: '🖼️',
    prompt: 'front-facing product portrait, centered composition, eye-level camera, studio lighting'
  },
  {
    id: 'flat_lay',
    label: 'Flat Lay (Сверху)',
    emoji: '📐',
    prompt: 'flat lay overhead shot, top-down 90-degree perspective, geometrically aligned styling, clean layout'
  },
  {
    id: 'macro',
    label: 'Макро (Крупно)',
    emoji: '🔍',
    prompt: 'extreme close-up macro shot, shallow depth of field, razor-sharp focus on product details and labels, visible material texture'
  },
  {
    id: 'angled',
    label: 'Диагональ (3/4)',
    emoji: '📐',
    prompt: 'dynamic 3/4 perspective shot, angled side view, elegant volumetric lighting, dramatic depth of field'
  },
  {
    id: 'in_hand',
    label: 'Товар в руке',
    emoji: '🫱',
    prompt: 'a person\'s hand holding the product naturally, organic grip, showing product scale relative to hand, blurred cinematic background'
  }
];

export const PRODUCT_BACKGROUNDS = [
  {
    id: 'clean_beauty',
    label: 'Чистая эстетика',
    emoji: '⬜',
    prompt: 'clean minimalist studio backdrop, elegant marble podium platform, pastel color palette, soft luxury studio lighting'
  },
  {
    id: 'organic_eco',
    label: 'Эко-органика',
    emoji: '🌿',
    prompt: 'natural organic environment, wet stones, green moss patches, eucalyptus leaves, morning dew, soft sunlight filtering through leaves'
  },
  {
    id: 'cozy_scandi',
    label: 'Скандинавский уют',
    emoji: '🪵',
    prompt: 'cozy Scandinavian home interior, textured knitted blanket on background, soft warm fireplace glow, rustic wooden table surface'
  },
  {
    id: 'urban_tech',
    label: 'Урбан-тех',
    emoji: '🏙️',
    prompt: 'sleek cyber tech environment, dark concrete texture backdrop, subtle purple and cyan neon accent lighting, anodized metal pedestal'
  },
  {
    id: 'minimalist_desk',
    label: 'Рабочий стол',
    emoji: '💻',
    prompt: 'modern clean workspace desk, soft natural light, blurred computer keyboard and succulents on the background, light oak wood surface'
  }
];

export const PRODUCT_EFFECTS = [
  {
    id: 'none',
    label: 'Без эффектов',
    emoji: '❌',
    prompt: ''
  },
  {
    id: 'water_splash',
    label: 'Брызги воды',
    emoji: '💦',
    prompt: 'crisp water droplets and elegant dynamic water splashes colliding around the product, refractive light, clean commercial look'
  },
  {
    id: 'cream_swatch',
    label: 'Мазок крема',
    emoji: '🧴',
    prompt: 'elegant smooth textured cosmetic cream swatch smear and dollop next to the product, rich thick cream texture'
  },
  {
    id: 'candle_flame',
    label: 'Пламя и свечение',
    emoji: '🔥',
    prompt: 'warm ethereal volumetric glow emanating from behind and around the product, soft golden-amber light rays, radiant backlit halo effect, cinematic lens flare, no physical candle or fire source — pure luminous energy surrounding the product'
  },
  {
    id: 'flower_petals',
    label: 'Лепестки цветов',
    emoji: '🌸',
    prompt: 'delicate floating flower petals falling around the product, elegant soft focus, romantic commercial look'
  },
  {
    id: 'capsules',
    label: 'Капсулы рядом',
    emoji: '💊',
    prompt: 'a few scattered natural supplement capsules and tablets neatly placed next to the container, showing product content'
  },
  {
    id: 'custom',
    label: 'Свой эффект',
    emoji: '✍️',
    prompt: ''
  }
];

