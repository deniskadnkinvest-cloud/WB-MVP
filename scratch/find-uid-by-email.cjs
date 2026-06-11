const { chromium } = require('playwright');
const path = require('path');

const emailToFind = 'deniskadnkinvest@gmail.com';

(async () => {
  let browser;
  try {
    console.log('Подключаюсь к Chrome на localhost:9222...');
    browser = await chromium.connectOverCDP('http://localhost:9222');
    const defaultContext = browser.contexts()[0];
    const page = await defaultContext.newPage();
    
    const projectId = 'lord-f842d';
    const url = `https://console.firebase.google.com/project/${projectId}/authentication/users`;
    
    console.log(`Открываю список пользователей Firebase Auth...`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    console.log('Жду загрузки страницы (6 секунд)...');
    await page.waitForTimeout(6000);
    
    // Ищем поле поиска пользователей (с более точным селектором)
    console.log('Ищу правильное поле поиска пользователей Auth...');
    const searchInput = page.locator('input[placeholder*="Search by email"]').or(page.locator('input[placeholder*="Search by email address"]')).first();
    
    if (await searchInput.isVisible().catch(() => false)) {
      console.log(`Ввожу email ${emailToFind} в поле поиска пользователей...`);
      await searchInput.click();
      await searchInput.fill(emailToFind);
      await page.keyboard.press('Enter');
      
      console.log('Жду результатов фильтрации (4 секунды)...');
      await page.waitForTimeout(4000);
      
      // Сделаем скриншот результатов поиска
      const screenshotPath = path.join(__dirname, '..', 'firebase-search-result.png');
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log('Скриншот результатов сохранен:', screenshotPath);
      
      // Парсим таблицу результатов
      const users = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('tr'));
        return rows.map(row => {
          const cells = Array.from(row.querySelectorAll('td')).map(c => c.innerText.trim());
          return cells;
        }).filter(cells => cells.length > 0);
      });
      
      console.log('Результаты поиска в таблице:');
      console.log(users);
      
      // Ищем строку с нашим email
      const matchedUser = users.find(u => u[0] === emailToFind);
      if (matchedUser) {
        // UID обычно в 4-й или 5-й колонке (индекс 4)
        const uid = matchedUser[4];
        console.log(`\n🎉 НАЙДЕН UID: ${uid}`);
      } else {
        console.log(`\n❌ Пользователь с email ${emailToFind} не найден в таблице результатов.`);
      }
    } else {
      console.log('❌ Не удалось найти правильное поле поиска. Делаю скриншот страницы для отладки.');
      const errScreenshotPath = path.join(__dirname, '..', 'firebase-search-error.png');
      await page.screenshot({ path: errScreenshotPath, fullPage: true });
      console.log('Скриншот сохранен:', errScreenshotPath);
    }
    
    await page.close();
    await browser.close();
  } catch (err) {
    console.error('Ошибка:', err);
    if (browser) await browser.close();
  }
})();
