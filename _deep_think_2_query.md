# Deep Think запрос — Обдумывание проблемы

Ты — Senior AI Architect и ведущий инженер по Prompt Engineering для мультимодальных LLM. Используй режим глубокого обдумывания (Deep Think), чтобы помочь мне решить комплексную архитектурную задачу в VTON-MVP проекте.

У нас нет внешнего исследования — ты опираешься исключительно на свои знания и аналитические способности на **3 мая 2026**.

---

## 🏗️ Технический стек
- **Frontend:** React 19 + Vite 8, JavaScript (JSX), Framer Motion, vanilla CSS
- **Backend:** Vercel Serverless Functions (Node.js), API route `/api/generate-image.js`
- **ИИ/ML:** Google Gemini 3.1 Flash (модель `gemini-3.1-flash-image-preview`) — мы называем её «Nano Banano 2»
- **API:** `@google/genai` SDK
- **База данных:** Firebase Firestore + Firebase Storage
- **Хостинг:** Vercel (hobby plan, 60s function timeout)

## 🎯 Что мы хотим достичь

Наш проект — **Селлер-Студия** (Virtual Try-On для маркетплейсов). Пользователь:
1. Загружает фото своей одежды (вещь на человеке или манекене)
2. Выбирает характеристики модели: этнический пресет (Славянка, Азиатка...), телосложение, цвет волос, длину волос, эмоцию, пирсинг, тату
3. Нажимает «Сгенерировать» → получает профессиональное фото модели В ЭТОЙ одежде

**Конечная цель:** Каждая характеристика, которую пользователь выбрал кнопкой, ДОЛЖНА точно и стабильно отражаться в сгенерированном изображении. Также нужно добавить режим Beauty-ретуши и улучшить общую архитектуру промптов.

## 🔴 С чем мы столкнулись

### Проблема 1: Характеристики НЕ применяются стабильно
Когда пользователь выбирает «Мускулистое» — генерируется полная женщина. Когда выбирает тату «Шея» — тату отсутствует. Телосложение, тату, пирсинг — всё срабатывает нестабильно, Gemini часто игнорирует текстовые инструкции в пользу визуальных данных из фото одежды.

### Проблема 2: Однообразие генерации
Каждый пресет (например, «Славянка») генерирует почти одинаковое лицо раз за разом. Нет контролируемой вариативности — нужно, чтобы при одних и тех же настройках каждый раз генерировалось уникальное лицо, но с соблюдением всех выбранных параметров.

### Проблема 3: Нет режима Beauty
Сейчас есть глобальный SKIN_REALISM_PROMPT, который принудительно генерирует реалистичную кожу с порами, морщинами и неровностями. Но для e-commerce часто нужна «beauty-ретушь» — идеально гладкая кожа, ретушированное лицо, модельная внешность. Нужна кнопка-переключатель.

### Проблема 4: Архитектурные пробелы
- Промпты для пресетов слишком краткие
- DETAIL_TO_PROMPT работает как простой конкатенатор
- enhanceBodyMetrics на бэкенде и DETAIL_TO_PROMPT на фронте дублируют логику body type
- Нет механизма seed/variation для уникальности лиц

## 🔄 Что уже пробовали

1. **Простые однострочные описания** (`'muscular well-defined body'`) → Gemini игнорировал
2. **Расширенные описания с тегами** (`'BODY TYPE: muscular body with clearly visible...'`) → Частично помогло, но тело всё ещё подчиняется визуалу фото
3. **enhanceBodyMetrics** — дублирует фронт, приоритеты неочевидны
4. **Негативные ограничения** (`'absolutely NO tattoos'`) — Работает для запрета, но когда тату НУЖНА — она часто отсутствует
5. **Solid black box sanitization** — уничтожает лицо на фото одежды. Помогло с identity leak, но не решает body type leak

## 💻 Текущий код проекта

### Файл: `src/data/presets.js`
```javascript
export const MODEL_PRESETS = [
  {
    id: 'slavic_female', gender: 'female', label: 'Славянка', emoji: '🪆',
    prompt: '25-year-old Slavic female, fair skin, light eyes, soft facial features, natural beauty, high cheekbones',
  },
  {
    id: 'asian_female', gender: 'female', label: 'Азиатка', emoji: '🏯',
    prompt: '25-year-old Asian female, athletic build, natural makeup, clear skin, high cheekbones',
  },
  {
    id: 'european_female', gender: 'female', label: 'Европейка', emoji: '🏰',
    prompt: '25-year-old Western European female, slim build, light natural makeup, fair skin, soft features',
  },
  {
    id: 'african_female', gender: 'female', label: 'Африканка', emoji: '🌍',
    prompt: '25-year-old African female, athletic build, glowing dark skin, elegant features, natural beauty',
  },
  {
    id: 'latina_female', gender: 'female', label: 'Латиноамериканка', emoji: '🌺',
    prompt: '24-year-old Latina female, olive skin, dark wavy hair, warm brown eyes, natural radiant beauty',
  },
  {
    id: 'slavic_male', gender: 'male', label: 'Славянин', emoji: '🪆',
    prompt: '28-year-old Slavic male, fair skin, light eyes, strong jawline, clean shaven, athletic build',
  },
  {
    id: 'asian_male', gender: 'male', label: 'Азиат', emoji: '🏯',
    prompt: '26-year-old Asian male, slim fit build, clear skin, styled dark hair, modern K-fashion look',
  },
  {
    id: 'european_male', gender: 'male', label: 'Европеец', emoji: '🏰',
    prompt: '28-year-old Western European male, athletic build, clean shaven, strong jawline, groomed hair',
  },
  {
    id: 'african_male', gender: 'male', label: 'Африканец', emoji: '🌍',
    prompt: '27-year-old African male, athletic build, dark glowing skin, strong features, confident look',
  },
  {
    id: 'latino_male', gender: 'male', label: 'Латиноамериканец', emoji: '🌺',
    prompt: '27-year-old Latino male, olive skin, dark styled hair, warm brown eyes, sharp jawline',
  },
];

export const getModelDetails = (gender) => ({
  bodyType: { id: 'bodyType', label: 'Телосложение', options: ['Худощавое', 'Спортивное', 'Среднее', 'Полное', 'Мускулистое'] },
  hairColor: { id: 'hairColor', label: 'Цвет волос', 
    options: gender === 'female' ? ['Брюнетка', 'Шатенка', 'Блондинка', 'Рыжая', 'Чёрные', 'Седые'] : ['Брюнет', 'Шатен', 'Блондин', 'Рыжий', 'Чёрные', 'Седые'] },
  hairLength: { id: 'hairLength', label: 'Длина волос', 
    options: gender === 'female' ? ['Короткие', 'Средние', 'Длинные', 'Бритая'] : ['Короткие', 'Средние', 'Длинные', 'Бритый'] },
  emotion: { id: 'emotion', label: 'Эмоция', 
    options: gender === 'female' ? ['Нейтральная', 'Лёгкая улыбка', 'Серьёзная', 'Уверенная', 'Дерзкая'] : ['Нейтральная', 'Лёгкая улыбка', 'Серьёзный', 'Уверенный', 'Дерзкий'] },
  piercing: { id: 'piercing', label: 'Пирсинг', options: ['Нет', 'Уши', 'Нос', 'Уши + Нос'] },
  tattoo: { id: 'tattoo', label: 'Тату', options: ['Нет', 'Минимализм', 'Рукав', 'Шея'] },
});
```

### Файл: `src/App.jsx` — DETAIL_TO_PROMPT и buildDetailString
```javascript
  const DETAIL_TO_PROMPT = {
    'Худощавое': 'BODY TYPE: slim lean body with thin limbs, narrow bony shoulders, visible collarbones and wrist bones, very low body fat, elongated proportions, delicate frame. The person must look noticeably thin.',
    'Спортивное': 'BODY TYPE: athletic fit body with visibly toned muscles, defined arms and shoulders, flat toned stomach, healthy skin glow. Body of a person who exercises regularly. NOT overweight, NOT skinny.',
    'Среднее': 'BODY TYPE: average normal healthy body build, neither thin nor heavy, standard proportions, BMI 20-25.',
    'Полное': 'BODY TYPE: visibly overweight plus-size body, BMI 33+, large round belly, thick heavy arms and thighs, double chin, wide torso, US clothing size 2XL-3XL, heavy-set build with visible body fat and round full face.',
    'Мускулистое': 'BODY TYPE: muscular body with clearly visible muscle definition on arms, shoulders, chest and legs. Broad powerful shoulders, narrow waist (V-taper), low body fat 12-18%. Veins visible on forearms. Strong thick neck.',
    'Брюнетка': 'HAIR: rich dark brunette brown hair color',
    'Блондинка': 'HAIR: light golden blonde hair color',
    'Рыжая': 'HAIR: vibrant red-ginger copper hair color (clearly red, not brown)',
    'Чёрные': 'HAIR: jet black hair color, deep dark without any brown tint',
    'Седые': 'HAIR: natural silver-gray hair color suggesting age 50+',
    'Короткие': 'HAIR LENGTH: short hair above the ears, cropped close to the head',
    'Средние': 'HAIR LENGTH: medium-length hair reaching the shoulders',
    'Длинные': 'HAIR LENGTH: long flowing hair reaching well below the shoulders, past the chest',
    'Бритая': 'HAIR LENGTH: completely shaved bald head, no hair visible',
    'Нейтральная': 'EXPRESSION: neutral calm relaxed face, mouth closed, no smile, eyes looking directly at camera',
    'Лёгкая улыбка': 'EXPRESSION: gentle slight warm smile with lips slightly curved upward, soft friendly eyes',
    'Серьёзная': 'EXPRESSION: serious intense focused expression, strong direct eye contact, slight frown, no smile',
    'Уверенная': 'EXPRESSION: confident powerful self-assured expression, chin slightly raised, bold direct gaze, subtle commanding smile',
    'Дерзкая': 'EXPRESSION: bold edgy rebellious attitude, slightly squinted eyes, smirk, defiant look',
    'Уши': 'PIERCING: visible small metallic stud earrings in both earlobes, must be clearly visible',
    'Нос': 'PIERCING: visible small subtle nose ring or stud piercing on one nostril, must be clearly visible',
    'Уши + Нос': 'PIERCING: visible metallic stud earrings in both earlobes AND a small nose ring/stud on one nostril',
    'Минимализм': 'TATTOO (MANDATORY — MUST BE VISIBLE): small minimalist fine-line black ink tattoos on visible skin areas.',
    'Рукав': 'TATTOO (MANDATORY — MUST BE VISIBLE): full detailed tattoo sleeve covering one entire arm from shoulder to wrist.',
    'Шея': 'TATTOO (MANDATORY — MUST BE VISIBLE): prominent artistic tattoo on the neck/throat area with dark ink design.',
  };

  const buildDetailString = () => {
    const parts = [];
    Object.entries(modelDetails).forEach(([k, v]) => {
      if (v === 'Нет' || (Array.isArray(v) && v.length === 1 && v[0] === 'Нет')) {
        if (k === 'tattoo') parts.push('absolutely NO tattoos anywhere on the body, completely clean unmarked skin, zero ink');
        if (k === 'piercing') parts.push('absolutely NO piercings anywhere on the body or face');
        return;
      }
      if (!v) return;
      if (Array.isArray(v)) {
        v.filter(x => x !== 'Нет').forEach(item => parts.push(DETAIL_TO_PROMPT[item] || item));
      } else {
        parts.push(DETAIL_TO_PROMPT[v] || v);
      }
    });
    if (extraModelPrompt.trim()) parts.push(extraModelPrompt.trim());
    return parts.length ? `, ${parts.join(', ')}` : '';
  };
```

### Файл: `api/generate-image.js` — SKIN_REALISM_PROMPT
```javascript
const SKIN_REALISM_PROMPT = `SKIN & FACE ULTRA-REALISM DIRECTIVE (MANDATORY):
Render skin with extreme photographic authenticity: authentic pores, subtle texture variations, fine lines, micro-cracks, natural asymmetry, barely visible scars, vellus hair, and genuine surface irregularities. Render realistic skin material response — separation of matte and oily zones, natural specularity and micro-shadows — with zero smoothing, softening, or plastic artifacts.
Render eyes with high micro-detail fidelity: sharp iris texture, natural radial patterns, subtle chromatic variations, and correct subsurface scattering.
The final image must be INDISTINGUISHABLE from a real professional photograph taken by a human photographer.`;
```

### Файл: `api/generate-image.js` — enhanceBodyMetrics
```javascript
function enhanceBodyMetrics(preset, editCmd) {
  const combined = `${preset || ''} ${editCmd || ''}`.toLowerCase();
  let enhanced = preset || '';
  if (/(мускулист|muscul|bodybuilder|накачан|рельеф|toned|fitness)/i.test(combined)) {
    enhanced += ` | METRIC OVERRIDE: MUSCULAR ATHLETIC BODY. Clearly visible muscle definition...`;
  }
  else if (/(полн|plus.?size|curvy|толст|heavy|obese|fat|xxl|xl|крупн)/i.test(combined)) {
    enhanced += ` | METRIC OVERRIDE: CLINICAL OBESE BODY TYPE...`;
  }
  else if (/(спортивн|athletic|sporty|fit\b|sport)/i.test(combined)) {
    enhanced += ` | METRIC OVERRIDE: ATHLETIC FIT BODY...`;
  }
  else if (/(худ|slim|skinny|petite|thin|строй)/i.test(combined)) {
    enhanced += ` | METRIC OVERRIDE: SLIM SLENDER BODY...`;
  }
  else if (/(средн|average|normal|regular)/i.test(combined)) {
    enhanced += ` | METRIC OVERRIDE: AVERAGE NORMAL BODY...`;
  }
  if (editCmd && editCmd.trim()) {
    enhanced += `\n🔴 PRIORITY EDIT OVERRIDE: "${editCmd.trim()}"...`;
  }
  return enhanced;
}
```

---

## 📋 Задание для тебя (Deep Think)

Включи режим глубокого обдумывания и выполни:

### 1. Диагностика
Проанализируй полный поток данных: DETAIL_TO_PROMPT (фронт) → modelPreset (API) → enhanceBodyMetrics (бэк) → buildMasterPrompt (финальный промпт). Определи, на каком уровне Gemini теряет информацию. Где именно нужно усилить текстовые сигналы?

### 2. Переписать ВСЕ характеристики (DETAIL_TO_PROMPT)
Для КАЖДОЙ характеристики — ПОЛНЫЙ переписанный промпт:
- Достаточно детальный, чтобы Gemini не проигнорировал
- Включает негативные ограничения
- Использует якорные фразы
- НЕ слишком конкретный — для уникальности лиц
- ВСЕ: bodyType (5), hairColor (12), hairLength (4+), emotion (5+), piercing (4), tattoo (4)

### 3. Режим Beauty (кнопка-переключатель)
- Реализм (по умолчанию) vs Beauty Mode
- Как передать флаг с фронта на бэк
- Написать SKIN_BEAUTY_PROMPT
- Предупреждение для пользователя

### 4. Контролируемая уникальность лиц
- Механизм variation для уникальных лиц
- Биометрический рандомизатор в промпте

### 5. Архитектурная оптимизация промптов
- Дублирование между фронтом и бэком
- Порядок блоков в SCHEMA
- Улучшенные MODEL_PRESETS

### 6. Пошаговый план внедрения

### 7. Готовый код для каждого файла:
- `src/data/presets.js`
- `src/App.jsx`
- `api/generate-image.js`
