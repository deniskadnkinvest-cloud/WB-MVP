const { chromium } = require('playwright');

(async () => {
  let browser;
  try {
    console.log('Подключаюсь к Chrome на localhost:9222...');
    browser = await chromium.connectOverCDP('http://localhost:9222');
    const contexts = browser.contexts();
    
    let appPage = null;
    for (const context of contexts) {
      for (const page of context.pages()) {
        const url = page.url();
        if (url.includes('seller-studio-ai.ru') || url.includes('vton-mvp-omega.vercel.app')) {
          appPage = page;
          break;
        }
      }
      if (appPage) break;
    }
    
    if (!appPage) {
      console.error('Вкладка с приложением не найдена.');
      await browser.close();
      return;
    }
    
    console.log(`Проверяю вкладку: ${appPage.url()}`);
    
    const storageData = await appPage.evaluate(() => {
      // Собираем данные localStorage
      const local = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        local[key] = localStorage.getItem(key);
      }
      
      // Собираем данные sessionStorage
      const session = {};
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        session[key] = sessionStorage.getItem(key);
      }
      
      return { local, session };
    });
    
    console.log('LocalStorage keys:', Object.keys(storageData.local));
    console.log('SessionStorage keys:', Object.keys(storageData.session));
    
    // Проверим, есть ли firebase-ключи в localStorage
    const fbKeys = Object.keys(storageData.local).filter(k => k.toLowerCase().includes('firebase'));
    console.log('Firebase-related localStorage keys:', fbKeys);
    if (fbKeys.length > 0) {
      console.log('Firebase local storage values:', fbKeys.map(k => `${k}: ${storageData.local[k].substring(0, 100)}...`));
    }
    
    await browser.close();
  } catch (err) {
    console.error('Ошибка:', err);
    if (browser) await browser.close();
  }
})();
