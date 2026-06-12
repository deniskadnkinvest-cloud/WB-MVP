import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function checkHistory() {
  console.log('🔌 Подключаюсь к Chrome...');
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
      console.log('⚠️ Вкладка не найдена, открываю новую...');
      page = await browser.contexts()[0].newPage();
      await page.goto('https://seller-studio-ai.ru/', { waitUntil: 'domcontentloaded' });
    }

    console.log('🔄 Обновляю страницу в Chrome...');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000); // Даем время Firebase Auth восстановить сессию

    console.log('👉 Ищу кнопку "МОИ РАБОТЫ"...');
    const historyBtn = page.locator('button', { hasText: /МОИ РАБОТЫ/i }).or(page.locator('.tab-btn', { hasText: /МОИ РАБОТЫ/i })).or(page.locator('text=/МОИ РАБОТЫ/i')).first();
    
    if (await historyBtn.isVisible().catch(() => false)) {
      console.log('⚡ Кликаю на "МОИ РАБОТЫ"...');
      await historyBtn.click();
      await page.waitForTimeout(3000); // Ждем загрузки истории
      
      const screenshotPath = path.resolve(__dirname, '..', 'test-results/history_modal_check.png');
      await page.screenshot({ path: screenshotPath });
      console.log(`📸 Скриншот модалки сохранен в ${screenshotPath}`);
    } else {
      console.log('❌ Кнопка "МОИ РАБОТЫ" не найдена');
    }
  } catch (err) {
    console.error('💥 Ошибка:', err);
  } finally {
    if (browser) {
      console.log('🔌 Отключаюсь...');
      process.exit(0);
    }
  }
}

checkHistory();
