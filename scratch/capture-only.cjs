const { chromium } = require('playwright');
const path = require('path');

(async () => {
  let browser;
  try {
    console.log('Connecting to Chrome...');
    browser = await chromium.connectOverCDP('http://localhost:9222');
    const contexts = browser.contexts();
    
    let page = null;
    for (const context of contexts) {
      for (const p of context.pages()) {
        const url = p.url();
        if (url.includes('resend.com/domains')) {
          page = p;
          break;
        }
      }
      if (page) break;
    }

    if (!page) {
      console.log('❌ Resend Domains page not found in open tabs.');
      await browser.close();
      return;
    }

    console.log(`Using tab: ${page.url()}`);
    const screenshotPath = path.join(__dirname, '..', 'resend_domains_current.png');
    await page.screenshot({ path: screenshotPath });
    console.log('Screenshot saved to:', screenshotPath);
    
    await browser.close();
  } catch (err) {
    console.error('Error:', err);
    if (browser) await browser.close();
  }
})();
