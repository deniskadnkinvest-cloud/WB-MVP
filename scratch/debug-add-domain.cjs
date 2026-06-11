const { chromium } = require('playwright');
const path = require('path');

async function debugAddDomain() {
  console.log('🤖 Connecting to Chrome...');
  let browser;
  try {
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

    // Click Add Domain button
    const addBtn = page.locator('button:has-text("Add Domain"), button:has-text("Create Domain"), button:has-text("Add"), a:has-text("Add Domain")').first();
    await addBtn.click();
    console.log('Clicked Add Domain button. Waiting 2 seconds...');
    await page.waitForTimeout(2000);

    // Save screenshot
    const screenshotPath = path.join(__dirname, '..', 'resend_add_domain_debug.png');
    await page.screenshot({ path: screenshotPath });
    console.log('Debug screenshot saved to:', screenshotPath);

    // Let's dump all inputs on the page
    const inputs = await page.locator('input').all();
    console.log(`Found ${inputs.length} inputs on page:`);
    for (let i = 0; i < inputs.length; i++) {
      const name = await inputs[i].getAttribute('name');
      const placeholder = await inputs[i].getAttribute('placeholder');
      const id = await inputs[i].getAttribute('id');
      const type = await inputs[i].getAttribute('type');
      console.log(`  - Input ${i}: name="${name}", placeholder="${placeholder}", id="${id}", type="${type}"`);
    }

  } catch (err) {
    console.error('❌ Error in debugAddDomain:', err);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

debugAddDomain();
