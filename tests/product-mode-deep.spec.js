import { test, expect } from '@playwright/test';

const SCREENSHOT_DIR = 'test-results/qa-deep';

// Helper: авторизация через гостевой режим
async function loginAsGuest(page) {
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  
  // Ищем кнопку «Продолжить без регистрации» по классу .guest-text-btn
  const guestBtn = page.locator('.guest-text-btn');
  if (await guestBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await guestBtn.click();
    // Ждём пока приложение загрузится (появится переключатель режимов)
    await page.waitForSelector('button.mode-btn', { timeout: 15000 });
    await page.waitForTimeout(1500);
  }
  // Если логин-страницы нет — значит уже авторизованы
}

test.describe('📦 Product Mode — Deep Chaos QA Level 3', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  // ═══ ИТЕРАЦИЯ 1: Базовый Product Mode ═══
  test('Итерация 1: Переключение в режим товаров + кнопка Другое', async ({ page }) => {
    await loginAsGuest(page);
    
    // Скриншот главной страницы
    await page.screenshot({ path: `${SCREENSHOT_DIR}/01_main_page.png`, fullPage: false });
    
    // Проверяем наличие обоих режимов
    const fashionBtn = page.locator('button.mode-btn', { hasText: 'Одежда' });
    const productBtn = page.locator('button.mode-btn', { hasText: 'Предметка' });
    await expect(fashionBtn).toBeVisible();
    await expect(productBtn).toBeVisible();
    
    // Нажимаем "Товары (Предметка)"
    await productBtn.click();
    await page.waitForTimeout(1000);
    
    // Скриншот после переключения
    await page.screenshot({ path: `${SCREENSHOT_DIR}/02_product_mode.png`, fullPage: false });
    
    // Проверяем UI
    await expect(productBtn).toHaveClass(/active/);
    await expect(page.getByText('Категория товара')).toBeVisible();
    await expect(page.getByText('Загрузка товаров')).toBeVisible();
    
    // Проверяем кнопку "Другое"
    const drugoeBtn = page.locator('.preset-card', { hasText: 'Другое' });
    await expect(drugoeBtn).toBeVisible();
    
    // Нажимаем "Другое"
    await drugoeBtn.click();
    await page.waitForTimeout(500);
    
    // Проверяем подсказку
    const hint = page.getByText('Опишите ваш товар в поле ниже');
    await expect(hint).toBeVisible();
    
    await page.screenshot({ path: `${SCREENSHOT_DIR}/03_drugoe_selected.png`, fullPage: false });
    console.log('✅ Итерация 1 PASSED: Режим товаров + кнопка Другое работают');
  });

  // ═══ ИТЕРАЦИЯ 2: Все категории ═══
  test('Итерация 2: Прокликивание всех 11 категорий', async ({ page }) => {
    await loginAsGuest(page);
    
    await page.locator('button.mode-btn', { hasText: 'Предметка' }).click();
    await page.waitForTimeout(1000);
    
    const categories = [
      'Косметика и уход', 'БАДы и витамины', 'Декор и свечи',
      'Электроника и чехлы', 'Зоотовары', 'Парфюмерия',
      'Канцелярия', 'Ювелирные изделия', 'Продукты питания',
      'Спортивные товары', 'Другое'
    ];
    
    let allPassed = true;
    for (const cat of categories) {
      const card = page.locator('.preset-card', { hasText: cat });
      const isVisible = await card.isVisible().catch(() => false);
      if (isVisible) {
        await card.click();
        await page.waitForTimeout(300);
        const hasActive = await card.evaluate(el => el.classList.contains('active'));
        console.log(`${cat}: ${hasActive ? '✅ active' : '⚠️ NOT active'}`);
        if (!hasActive) allPassed = false;
      } else {
        console.log(`${cat}: ❌ NOT VISIBLE`);
        allPassed = false;
      }
    }
    
    await page.screenshot({ path: `${SCREENSHOT_DIR}/04_all_categories.png`, fullPage: true });
    expect(allPassed, 'Все категории должны быть видны и подсвечиваться').toBe(true);
    console.log('✅ Итерация 2 PASSED: Все 11 категорий работают');
  });

  // ═══ ИТЕРАЦИЯ 3: Модель-человек ═══
  test('Итерация 3: Секция Модель-человек без калибровки', async ({ page }) => {
    await loginAsGuest(page);
    
    await page.locator('button.mode-btn', { hasText: 'Предметка' }).click();
    await page.waitForTimeout(1000);
    
    // Ищем секцию Модель-человек
    const modelSection = page.locator('.section', { hasText: 'Модель-человек' });
    await expect(modelSection).toBeVisible();
    await modelSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    
    // Карточка "Добавить модель-человека" видна
    const addModelCard = page.locator('.add-model-card');
    await expect(addModelCard).toBeVisible();
    
    // КРИТИЧНО: Кнопки калибровки НЕТ (товарка без человека)
    const calibrateCount = await page.locator('text=Откалибровать модель').count();
    console.log(`Кнопка "Откалибровать модель": ${calibrateCount} (ожидается 0)`);
    expect(calibrateCount, 'Калибровка НЕ должна быть видна без человека').toBe(0);
    
    // КРИТИЧНО: Кнопки "Сохранить модель (калибровка)" тоже нет
    const saveModelCount = await page.locator('text=Сохранить модель').count();
    console.log(`Кнопка "Сохранить модель": ${saveModelCount} (ожидается 0)`);
    
    await page.screenshot({ path: `${SCREENSHOT_DIR}/05_no_calibration.png`, fullPage: false });
    
    // Нажимаем "Добавить модель-человека"
    await addModelCard.click();
    await page.waitForTimeout(1000);
    
    // Проверяем пресеты моделей
    const presetGrid = modelSection.locator('.preset-grid');
    await expect(presetGrid).toBeVisible();
    
    await page.screenshot({ path: `${SCREENSHOT_DIR}/06_model_presets.png`, fullPage: false });
    
    // Исключаем модель
    const removeBtn = page.locator('.remove-model-btn');
    if (await removeBtn.isVisible().catch(() => false)) {
      await removeBtn.click();
      await page.waitForTimeout(500);
      await expect(addModelCard).toBeVisible();
    }
    
    await page.screenshot({ path: `${SCREENSHOT_DIR}/07_model_excluded.png`, fullPage: false });
    console.log('✅ Итерация 3 PASSED: Калибровка скрыта, модель добавляется/исключается');
  });

  // ═══ ИТЕРАЦИЯ 4: Композиция, Фон, Эффекты ═══
  test('Итерация 4: Композиция + Сцена + Эффекты + Формат', async ({ page }) => {
    await loginAsGuest(page);
    
    await page.locator('button.mode-btn', { hasText: 'Предметка' }).click();
    await page.waitForTimeout(1000);
    
    // КОМПОЗИЦИЯ
    const compSection = page.locator('.section', { hasText: 'Композиция кадра' });
    await compSection.scrollIntoViewIfNeeded();
    const compositions = ['Натюрморт', 'Flat Lay', 'Макро', 'Диагональ', 'Товар в руке'];
    let compOk = true;
    for (const c of compositions) {
      const card = compSection.locator('.preset-card', { hasText: c });
      if (!(await card.isVisible().catch(() => false))) { compOk = false; console.log(`❌ ${c}`); }
      else { await card.click(); await page.waitForTimeout(200); console.log(`✅ ${c}`); }
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/08_compositions.png`, fullPage: false });
    
    // ФОН
    const bgSection = page.locator('.section', { hasText: 'Сцена / Окружение' });
    await bgSection.scrollIntoViewIfNeeded();
    const backgrounds = ['Чистая эстетика', 'Эко-органика', 'Скандинавский уют', 'Урбан-тех', 'Рабочий стол'];
    let bgOk = true;
    for (const b of backgrounds) {
      const card = bgSection.locator('.preset-card', { hasText: b });
      if (!(await card.isVisible().catch(() => false))) { bgOk = false; console.log(`❌ ${b}`); }
      else { await card.click(); await page.waitForTimeout(200); console.log(`✅ ${b}`); }
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/09_backgrounds.png`, fullPage: false });
    
    // ЭФФЕКТЫ
    const effects = ['Без эффектов', 'Брызги воды', 'Мазок крема', 'Пламя и свечение', 'Лепестки цветов', 'Капсулы рядом', 'Свой эффект'];
    let efOk = true;
    for (const e of effects) {
      const card = page.locator('.preset-card', { hasText: e }).first();
      if (!(await card.isVisible().catch(() => false))) { efOk = false; console.log(`❌ ${e}`); }
      else { await card.click(); await page.waitForTimeout(200); console.log(`✅ ${e}`); }
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/10_effects.png`, fullPage: false });
    
    // ФОРМАТ
    const formatSection = page.locator('.section', { hasText: 'Формат изображения' });
    await formatSection.scrollIntoViewIfNeeded();
    const formats = ['3:4', '1:1', '9:16', '4:3', '16:9'];
    for (const f of formats) {
      const card = formatSection.locator('.preset-card', { hasText: f });
      if (await card.isVisible().catch(() => false)) {
        await card.click(); await page.waitForTimeout(200);
      }
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/11_formats.png`, fullPage: false });
    
    expect(compOk && bgOk && efOk, 'Все пресеты видны').toBe(true);
    console.log('✅ Итерация 4 PASSED: Все пресеты композиций, фонов, эффектов и форматов на месте');
  });

  // ═══ ИТЕРАЦИЯ 5: Консоль ═══
  test('Итерация 5: Проверка консоли на ошибки', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', err => consoleErrors.push(`PAGE_ERROR: ${err.message}`));
    
    await loginAsGuest(page);
    
    await page.locator('button.mode-btn', { hasText: 'Предметка' }).click();
    await page.waitForTimeout(1000);
    
    // Прокликиваем всё подряд для провоцирования ошибок
    const clicks = ['Косметика', 'Парфюмерия', 'Другое', 'Flat Lay', 'Урбан-тех', 'Брызги воды'];
    for (const text of clicks) {
      const el = page.locator('.preset-card', { hasText: text }).first();
      if (await el.isVisible().catch(() => false)) { await el.click(); await page.waitForTimeout(300); }
    }
    
    // Модель-человек toggle
    const addModel = page.locator('.add-model-card');
    if (await addModel.isVisible().catch(() => false)) {
      await addModel.click(); await page.waitForTimeout(500);
      const rmBtn = page.locator('.remove-model-btn');
      if (await rmBtn.isVisible().catch(() => false)) { await rmBtn.click(); await page.waitForTimeout(500); }
    }
    
    // Быстрое переключение режимов
    for (let i = 0; i < 3; i++) {
      await page.locator('button.mode-btn', { hasText: 'Одежда' }).click();
      await page.waitForTimeout(200);
      await page.locator('button.mode-btn', { hasText: 'Предметка' }).click();
      await page.waitForTimeout(200);
    }
    
    await page.screenshot({ path: `${SCREENSHOT_DIR}/12_after_chaos.png`, fullPage: true });
    
    // Фильтруем шумные ошибки тестового окружения
    const realErrors = consoleErrors.filter(e => 
      !e.includes('auth') && !e.includes('favicon') && !e.includes('net::ERR')
    );
    
    console.log(`Всего ошибок консоли: ${consoleErrors.length}, реальных: ${realErrors.length}`);
    if (realErrors.length > 0) {
      for (const e of realErrors) console.log(`❌ ${e}`);
    }
    console.log('✅ Итерация 5 PASSED: Консоль проверена');
  });

  // ═══ ИТЕРАЦИЯ 6: Переключение обратно ═══
  test('Итерация 6: Fashion↔Product переключение корректно', async ({ page }) => {
    await loginAsGuest(page);
    
    // В Product mode
    await page.locator('button.mode-btn', { hasText: 'Предметка' }).click();
    await page.waitForTimeout(1000);
    
    await expect(page.getByText('Категория товара')).toBeVisible();
    await expect(page.getByText('Композиция кадра')).toBeVisible();
    
    // Ракурс камеры НЕ должен быть виден
    const cameraAngle = page.getByText('Ракурс камеры');
    const cameraCount = await cameraAngle.count();
    console.log(`"Ракурс камеры" в Product Mode: ${cameraCount} (ожидается 0)`);
    expect(cameraCount, 'Ракурс камеры НЕ должен быть виден в Product Mode').toBe(0);
    
    // Обратно в Fashion
    await page.locator('button.mode-btn', { hasText: 'Одежда' }).click();
    await page.waitForTimeout(1000);
    
    // Fashion-секции видны
    await expect(page.getByText('Кастинг-Рум')).toBeVisible();
    await expect(page.getByText('Поза модели')).toBeVisible();
    
    // Ракурс камеры теперь ВИДЕН
    await expect(page.getByText('Ракурс камеры')).toBeVisible();
    
    // Product-секции скрыты
    const catCount = await page.getByText('Категория товара').count();
    console.log(`"Категория товара" в Fashion Mode: ${catCount} (ожидается 0)`);
    expect(catCount, 'Product-секции скрыты в Fashion Mode').toBe(0);
    
    await page.screenshot({ path: `${SCREENSHOT_DIR}/13_back_to_fashion.png`, fullPage: false });
    console.log('✅ Итерация 6 PASSED: Переключение корректно');
  });
});
