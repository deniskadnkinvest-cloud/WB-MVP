const { chromium } = require('playwright');

(async () => {
  let browser;
  try {
    console.log('Подключаюсь к Chrome на localhost:9222...');
    browser = await chromium.connectOverCDP('http://localhost:9222');
    const defaultContext = browser.contexts()[0];
    const page = await defaultContext.newPage();
    
    let token = null;
    
    // Перехватываем запросы
    page.on('request', request => {
      const headers = request.headers();
      if (headers['authorization'] && headers['authorization'].startsWith('Bearer ')) {
        const authHeader = headers['authorization'];
        const currentToken = authHeader.substring(7);
        // Фильтруем, чтобы не взять какой-то левый токен
        if (request.url().includes('firestore.googleapis.com') || request.url().includes('firebasedatabase.app')) {
          token = currentToken;
          console.log(`[Token Found] URL: ${request.url().substring(0, 80)}...`);
        }
      }
    });
    
    const projectId = 'lord-f842d';
    const url = `https://console.firebase.google.com/project/${projectId}/firestore/databases/-default-/data`;
    
    console.log('Открываю Firestore Console для перехвата токена...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    console.log('Жду сетевых запросов (12 секунд)...');
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(1000);
      if (token) {
        break;
      }
    }
    
    if (token) {
      console.log('\n✅ Токен авторизации успешно перехвачен!');
      console.log('Token (first 30 chars):', token.substring(0, 30) + '...');
    } else {
      console.log('\n❌ Токен не был найден. Попробуем обновить страницу или подождать дольше.');
    }
    
    await page.close();
    await browser.close();
  } catch (err) {
    console.error('Ошибка:', err);
    if (browser) await browser.close();
  }
})();
