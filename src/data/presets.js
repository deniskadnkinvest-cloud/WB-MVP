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
    label: 'Латиноамериканка',
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
    label: 'Латиноамериканец',
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
  { id: 'portrait',   label: 'Портрет / Макро (Крупный план)',  prompt: 'extreme close-up beauty portrait shot, macro lens, shallow depth of field, focus on face and jewelry/accessory detail, skin texture visible' },
];
