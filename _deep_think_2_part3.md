# Deep Think — Часть 3/3: Зоотовары, Канцелярия, Спорт + Интеграция в API

Ты — Senior AI Prompt Engineer. Финальная часть задачи по системным промптам для предметной фотосъемки.

## Контекст

Модель `nano-banana-2` (Imagen 3). XML-тегированная структура промпта с `<product_identity_lock>`, `<material_rendering_directive>`, `<lighting_protocol>`.

## Задание — Часть А: 3 категории

### 1. Зоотовары
Специфика: яркие упаковки, "милый" позитивный вайб, игрушки/лакомства/аксессуары для животных. Мягкие ткани, резина, пластик.

material_rendering_directive — soft plastics, plush fabric texture, rubber toys (matte/glossy), packaging с яркими иллюстрациями, натуральные ингредиенты корма.

lighting_protocol — тёплый soft diffused (4000K), cheerful bright feel, минимум драматических теней, "дружелюбная" атмосфера.

### 2. Канцелярия
Специфика: бумага (текстура, плотность), кожа обложки, металлическая фурнитура (кольца, застёжки), ткань корешка. Flat lay идеален.

material_rendering_directive — paper texture (grain, thickness, edge detail), leather/faux-leather cover (stitching, embossing), metal hardware (rings, clips), ink/writing if visible.

lighting_protocol — natural daylight (5500K), soft overhead from window-like source, minimal shadows for flat lay, clean workspace ambiance.

### 3. Спортивные товары
Специфика: технологичные материалы (неопрен, нейлон, EVA пена, резина, металл), динамика, энергия, текстура grip-поверхностей.

material_rendering_directive — technical material rendering (neoprene = matte stretch, EVA foam = cellular texture, rubber = grip pattern, nylon straps = woven texture, metal buckles = brushed/polished finish).

lighting_protocol — high-contrast dramatic (5000K key + warm fill), strong directional light для emphasis texture/grip, dynamic angle, "energetic" mood.

### Формат для каждой категории:
```javascript
'categoryId': {
  materialDirective: `...`,
  lightingProtocol: `...`
}
```

## Задание — Часть Б: Интеграция в API

Сейчас `api/generate-image.js` обрабатывает ВСЕ запросы через fashion-логику. Товарный промпт (`modelPreset: "cosmetic bottle..."`) подставляется как `[ACTOR_PROFILE]` в mannequin-промпт.

Нужно:

1. Фронтенд отправляет `isProductMode: true` + `categoryId: 'cosmetics'` в body запроса
2. В handler добавить ветку:

```javascript
if (isProductMode) {
  // Использовать buildProductPrompt() вместо buildMasterPrompt()
  const productPromptText = buildProductPrompt({
    categoryId,
    productPrompt: modelPreset, // описание товара
    compositionPrompt: posePreset, // композиция
    bgPrompt: backgroundPreset, // фон
    effectPrompt: customPoseText, // эффекты
    aspectRatio
  });
  // Изображения товара = garmentImages (те же поля)
  const resultUrl = await executeKieTask(productPromptText, imageInputs, 'nano-banana-2');
  // ...
}
```

3. Напиши конкретный diff — какие строки добавить/изменить в `api/generate-image.js`
4. Напиши изменения для `src/App.jsx` — добавить `isProductMode: true` и `categoryId` в body запроса
