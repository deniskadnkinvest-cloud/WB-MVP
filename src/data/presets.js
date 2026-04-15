// ═══════════════════════════════════════════
//  ПРЕСЕТЫ МОДЕЛЕЙ, ПОЗ, ФОНОВ И ФОРМАТОВ
//  для Virtual Try-On (PAN.X MVP)
// ═══════════════════════════════════════════

export const MODEL_PRESETS = [
  {
    id: 'asian_female',
    label: 'Азиатка',
    emoji: '🇯🇵',
    prompt: '25-year-old Asian female, athletic build, natural makeup, clear skin, high cheekbones',
  },
  {
    id: 'european_female',
    label: 'Европейка',
    emoji: '🇫🇷',
    prompt: '25-year-old European female, slim build, light natural makeup, fair skin, soft features',
  },
  {
    id: 'african_female',
    label: 'Африканка',
    emoji: '🌍',
    prompt: '25-year-old African female, athletic build, glowing dark skin, elegant features, natural beauty',
  },
  {
    id: 'european_male',
    label: 'Европеец',
    emoji: '🇬🇧',
    prompt: '28-year-old European male, athletic build, clean shaven, strong jawline, groomed hair',
  },
  {
    id: 'asian_male',
    label: 'Азиат',
    emoji: '🇰🇷',
    prompt: '26-year-old Asian male, slim fit build, clear skin, styled dark hair, modern K-fashion look',
  },
  {
    id: 'plus_size_female',
    label: 'Plus Size',
    emoji: '💎',
    prompt: '30-year-old female, plus size, curvy figure, confident posture, beautiful glowing skin, warm smile',
  },
  {
    id: 'athletic_male',
    label: 'Спортсмен',
    emoji: '💪',
    prompt: '27-year-old male, muscular athletic build, defined muscles, strong physique, intense gaze',
  },
  {
    id: 'latina_female',
    label: 'Латиноамериканка',
    emoji: '🇧🇷',
    prompt: '24-year-old Latina female, olive skin, dark wavy hair, warm brown eyes, natural radiant beauty',
  },
];

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
    label: 'Руки на бедрах',
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
  {
    id: 'milan_street',
    label: 'Улицы Милана',
    emoji: '🇮🇹',
    prompt: 'iconic Milan fashion district street, European architecture, golden hour warm lighting',
  },
];

export const ASPECT_RATIOS = [
  { id: '3:4',  label: '3:4 — Wildberries / Ozon', icon: '📦' },
  { id: '1:1',  label: '1:1 — Instagram / Квадрат', icon: '📸' },
  { id: '9:16', label: '9:16 — Stories / Reels', icon: '📱' },
  { id: '4:3',  label: '4:3 — Горизонтальный', icon: '🖥️' },
  { id: '16:9', label: '16:9 — Широкий баннер', icon: '🎬' },
];

export const GARMENT_TYPES = [
  { id: 'tshirt',    label: 'Футболка',     prompt: 'cotton t-shirt' },
  { id: 'hoodie',    label: 'Худи',         prompt: 'cotton hoodie with kangaroo pocket' },
  { id: 'jacket',    label: 'Куртка',       prompt: 'casual jacket' },
  { id: 'dress',     label: 'Платье',       prompt: 'elegant dress' },
  { id: 'pants',     label: 'Брюки',        prompt: 'fitted trousers' },
  { id: 'sweater',   label: 'Свитер',       prompt: 'knitted sweater' },
  { id: 'necklace',  label: 'Ожерелье',     prompt: 'delicate necklace jewelry, worn around the neck on collarbones' },
  { id: 'ring',      label: 'Кольцо',       prompt: 'ring jewelry on finger, precise scale' },
];

export const CAMERA_ANGLES = [
  { id: 'full_body',  label: 'В полный рост',  prompt: 'full body shot' },
  { id: 'waist_up',   label: 'По пояс',        prompt: 'medium shot, waist up' },
  { id: 'close_up',   label: 'Крупно (деталь)', prompt: 'close-up detail shot of the garment on body' },
];
