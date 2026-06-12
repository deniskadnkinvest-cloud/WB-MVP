import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runProductTests() {
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
      page = await browser.contexts()[0].newPage();
    }
    
    const tests = [
      {
        name: 'ЧАШКА',
        file: 'scratch/downloads/mug.jpg',
        category: 'Другое', // Посуды нет, выберем Другое
        bg: 'Скандинавский уют'
      },
      {
        name: 'ПАРФЮМ',
        file: 'scratch/downloads/perfume.jpg',
        category: 'Парфюмерия',
        bg: 'Чистая эстетика'
      },
      {
        name: 'КРОССОВОК',
        file: 'scratch/downloads/sneaker.jpg',
        category: 'Спортивные товары',
        bg: 'Урбан-тех'
      }
    ];

    for (const test of tests) {
      console.log(`\n\n======================================`);
      console.log(`🚀 ТЕСТ ПРЕДМЕТКИ: ${test.name}`);
      console.log(`======================================`);

      console.log('🔄 Загружаю страницу...');
      await page.goto('https://seller-studio-ai.ru/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);

      console.log('👉 Переключаюсь в режим "ПРЕДМЕТКА"');
      await page.locator('button.mode-btn', { hasText: /ПРЕДМЕТКА/i }).click();
      await page.waitForTimeout(1000);

      const filePath = path.resolve(__dirname, '..', test.file);
      if (!fs.existsSync(filePath)) {
        console.log(`❌ Файл не найден: ${filePath}`);
        continue;
      }

      console.log(`📸 Загрузка фото: ${test.file}`);
      const fileInputs = await page.locator('input[type="file"]').all();
      if (fileInputs.length > 0) {
        await fileInputs[0].setInputFiles(filePath);
      } else {
        console.log('❌ Input file не найден');
        continue;
      }
      
      console.log('⏳ Жду загрузку и обработку...');
      await page.waitForTimeout(5000); // Даем время на remove-bg

      console.log(`👉 Категория: ${test.category}`);
      const catBtn = page.locator('.preset-card', { hasText: test.category });
      if (await catBtn.isVisible().catch(()=>false)) await catBtn.click();
      await page.waitForTimeout(500);

      console.log(`👉 Фон: ${test.bg}`);
      const bgBtn = page.locator('.preset-card', { hasText: test.bg });
      if (await bgBtn.isVisible().catch(()=>false)) await bgBtn.click();
      await page.waitForTimeout(500);

      console.log('⚡ Нажимаю кнопку генерации...');
      const generateBtn = page.locator('button.generate-btn', { hasText: /Сгенерировать/ });
      
      if (await generateBtn.isVisible() && await generateBtn.isEnabled()) {
        await generateBtn.click();
        console.log('⏳ Генерация запущена! Жду результат (до 90 сек)...');
        
        let isDone = false;
        const startTime = Date.now();
        
        // Ждем появления текста "Готово!" или пока кнопка снова не станет содержать "Сгенерировать" и будет enabled
        while (Date.now() - startTime < 90000) {
          await page.waitForTimeout(2000);
          
          const readyText = page.locator('text=/Готово!/i');
          const isReadyVisible = await readyText.isVisible().catch(()=>false);
          
          const btnDisabled = await generateBtn.isDisabled().catch(()=>true);
          const btnText = await generateBtn.textContent().catch(()=>'');
          
          if (isReadyVisible || (!btnDisabled && btnText.includes('Сгенерировать'))) {
            isDone = true;
            console.log('✅ Генерация завершена!');
            break;
          }
        }

        if (!isDone) {
          console.log('⚠️ Таймаут ожидания. Делаю скриншот того, что есть.');
        } else {
           // Даем еще пару секунд на прогрузку картинок
           await page.waitForTimeout(3000);
        }

        const safeName = test.name.toLowerCase();
        await page.screenshot({ path: `test-results/product_test_${safeName}.png`, fullPage: true });
        console.log(`📸 Скриншот: test-results/product_test_${safeName}.png`);

      } else {
        console.log('❌ Кнопка генерации недоступна (disabled) или скрыта.');
      }
    }
    
    console.log('\n✅ ВСЕ ТЕСТЫ ПРЕДМЕТКИ ЗАВЕРШЕНЫ');
  } catch (err) {
    console.error('💥 Ошибка:', err);
  } finally {
    console.log('🔌 Отключаюсь...');
    process.exit(0);
  }
}

runProductTests();
