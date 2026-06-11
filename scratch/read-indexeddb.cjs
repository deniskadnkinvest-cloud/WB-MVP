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
    
    console.log(`Проверяю IndexedDB на вкладке: ${appPage.url()}`);
    
    const dbData = await appPage.evaluate(() => {
      return new Promise((resolve) => {
        const request = indexedDB.open('firebaseLocalStorageDb');
        
        request.onerror = (event) => {
          resolve({ error: 'Ошибка открытия firebaseLocalStorageDb: ' + event.target.errorCode });
        };
        
        request.onsuccess = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains('firebaseLocalStorage')) {
            resolve({ error: 'Хранилище firebaseLocalStorage не найдено' });
            return;
          }
          
          const transaction = db.transaction(['firebaseLocalStorage'], 'readonly');
          const objectStore = transaction.objectStore('firebaseLocalStorage');
          const getAllRequest = objectStore.getAll();
          
          getAllRequest.onsuccess = () => {
            resolve({ data: getAllRequest.result });
          };
          
          getAllRequest.onerror = (err) => {
            resolve({ error: 'Ошибка чтения хранилища: ' + err.target.errorCode });
          };
        };
      });
    });
    
    console.log('IndexedDB Data:', JSON.stringify(dbData, null, 2));
    
    await browser.close();
  } catch (err) {
    console.error('Ошибка:', err);
    if (browser) await browser.close();
  }
})();
