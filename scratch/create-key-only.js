import { chromium } from 'playwright';
import { execSync } from 'child_process';

async function createKeyOnly() {
  console.log('🤖 Connecting to Chrome to extract API Key from Resend...');
  let browser;
  try {
    browser = await chromium.connectOverCDP('http://localhost:9222');
    const context = browser.contexts()[0];
    const page = await context.newPage();

    console.log('🌐 Navigating directly to Resend API Keys page...');
    await page.goto('https://resend.com/api-keys', { waitUntil: 'networkidle' });

    // Check if we are on login screen
    if (page.url().includes('resend.com/login') || page.url().includes('resend.com/signup')) {
      console.log('❌ You are not logged in to Resend in Chrome.');
      console.log('👉 Пожалуйста, войдите в ваш аккаунт Resend в Chrome manually, а затем запустите этот скрипт снова.');
      await browser.close();
      return;
    }

    console.log('Looking for "Create API Key" button...');
    let createBtn = null;
    const buttonSelectors = [
      'button:has-text("Create API Key")',
      'button:has-text("Create")',
      'button:has-text("Add API Key")',
      'a:has-text("Create API Key")'
    ];

    for (const sel of buttonSelectors) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible()) {
          createBtn = btn;
          break;
        }
      } catch (e) {}
    }

    if (!createBtn) {
      createBtn = page.locator('button').filter({ hasText: /API Key/i }).first();
    }

    if (createBtn) {
      await createBtn.click();
      console.log('Clicked Create API Key button!');
    } else {
      console.log('Could not find API Key creation button. Maybe modal is already open?');
    }

    console.log('Entering API Key name...');
    await page.waitForSelector('input[name="name"], input[placeholder="API Key Name"], input[id="name"]', { timeout: 10000 });
    await page.fill('input[name="name"], input[placeholder="API Key Name"], input[id="name"]', 'Seller Studio OTP');

    // Select Permission
    try {
      const sendingPill = page.locator('label:has-text("Sending")').first();
      if (await sendingPill.isVisible()) {
        await sendingPill.click();
        console.log('Selected "Sending" permission role.');
      }
    } catch (e) {
      console.log('Using default permission role.');
    }

    console.log('Creating key...');
    const submitBtn = page.locator('button[type="submit"], button:has-text("Create"), button:has-text("Add")').first();
    await submitBtn.click();

    console.log('Waiting for API Key to be generated...');
    await page.waitForSelector('code, input[readonly], [data-copy-value]', { timeout: 15000 });

    let apiKey = '';
    const inputEl = page.locator('input[readonly]').first();
    if (await inputEl.isVisible()) {
      apiKey = await inputEl.inputValue();
    }

    if (!apiKey || !apiKey.startsWith('re_')) {
      const codeEl = page.locator('code').first();
      if (await codeEl.isVisible()) {
        apiKey = await codeEl.innerText();
      }
    }

    if (!apiKey || !apiKey.startsWith('re_')) {
      const copyEl = page.locator('[data-copy-value]').first();
      if (await copyEl.isVisible()) {
        apiKey = await copyEl.getAttribute('data-copy-value');
      }
    }

    apiKey = apiKey.trim();
    if (apiKey && apiKey.startsWith('re_')) {
      console.log('✅ Success! Extracted API Key:', apiKey.substring(0, 8) + '...');
      
      // Save to Vercel
      console.log('🚀 Saving to Vercel...');
      try {
        execSync('npx vercel env rm RESEND_API_KEY production -y', { stdio: 'ignore' });
      } catch (e) {}

      execSync(`npx vercel env add RESEND_API_KEY ${apiKey} production`, { stdio: 'inherit' });
      console.log('✅ Added to Vercel!');

      console.log('⚡ Triggering redeploy...');
      execSync('npx vercel --prod --yes', { stdio: 'inherit' });
      console.log('\n🎉 ALL DONE! The OTP system is now fully live with real email delivery!');
    } else {
      console.log('❌ Could not extract API Key. Please copy it manually.');
    }

  } catch (err) {
    console.error('❌ Error in createKeyOnly:', err);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

createKeyOnly();
