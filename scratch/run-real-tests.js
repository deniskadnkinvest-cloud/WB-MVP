import { chromium } from '@playwright/test';
import { promises as fs } from 'fs';
import path from 'path';

async function run() {
  console.log('Connecting to Chrome at http://127.0.0.1:9222...');
  let browser;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    console.log('Successfully connected!');
    const contexts = browser.contexts();
    const page = contexts[0] && contexts[0].pages().length > 0 ? contexts[0].pages()[0] : await browser.newPage();
    
    const consoleErrors = [];
    page.on('console', msg => {
      console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`);
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => {
      console.error(`[BROWSER PAGE ERROR] ${err.message}`);
      consoleErrors.push(err.message);
    });

    console.log('Navigating to https://seller-studio-ai.ru...');
    await page.goto('https://seller-studio-ai.ru', { waitUntil: 'networkidle' });
    
    // Делаем скриншот начального состояния
    await page.screenshot({ path: 'test-results/01_login_page.png' });
    console.log('Initial screenshot saved.');

    // Проверяем, залогинены ли мы уже
    const subBadge = page.locator('.sub-badge');
    const isAlreadyLoggedIn = await subBadge.isVisible().catch(() => false);
    
    if (!isAlreadyLoggedIn) {
      console.log('Not logged in. Clicking "Попробовать без регистрации"...');
      const guestBtn = page.locator('button:has-text("Попробовать без регистрации")');
      if (await guestBtn.isVisible()) {
        await guestBtn.click();
        console.log('Clicked guest button, waiting for app to load...');
        await page.waitForSelector('.sub-badge', { timeout: 15000 });
        console.log('App loaded! Sub badge is visible.');
      } else {
        console.log('Guest button not visible. Maybe already loading?');
      }
    } else {
      console.log('Already logged in!');
    }
    
    // Ждем еще немного для рендеринга
    await page.waitForTimeout(3000);
    
    // Получаем текст подписки
    const badgeText = await subBadge.textContent();
    console.log(`Current subscription badge text: "${badgeText}"`);
    console.log(`Total console errors: ${consoleErrors.length}`);
    
    await page.screenshot({ path: 'test-results/02_dashboard_loaded.png', fullPage: true });
    console.log('Dashboard screenshot saved.');
    
    await browser.close();
  } catch (error) {
    console.error('Test run failed:', error);
    if (browser) await browser.close().catch(() => {});
  }
}

run();
