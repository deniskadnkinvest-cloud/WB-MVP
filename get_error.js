import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure().errorText));

  console.log('Navigating to live site...');
  await page.goto('https://seller-studio-ai.ru', { waitUntil: 'networkidle0' });
  
  console.log('Waiting 5s...');
  await new Promise(r => setTimeout(r, 5000));
  
  await browser.close();
})();
