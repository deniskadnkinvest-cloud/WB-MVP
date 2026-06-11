const { chromium } = require('playwright');
const path = require('path');

async function setupDomainsDirect() {
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

    // Check if domain is already in the list
    const content = await page.content();
    if (content.includes('seller-studio-ai.ru')) {
      console.log('Domain seller-studio-ai.ru already exists in list. Clicking on it...');
      const domainLink = page.locator('a:has-text("seller-studio-ai.ru")').first();
      await domainLink.click();
      await page.waitForTimeout(3000);
    } else {
      console.log('Domain not found. Adding domain...');
      // Look for Add Domain or Create Domain button
      const addBtn = page.locator('button:has-text("Add Domain"), button:has-text("Create Domain"), button:has-text("Create")').first();
      await addBtn.click();
      console.log('Clicked Add Domain button.');
      
      // Wait for modal input
      const inputEl = page.locator('input[name="name"], input[placeholder="example.com"]').first();
      await inputEl.waitFor({ state: 'visible', timeout: 5000 });
      await inputEl.fill('seller-studio-ai.ru');
      console.log('Filled domain name.');
      
      // Click Add
      const submitBtn = page.locator('button[type="submit"], button:has-text("Add"), button:has-text("Create")').first();
      await submitBtn.click();
      console.log('Clicked Add!');
      await page.waitForTimeout(5000);
    }

    // Take screenshot of DNS records
    const screenshotPath = path.join(__dirname, '..', 'resend_domains.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log('Screenshot saved to:', screenshotPath);

    // Try to extract DNS records
    console.log('Extracting DNS records...');
    const rows = await page.locator('table tr').all();
    console.log(`Found ${rows.length} rows.`);
    
    let dnsData = [];
    for (const row of rows) {
      const text = await row.innerText();
      dnsData.push(text.replace(/\t/g, ' | ').replace(/\n/g, ' '));
    }
    
    console.log('--- DNS RECORDS ---');
    console.log(dnsData.join('\n'));
    console.log('------------------');

  } catch (err) {
    console.error('❌ Error in setupDomainsDirect:', err);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

setupDomainsDirect();
