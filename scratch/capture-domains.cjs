const { chromium } = require('playwright');
const path = require('path');

(async () => {
  let browser;
  try {
    console.log('Connecting to Chrome...');
    browser = await chromium.connectOverCDP('http://localhost:9222');
    const context = browser.contexts()[0];
    const page = await context.newPage();
    
    console.log('Navigating to Resend Domains...');
    await page.goto('https://resend.com/domains', { waitUntil: 'networkidle' });
    
    const screenshotPath = path.join(__dirname, '..', 'resend_domains_main.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log('Screenshot saved to:', screenshotPath);
    
    await browser.close();
  } catch (err) {
    console.error('Error:', err);
    if (browser) await browser.close();
  }
})();
