const { chromium } = require('playwright');

(async () => {
  let browser;
  try {
    console.log('Подключаюсь к Chrome на localhost:9222...');
    browser = await chromium.connectOverCDP('http://localhost:9222');
    const defaultContext = browser.contexts()[0];
    const page = await defaultContext.newPage();
    
    // Перехватываем все запросы
    page.on('request', request => {
      const url = request.url();
      const headers = request.headers();
      const auth = headers['authorization'];
      
      if (auth) {
        console.log(`[AUTH FOUND] URL: ${url.substring(0, 100)}`);
        console.log(`  Auth header: ${auth.substring(0, 30)}...`);
      } else if (url.includes('googleapis.com') || url.includes('firebase')) {
        // Логируем запросы к гуглу и файрбейзу даже без авторизации в заголовках
        console.log(`[Req] URL: ${url.substring(0, 100)}`);
      }
    });
    
    const projectId = 'lord-f842d';
    const url = `https://console.firebase.google.com/project/${projectId}/firestore/databases/-default-/data`;
    
    console.log('Открываю Firestore Console...');
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    
    console.log('Жду еще 5 секунд...');
    await page.waitForTimeout(5000);
    
    await page.close();
    await browser.close();
  } catch (err) {
    console.error('Ошибка:', err);
    if (browser) await browser.close();
  }
})();
