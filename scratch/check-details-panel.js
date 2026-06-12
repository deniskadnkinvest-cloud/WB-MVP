import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function checkDetailsPanel() {
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
      const context = browser.contexts()[0];
      page = await context.newPage();
    }

    console.log('🚀 Перехожу на https://seller-studio-ai.ru/...');
    await page.goto('https://seller-studio-ai.ru/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 4000));

    // 1. Открыть историю
    console.log('👉 Ищу кнопку "МОИ РАБОТЫ"...');
    const historyBtn = page.locator('button:has-text("МОИ РАБОТЫ")')
      .or(page.locator('button:has-text("Мои работы")'))
      .or(page.locator('.tab-btn:has-text("МОИ РАБОТЫ")'))
      .or(page.locator('text=/МОИ РАБОТЫ/i'))
      .first();

    if (await historyBtn.isVisible().catch(() => false)) {
      console.log('⚡ Кликаю "МОИ РАБОТЫ"...');
      await historyBtn.click();
      await new Promise(r => setTimeout(r, 3000));

      // 2. Кликнуть на первую карточку для открытия lightbox с деталями
      console.log('👉 Ищу первую карточку генерации...');
      const firstCard = page.locator('.history-card').first();
      
      if (await firstCard.isVisible().catch(() => false)) {
        console.log('⚡ Кликаю на первую карточку...');
        await firstCard.click();
        await new Promise(r => setTimeout(r, 2000));
        
        // 3. Скриншот lightbox с панелью деталей
        const screenshotPath = path.resolve(__dirname, '..', 'test-results/history_details_panel.png');
        await page.screenshot({ path: screenshotPath });
        console.log(`📸 Скриншот панели деталей: ${screenshotPath}`);
        
        // Проверить наличие панели деталей
        const detailsPanel = page.locator('.history-lightbox-details');
        const hasDetails = await detailsPanel.isVisible().catch(() => false);
        console.log(hasDetails ? '✅ Панель деталей найдена и отображается!' : '❌ Панель деталей НЕ найдена');
      } else {
        console.log('❌ Карточки генерации не найдены');
      }
    } else {
      console.log('❌ Кнопка "МОИ РАБОТЫ" не найдена');
    }
  } catch (err) {
    console.error('💥 Ошибка:', err.message);
  } finally {
    process.exit(0);
  }
}

checkDetailsPanel();
