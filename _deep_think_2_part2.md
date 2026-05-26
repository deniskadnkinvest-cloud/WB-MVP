# Deep Think — Часть 2/3: БАДы, Декор/Свечи, Продукты питания, Электроника

Ты — Senior AI Prompt Engineer. Это продолжение задачи по созданию системных промптов для предметной фотосъемки товаров.

## Контекст

Модель `nano-banana-2` (Imagen 3). Принимает промпт + фото товара → генерирует фотореалистичный снимок.

Мы используем XML-тегированную структуру промпта:

```
<system_directive> — роль и задача
<product_identity_lock> — сохранить товар 1:1 с фото (форма, этикетка, лого, цвет)
<material_rendering_directive> — рендеринг материалов ПО КАТЕГОРИИ
<scene_composition> — композиция: ${compositionPrompt}
<lighting_protocol> — освещение ПО КАТЕГОРИИ
<environment> — фон: ${bgPrompt}. Эффекты: ${effectPrompt}
<zero_invention_products> — запрет выдумывания
<output_rules> — только пиксели, без текста
```

## Задание

Напиши полные блоки `<material_rendering_directive>` и `<lighting_protocol>` для 4 категорий:

### 1. БАДы и витамины
Специфика: матовый/глянцевый пластик банок, чёткая типографика на этикетках, медицинская чистота, натуральные ингредиенты. Капсулы/таблетки как вспомогательные элементы.

Дай полный текст material_rendering_directive — описание материалов, как рендерить пластик банки, как обрабатывать этикетку с мелким текстом, как показать содержимое (капсулы, порошок).

Дай полный текст lighting_protocol — чистый медицинский свет, high-key, минимум теней, доверительная "клиническая" атмосфера.

### 2. Декор и свечи
Специфика: воск (парафин, соевый — разные текстуры), фитиль, стеклянная/керамическая ёмкость, тёплое свечение пламени, volumetric light. Уютная атмосфера.

material_rendering_directive — восковая текстура (матовая/полупрозрачная), subsurface scattering через воск, керамика/стекло банки, металлическая крышка.

lighting_protocol — warm candlelight (2700K-3000K), volumetric glow от пламени, мягкие длинные тени, intimate cozy atmosphere.

### 3. Продукты питания
Специфика: food styling, аппетитность, texture rendering (мёд = вязкий глянец, орехи = шероховатость, шоколад = tempered gloss). Упаковка + содержимое.

material_rendering_directive — food-grade rendering (аппетитные цвета, правильная температура, steam/condensation), packaging material (стекло банки, крафт-бумага, пластик), hero ingredient рядом.

lighting_protocol — тёплый hero light (3500K-4000K), backlight для steam/translucency, fill снизу для устранения "мертвых" теней, golden hour feel.

### 4. Электроника и чехлы
Специфика: идеальная геометрия (параллельные линии, острые грани), отражения на глянцевых поверхностях, текстура силикона/пластика/кожи чехлов, экран (если виден).

material_rendering_directive — hard surface rendering (zero distortion), reflection mapping на глянце, texture fidelity (силикон, карбон, кожа, пластик), edge highlights.

lighting_protocol — cool tech lighting (5000K-6500K), gradient backdrop, accent rim light для edge definition, controlled specular highlights.

### Формат ответа

Для каждой категории выдай:
1. Полный текст `<material_rendering_directive>` (5-8 строк)
2. Полный текст `<lighting_protocol>` (3-5 строк)
3. JavaScript-объект для маппинга:

```javascript
'categoryId': {
  materialDirective: `...`,
  lightingProtocol: `...`
}
```
