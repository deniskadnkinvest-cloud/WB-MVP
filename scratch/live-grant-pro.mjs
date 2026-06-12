import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

async function grantPro() {
  console.log('🔌 Подключаюсь к Chrome на порту 9222...');
  let browser;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    let page = await browser.contexts()[0].newPage();
    
    console.log('🚀 Открываю Админку...');
    await page.goto('https://seller-studio-ai.ru/admin', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const email = 'deniskadnkinvest@gmail.com';
    console.log(`Ищу пользователя ${email}...`);
    
    // В админке есть кнопка "Пользователи" или "Выдать доступ"
    // Попробуем найти поле ввода для email или UID
    const input = page.locator('input[placeholder*="email"], input[placeholder*="ID"]');
    if (await input.count() > 0) {
       await input.first().fill(email);
       await page.waitForTimeout(1000);
    }
    
    // Выбираем PRO тариф
    const proBtn = page.locator('button', { hasText: 'PRO' }).or(page.locator('option', { hasText: 'PRO' }));
    if (await proBtn.count() > 0) {
       await proBtn.first().click();
    }
    
    // Нажимаем Выдать
    const grantBtn = page.locator('button', { hasText: /Выдать/i });
    if (await grantBtn.count() > 0) {
       await grantBtn.first().click();
       console.log('✅ Нажата кнопка Выдать доступ');
    }

    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-results/admin-grant.png' });
    console.log('📸 Скриншот админки сохранен');
  } catch (err) {
    console.error('💥 Ошибка:', err);
  } finally {
    if (browser) await browser.disconnect();
  }
}

grantPro();
