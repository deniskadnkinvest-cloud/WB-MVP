const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const defaultContext = browser.contexts()[0];
  const page = await defaultContext.newPage();
  
  const projectId = 'lord-f842d';
  
  console.log('Открываю список пользователей Firebase Auth...');
  await page.goto(`https://console.firebase.google.com/project/${projectId}/authentication/users`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);
  
  await page.screenshot({ path: path.join(__dirname, 'firebase-users.png'), fullPage: true });
  console.log('Скриншот списка пользователей сохранен');
  
  await page.close();
})();
