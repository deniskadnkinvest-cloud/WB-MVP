const { chromium } = require('playwright');

(async () => {
  try {
    console.log('Подключаюсь к Chrome на localhost:9222...');
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    const contexts = browser.contexts();
    console.log(`Найдено контекстов: ${contexts.length}`);
    
    for (let i = 0; i < contexts.length; i++) {
      const pages = contexts[i].pages();
      console.log(`Контекст ${i} содержит страниц: ${pages.length}`);
      for (let j = 0; j < pages.length; j++) {
        const page = pages[j];
        try {
          const url = page.url();
          const title = await page.title();
          console.log(`  - Страница ${j}: ${url} [${title}]`);
        } catch (e) {
          console.log(`  - Страница ${j}: Ошибка получения инфо: ${e.message}`);
        }
      }
    }
    await browser.close();
  } catch (err) {
    console.error('Ошибка подключения к Chrome по CDP:', err);
  }
})();
