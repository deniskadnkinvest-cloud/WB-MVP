import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function checkHistory() {
  console.log('🔌 Подключаюсь к Chrome по CDP (порт 9222)...');
  let browser;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    
    let page = null;
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        const url = p.url();
        console.log(`🔍 Найдена вкладка: ${url}`);
        if (url.includes('seller-studio-ai.ru')) {
          page = p;
          break;
        }
      }
      if (page) break;
    }

    if (!page) {
      console.log('⚠️ Вкладка seller-studio-ai.ru не найдена. Открываю новую страницу...');
      const context = browser.contexts()[0] || await browser.newContext();
      page = await context.newPage();
    }

    console.log('🚀 Перехожу на главную страницу https://seller-studio-ai.ru/...');
    await page.goto('https://seller-studio-ai.ru/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    console.log('⏱️ Ожидаю 4 секунды для восстановления сессии Firebase Auth...');
    await new Promise(r => setTimeout(r, 4000));

    console.log('👉 Ищу кнопку "МОИ РАБОТЫ"...');
    // Попробуем найти кнопку по тексту в разных регистрах
    const historyBtn = page.locator('button:has-text("МОИ РАБОТЫ")')
      .or(page.locator('button:has-text("Мои работы")'))
      .or(page.locator('.tab-btn:has-text("МОИ РАБОТЫ")'))
      .or(page.locator('.tab-btn:has-text("Мои работы")'))
      .or(page.locator('text=/МОИ РАБОТЫ/i'))
      .first();

    if (await historyBtn.isVisible().catch(() => false)) {
      console.log('⚡ Кликаю на кнопку "МОИ РАБОТЫ"...');
      await historyBtn.click();
      
      console.log('⏱️ Ожидаю 4 секунды для загрузки истории...');
      await new Promise(r => setTimeout(r, 4000));
      
      const screenshotPath = path.resolve(__dirname, '..', 'test-results/history_modal_check.png');
      await page.screenshot({ path: screenshotPath });
      console.log(`📸 Скриншот успешно сохранен в: ${screenshotPath}`);
    } else {
      console.log('❌ Кнопка "МОИ РАБОТЫ" не обнаружена на странице.');
      const screenshotPath = path.resolve(__dirname, '..', 'test-results/history_error_state.png');
      await page.screenshot({ path: screenshotPath });
      console.log(`📸 Скриншот текущего состояния страницы сохранен в: ${screenshotPath}`);
    }
  } catch (err) {
    console.error('💥 Произошла ошибка во время E2E-теста:', err);
  } finally {
    if (browser) {
      console.log('🔌 Отключаюсь от Chrome (без закрытия браузера)...');
      // Используем disconnect() вместо close()
      await browser.disconnect();
    }
    process.exit(0);
  }
}

checkHistory();
