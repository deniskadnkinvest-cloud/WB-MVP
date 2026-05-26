# Deep Think — Часть 1/3: Архитектура + Косметика, Парфюмерия, Ювелирка

Ты — Senior AI Prompt Engineer. Помоги создать систему промптов для предметной фотосъемки товаров.

## Контекст

У нас SaaS для селлеров маркетплейсов. Есть режим Fashion (примерка одежды) с элитной XML-промпт-системой. Нужно создать аналогичную для Product Mode (предметная съемка).

Модель: `nano-banana-2` (Imagen 3). Принимает промпт + фото товара → генерирует фотореалистичный снимок товара в новой сцене.

## Эталон — как устроены промпты для одежды

```
<system_directive>
ROLE: Elite CGI Compositor, Wardrobe Specialist.
TASK: "Mannequin-to-Life" texture transfer.
</system_directive>

<cognitive_override_protocol>
Исходный человек на фото = "пластиковый манекен" → модель НЕ копирует его черты.
</cognitive_override_protocol>

<phase_1_texture_extraction>
Извлечь одежду: цвет, крой, текстура, застёжки. ZERO INVENTION — не выдумывать элементы.
</phase_1_texture_extraction>

<phase_2_casting_the_living_actor>
Создать нового человека по текстовому описанию.
</phase_2_casting_the_living_actor>

<phase_3_final_composite>
Одеть нового человека. Физика ткани, поза, камера, окружение, освещение.
</phase_3_final_composite>
```

Ключевая идея: XML-теги структурируют мышление модели по фазам.

## Задание

### 1. Разработай общую XML-архитектуру для Product Mode

Для товаров нужна **ОБРАТНАЯ логика**: не "забудь исходника", а "ЗАПОМНИ товар 1:1". Предложи структуру:

- `<product_identity_lock>` — сохранить ТОЧНЫЙ вид товара с фото (форма, этикетка, цвет, лого, шрифт). Аналог cognitive_override, но наоборот.
- `<material_rendering_directive>` — рендеринг материалов по категории
- `<scene_composition>` — правила постановки сцены
- `<lighting_protocol>` — освещение под категорию
- `<zero_invention_products>` — запрет выдумывания элементов товара

### 2. Напиши JS-функцию `buildProductPrompt()`

```javascript
function buildProductPrompt({ categoryId, productPrompt, compositionPrompt, bgPrompt, effectPrompt, aspectRatio }) {
  // Возвращает полный XML-промпт
  // categoryId → специализированный блок material_rendering_directive
}
```

### 3. Напиши полные промпты для 3 категорий:

**Косметика и уход** — стеклянные/матовые поверхности, softbox beauty lighting, блики, отражения, чистые этикетки, subsurface scattering для кремов/жидкостей.

**Парфюмерия** — refraction через стекло и жидкость, каустики, luxury cinematic lighting, heavy bokeh, отражения на полированных поверхностях.

**Ювелирные изделия** — extreme macro, точечный свет для каустик от граней камней, metallic surface rendering (gold/silver/platinum), high-key vs dramatic lighting, micro-detail на гравировке.

Для каждой категории дай полный текст `<material_rendering_directive>`, который будет подставляться в функцию.

### 4. Выдай готовый код

Полная функция `buildProductPrompt()` с общей структурой + маппинг для 3 категорий. Код должен быть готов к копированию.
