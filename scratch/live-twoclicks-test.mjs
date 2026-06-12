import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTwoClicksTest() {
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
    
    console.log(`\n\n======================================`);
    console.log(`🚀 ТЕСТ: В ДВА КЛИКА`);
    console.log(`======================================`);

    console.log('🔄 Загружаю страницу...');
    await page.goto('https://seller-studio-ai.ru/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    console.log('👉 Переключаюсь в режим "В ДВА КЛИКА"');
    await page.locator('button.mode-btn', { hasText: /В ДВА КЛИКА/i }).click();
    await page.waitForTimeout(1000);

    const filePath = path.resolve(__dirname, '..', 'public/examples/cards/natural-pajama-before.png');
    
    console.log(`📸 Загрузка фото: public/examples/cards/natural-pajama-before.png`);
    const fileInputs = await page.locator('input[type="file"]').all();
    if (fileInputs.length > 0) {
      await fileInputs[0].setInputFiles(filePath);
    } else {
      console.log('❌ Input file не найден');
      return;
    }
    
    console.log('⏳ Жду загрузку и обработку...');
    await page.waitForTimeout(5000);

    console.log('⚡ Нажимаю кнопку генерации...');
    const generateBtn = page.locator('button.generate-btn', { hasText: /Сгенерировать/ });
    
    if (await generateBtn.isVisible() && await generateBtn.isEnabled()) {
      await generateBtn.click();
      console.log('⏳ Генерация запущена! Жду результат (до 90 сек)...');
      
      let isDone = false;
      const startTime = Date.now();
      
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
         await page.waitForTimeout(3000);
      }

      await page.screenshot({ path: `test-results/twoclicks_test.png`, fullPage: true });
      console.log(`📸 Скриншот: test-results/twoclicks_test.png`);

    } else {
      console.log('❌ Кнопка генерации недоступна (disabled) или скрыта.');
    }
    
    console.log('\n✅ ТЕСТ В ДВА КЛИКА ЗАВЕРШЕН');
  } catch (err) {
    console.error('💥 Ошибка:', err);
  } finally {
    console.log('🔌 Отключаюсь...');
    process.exit(0);
  }
}

runTwoClicksTest();
