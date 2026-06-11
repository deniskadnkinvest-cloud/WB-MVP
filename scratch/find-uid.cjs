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
    const url = `https://console.firebase.google.com/project/${projectId}/authentication/users`;
    
    console.log('Открываю список пользователей Firebase Auth...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    console.log('Жду загрузки таблицы пользователей (10 секунд)...');
    await page.waitForTimeout(10000);
    
    // Сделаем скриншот для визуального подтверждения
    const screenshotPath = path.join(__dirname, '..', 'firebase-users-check.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log('Скриншот сохранен:', screenshotPath);
    
    // Попробуем распарсить таблицу пользователей на странице
    const users = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tr'));
      return rows.map(row => {
        const cells = Array.from(row.querySelectorAll('td')).map(c => c.innerText.trim());
        return cells;
      }).filter(cells => cells.length > 0);
    });
    
    console.log('Найденные строки пользователей:');
    console.log(users);
    
    await page.close();
    await browser.close();
  } catch (err) {
    console.error('Ошибка:', err);
    if (browser) await browser.close();
  }
})();
