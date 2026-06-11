const { chromium } = require('playwright');
const path = require('path');

(async () => {
  console.log('Подключаюсь к Chrome на localhost:9222...');
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const defaultContext = browser.contexts()[0];
  const page = await defaultContext.newPage();
  
  const projectId = 'lord-f842d';
  const url = `https://console.firebase.google.com/project/${projectId}/authentication/settings`;
  
  console.log('Открываю страницу Authorized domains...');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);
  
  const screenshotPath = path.join(__dirname, 'firebase-screenshot.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Скриншот сохранен:', screenshotPath);
  console.log('URL после навигации:', page.url());
  
  await page.close();
})();
