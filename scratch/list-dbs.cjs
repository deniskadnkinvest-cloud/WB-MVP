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
    
    console.log(`Сканирую базы данных IndexedDB на странице: ${appPage.url()}`);
    
    const dbs = await appPage.evaluate(async () => {
      if (!indexedDB.databases) {
        return { error: 'indexedDB.databases не поддерживается в этом браузере' };
      }
      const list = await indexedDB.databases();
      return list;
    });
    
    console.log('Найденные базы данных:', JSON.stringify(dbs, null, 2));
    
    await browser.close();
  } catch (err) {
    console.error('Ошибка:', err);
    if (browser) await browser.close();
  }
})();
