const { chromium } = require('playwright');
const path = require('path');

(async () => {
  let browser;
  try {
    console.log('Подключаюсь к Chrome на localhost:9222...');
    browser = await chromium.connectOverCDP('http://localhost:9222');
    const defaultContext = browser.contexts()[0];
    const page = await defaultContext.newPage();
    
    const projectId = 'lord-f842d';
    // Проверим пользователя SgY0ofXTI0RzHXGQUSBSBpy3QSv2
    const uid = 'SgY0ofXTI0RzHXGQUSBSBpy3QSv2';
    const url = `https://console.firebase.google.com/project/${projectId}/firestore/databases/-default-/data/users/${uid}`;
    
    console.log(`Открываю документ пользователя ${uid} в Firestore Console...`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    console.log('Жду загрузки данных Firestore (8 секунд)...');
    await page.waitForTimeout(8000);
    
    const screenshotPath = path.join(__dirname, '..', 'firestore-doc-check.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log('Скриншот сохранен:', screenshotPath);
    
    await page.close();
    await browser.close();
  } catch (err) {
    console.error('Ошибка:', err);
    if (browser) await browser.close();
  }
})();
