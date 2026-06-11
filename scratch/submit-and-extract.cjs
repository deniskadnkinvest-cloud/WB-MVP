const { chromium } = require('playwright');
const { execSync } = require('child_process');

async function submitAndExtract() {
  console.log('🤖 Connecting to Chrome to extract API Key from Resend...');
  let browser;
  try {
    browser = await chromium.connectOverCDP('http://localhost:9222');
    const contexts = browser.contexts();
    
    let page = null;
    for (const context of contexts) {
      for (const p of context.pages()) {
        const url = p.url();
        if (url.includes('resend.com/api-keys')) {
          page = p;
          break;
        }
      }
      if (page) break;
    }

    if (!page) {
      console.log('❌ Resend API keys page not found in Chrome tabs.');
      await browser.close();
      return;
    }

    console.log(`Using tab: ${page.url()}`);

    // Check if dialog is open. If name is empty, fill it.
    const nameInput = page.locator('input[name="name"], input[placeholder="API Key Name"], input[id="name"]').first();
    if (await nameInput.isVisible()) {
      const currentVal = await nameInput.inputValue();
      if (!currentVal) {
        await nameInput.fill('Seller Studio OTP');
        console.log('Filled API Key name.');
      } else {
        console.log('API Key name is already:', currentVal);
      }
    }

    console.log('Clicking "Add" button inside the dialog...');
    // Target the specific button inside the dialog that contains "Add"
    const addBtn = page.locator('[role="dialog"] button:has-text("Add"), button:has-text("Add")').first();
    await addBtn.click();
    console.log('Clicked Add!');

    console.log('Waiting for API Key to be generated...');
    // Wait for the new key to be displayed
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
    console.error('❌ Error in submitAndExtract:', err);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

submitAndExtract();
