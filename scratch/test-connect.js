import { chromium } from '@playwright/test';
import { promises as fs } from 'fs';
import path from 'path';

async function run() {
  console.log('Connecting to Chrome at http://127.0.0.1:9222...');
  try {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    console.log('Successfully connected!');
    const contexts = browser.contexts();
    console.log(`Found ${contexts.length} contexts.`);
    
    // Ищем или создаем страницу
    let page;
    if (contexts.length > 0) {
      const pages = contexts[0].pages();
      console.log(`Found ${pages.length} pages in the first context.`);
      // Попробуем найти страницу, где URL содержит seller-studio-ai.ru
      for (const p of pages) {
        const url = p.url();
        console.log(`- Page URL: ${url}`);
        if (url.includes('seller-studio-ai.ru')) {
          page = p;
          console.log(`Using existing page: ${url}`);
          break;
        }
      }
      if (!page && pages.length > 0) {
        page = pages[0];
      }
    }
    
    if (!page) {
      console.log('No pages found, creating a new context and page...');
      const context = await browser.newContext();
      page = await context.newPage();
    }
    
    // Делаем снимок текущего состояния
    await page.goto('https://seller-studio-ai.ru');
    await page.waitForLoadState('networkidle');
    
    const title = await page.title();
    console.log(`Page title: ${title}`);
    
    const screenshotPath = path.resolve('test-results/current-state.png');
    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath });
    console.log(`Screenshot saved to: ${screenshotPath}`);
    
    await browser.disconnect();
  } catch (error) {
    console.error('Connection failed:', error);
  }
}

run();
