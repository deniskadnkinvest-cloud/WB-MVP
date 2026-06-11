const { chromium } = require('playwright');
const path = require('path');

async function addResendDomain() {
  console.log('🤖 Connecting to Chrome...');
  let browser;
  try {
    browser = await chromium.connectOverCDP('http://localhost:9222');
    const context = browser.contexts()[0];
    const page = await context.newPage();

    console.log('🌐 Navigating to Resend Domains page...');
    await page.goto('https://resend.com/domains', { waitUntil: 'networkidle' });

    // Check if we are on login screen
    if (page.url().includes('resend.com/login')) {
      console.log('❌ You are not logged in to Resend in Chrome.');
      await browser.close();
      return;
    }

    console.log('Checking if domain is already added...');
    const domainText = await page.content();
    if (domainText.includes('seller-studio-ai.ru')) {
      console.log('Domain seller-studio-ai.ru is already in the list.');
      // Click on it to see DNS records
      const domainLink = page.locator('a:has-text("seller-studio-ai.ru")').first();
      await domainLink.click();
      await page.waitForTimeout(3000);
    } else {
      console.log('Adding seller-studio-ai.ru...');
      // Click Add Domain button
      const addBtn = page.locator('button:has-text("Add Domain"), button:has-text("Create Domain"), a:has-text("Add Domain")').first();
      await addBtn.click();
      
      // Wait for input
      await page.waitForSelector('input[name="name"], input[placeholder="example.com"]');
      await page.fill('input[name="name"], input[placeholder="example.com"]', 'seller-studio-ai.ru');
      
      // Click Add/Create
      const submitBtn = page.locator('button[type="submit"], button:has-text("Add"), button:has-text("Create")').first();
      await submitBtn.click();
      console.log('Submitted domain creation form.');
      await page.waitForTimeout(5000);
    }

    // Capture screenshot of DNS records
    const screenshotPath = path.join(__dirname, '..', 'resend_dns_records.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log('Screenshot of DNS records saved:', screenshotPath);

    // Try to extract DNS records text
    console.log('Extracting DNS records...');
    const rows = await page.locator('table tr').all();
    console.log(`Found ${rows.length} rows in table.`);
    
    let dnsData = [];
    for (const row of rows) {
      const text = await row.innerText();
      dnsData.push(text.replace(/\t/g, ' | ').replace(/\n/g, ' '));
    }
    
    console.log('--- DNS RECORDS EXTRACTED ---');
    console.log(dnsData.join('\n'));
    console.log('-----------------------------');

  } catch (err) {
    console.error('❌ Error in addResendDomain:', err);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

addResendDomain();
