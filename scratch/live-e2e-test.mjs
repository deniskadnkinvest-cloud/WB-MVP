import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTests() {
  console.log('🔌 Подключаюсь к Chrome на порту 9222...');
  let browser;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    
    let page = null;
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        if (p.url().includes('seller-studio-ai.ru')) { page = p; break; }
      }
      if (page) break;
    }

    if (!page) {
      console.log('⚠️ Страница не найдена, открываю новую...');
      page = await browser.contexts()[0].newPage();
      await page.goto('https://seller-studio-ai.ru', { waitUntil: 'domcontentloaded' });
    }

    console.log(`✅ Активная страница: ${page.url()}`);
    
    // Включаем логгирование консоли браузера
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.text().includes('GENERATION')) {
        console.log(`[Browser ${msg.type().toUpperCase()}] ${msg.text()}`);
      }
    });

    const rootDir = path.resolve(__dirname, '..');
    const tests = [
      {
        name: 'ОДЕЖДА',
        tabText: 'Одежда',
        file: 'public/examples/cards/epic-pajama-before.jpg',
        presetCategory: null,
        presetText: 'Славянка'
      },
      {
        name: 'ПРЕДМЕТКА',
        tabText: 'Предметка',
        file: 'public/examples/cards/epic-glass-before.jpg',
        presetCategory: 'Косметика и уход',
        presetText: 'Скандинавский уют'
      },
      {
        name: 'В ДВА КЛИКА',
        tabText: 'В два клика',
        file: 'public/examples/cards/natural-pajama-before.png',
        presetCategory: null,
        presetText: null
      }
    ];

    for (const test of tests) {
      console.log(`\n\n======================================`);
      console.log(`🚀 НАЧАЛО ТЕСТА: ${test.name}`);
      console.log(`======================================`);

      // 1. Выбираем вкладку режима
      console.log(`👉 Выбор режима: ${test.tabText}`);
      await page.locator('button.mode-btn', { hasText: test.tabText }).click();
      await page.waitForTimeout(1000);

      // 2. Загружаем файл
      console.log(`📸 Загрузка фото: ${test.file}`);
      const filePath = path.join(rootDir, test.file);
      
      // Ищем input file. В React компоненте их может быть несколько (например для лор)
      // Нам нужен первый видимый или основной в области загрузки
      const fileInputs = await page.locator('input[type="file"]').all();
      if (fileInputs.length > 0) {
        // Устанавливаем файл в первый input
        await fileInputs[0].setInputFiles(filePath);
      } else {
        console.log('❌ Input file не найден');
        continue;
      }
      
      console.log('⏳ Жду обработки загрузки фото...');
      await page.waitForTimeout(10000); // Ожидание загрузки и удаления фона (может занять время)

      // 3. Выбор пресетов (категория / фон / модель)
      if (test.presetCategory) {
        console.log(`👉 Выбор категории: ${test.presetCategory}`);
        const catBtn = page.locator('.preset-card', { hasText: test.presetCategory });
        if (await catBtn.isVisible().catch(()=>false)) await catBtn.click();
        await page.waitForTimeout(500);
      }

      if (test.presetText) {
        console.log(`👉 Выбор пресета: ${test.presetText}`);
        const presetBtn = page.locator('.preset-card, .preset', { hasText: test.presetText }).first();
        if (await presetBtn.isVisible().catch(()=>false)) await presetBtn.click();
        await page.waitForTimeout(500);
      }

      // 4. Запуск генерации
      console.log('⚡ Нажимаю кнопку генерации...');
      const generateBtn = page.locator('button.generate-btn', { hasText: /Сгенерировать|Создать/ }).first();
      
      if (await generateBtn.isVisible() && await generateBtn.isEnabled()) {
        await generateBtn.click();
        console.log('⏳ Генерация запущена! Жду результат (до 90 секунд)...');
        
        // Ждем пока кнопка снова не станет активной или не появится результат
        // В это время может крутиться лоадер
        const startTime = Date.now();
        let isDone = false;
        
        while (Date.now() - startTime < 90000) {
          await page.waitForTimeout(2000);
          
          // Проверяем наличие карточек результата
          const resultImagesCount = await page.locator('.result-image-wrap img, .result-section img').count();
          const btnText = await generateBtn.textContent().catch(()=>'');
          
          if (!btnText.includes('Сгенерировать') && !btnText.includes('Создать') && !btnText.includes('варианта') && !btnText.includes('кадр') && !btnText.includes('Создаём')) {
             // кнопка показывает процесс
          } else if (resultImagesCount > 0 && await generateBtn.isEnabled()) {
             isDone = true;
             console.log(`✅ Результат получен! Найдено изображений: ${resultImagesCount}`);
             break;
          }
        }

        if (!isDone) {
          console.log('⚠️ Таймаут ожидания генерации.');
        }

        const safeName = test.name.replace(/ /g, '_').toLowerCase();
        await page.screenshot({ path: `test-results/live_test_${safeName}.png`, fullPage: true });
        console.log(`📸 Сохранен скриншот: test-results/live_test_${safeName}.png`);

      } else {
        console.log('❌ Кнопка генерации недоступна (disabled) или скрыта.');
        await page.screenshot({ path: `test-results/live_test_${test.name.replace(/ /g, '_')}_error.png`, fullPage: true });
      }
      
      // Перезагрузка страницы перед следующим тестом для очистки стейта
      console.log('🔄 Перезагрузка страницы перед следующим тестом...');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
    }
    
    console.log('\n✅ ВСЕ ТЕСТЫ ЗАВЕРШЕНЫ');
  } catch (err) {
    console.error('💥 Ошибка в тестах:', err);
  } finally {
    console.log('🔌 Отключаюсь...');
    process.exit(0);
  }
}

runTests();
