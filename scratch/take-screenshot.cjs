const { chromium } = require('playwright');
const path = require('path');

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
    
    console.log(`Делаю скриншот вкладки: ${appPage.url()}`);
    const screenshotPath = path.join(__dirname, '..', 'page_screenshot.png');
    await appPage.screenshot({ path: screenshotPath });
    console.log('Скриншот сохранен:', screenshotPath);
    
    await browser.close();
  } catch (err) {
    console.error('Ошибка:', err);
    if (browser) await browser.close();
  }
})();
