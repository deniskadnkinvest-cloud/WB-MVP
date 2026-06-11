const { chromium } = require('playwright');
const path = require('path');

(async () => {
  let browser;
  try {
    console.log('Connecting to Chrome...');
    browser = await chromium.connectOverCDP('http://localhost:9222');
    const contexts = browser.contexts();
    
    let resendPage = null;
    for (const context of contexts) {
      for (const page of context.pages()) {
        const url = page.url();
        if (url.includes('resend.com/api-keys')) {
          resendPage = page;
          break;
        }
      }
      if (resendPage) break;
    }
    
    if (!resendPage) {
      console.error('Resend API keys page not found.');
      await browser.close();
      return;
    }
    
    console.log(`Taking screenshot of page: ${resendPage.url()}`);
    const screenshotPath = path.join(__dirname, '..', 'resend_api_keys.png');
    await resendPage.screenshot({ path: screenshotPath });
    console.log('Screenshot saved to:', screenshotPath);
    
    await browser.close();
  } catch (err) {
    console.error('Error:', err);
    if (browser) await browser.close();
  }
})();
