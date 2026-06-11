import { chromium } from 'playwright';
import { execSync } from 'child_process';
import fs from 'fs';

// Безопасный пароль для аккаунта Resend
const RESEND_EMAIL = 'deniskadnkinvest@gmail.com';
const RESEND_PASSWORD = 'SellerStudioResend2026!';

async function runAutomation() {
  console.log('🤖 Starting Resend.com signup and API Key automation...');
  let browser;
  try {
    // 1. Connect to user's Chrome
    browser = await chromium.connectOverCDP('http://localhost:9222');
    const context = browser.contexts()[0];
    const page = await context.newPage();
    
    console.log('🌐 Navigating to Resend Signup page...');
    await page.goto('https://resend.com/signup', { waitUntil: 'domcontentloaded' });

    // Check if we are already logged in or on signup page
    if (page.url().includes('resend.com/overview') || page.url().includes('resend.com/api-keys')) {
      console.log('👉 You seem to be already logged in to Resend!');
      await createApiKey(page);
      return;
    }

    // Fill registration form
    console.log('📝 Filling registration details...');
    try {
      await page.waitForSelector('input[type="email"]', { timeout: 10000 });
      await page.fill('input[type="email"]', RESEND_EMAIL);
      await page.fill('input[type="password"]', RESEND_PASSWORD);
      
      console.log('Submit registration...');
      await page.click('button[type="submit"]');
    } catch (e) {
      console.log('Could not find signup inputs. Checking if already on login/dashboard page...');
      // Maybe user is on login page
      if (page.url().includes('resend.com/login')) {
        console.log('Redirected to login. Please log in manually in Chrome...');
      }
    }

    // Wait for email verification screen
    console.log('⏳ Waiting for email verification screen...');
    console.log('\n================================================================');
    console.log(`👉 ВНИМАНИЕ: Проверьте почту ${RESEND_EMAIL}!`);
    console.log('   Вам пришло письмо от Resend с подтверждением.');
    console.log('   Кликните на ссылку подтверждения в письме в вашем браузере Chrome.');
    console.log('================================================================\n');

    // Wait loop: wait for user to confirm email and get redirected to overview/dashboard
    let verified = false;
    for (let i = 0; i < 60; i++) { // Wait up to 3 minutes
      const currentUrl = page.url();
      if (currentUrl.includes('/overview') || currentUrl.includes('/api-keys') || currentUrl.includes('/domains') || currentUrl.includes('/emails')) {
        console.log('✅ Email verification detected! User logged into dashboard.');
        verified = true;
        break;
      }
      await new Promise(r => setTimeout(r, 3000));
    }

    if (!verified) {
      console.log('❌ Timeout waiting for email verification. Please make sure to verify and log in.');
      await browser.close();
      return;
    }

    // Navigate to API Keys page
    await createApiKey(page);

  } catch (err) {
    console.error('❌ Automation Error:', err);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function createApiKey(page) {
  console.log('🔑 Navigating to API Keys page...');
  await page.goto('https://resend.com/api-keys', { waitUntil: 'networkidle' });

  console.log('Looking for "Create API Key" button...');
  // Find Create API Key button by text or selector
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
    // Check if we can click any button with API Key Name or similar
    console.log('Could not find default button. Trying general buttons...');
    createBtn = page.locator('button').filter({ hasText: /API Key/i }).first();
  }

  if (createBtn) {
    await createBtn.click();
    console.log('Clicked Create API Key button!');
  } else {
    console.log('Could not find API Key creation button. Maybe you already have a modal open or page design changed.');
  }

  // Wait for the Name input field
  console.log('Entering API Key details...');
  await page.waitForSelector('input[name="name"], input[placeholder="API Key Name"], input[id="name"]', { timeout: 10000 });
  await page.fill('input[name="name"], input[placeholder="API Key Name"], input[id="name"]', 'Seller Studio OTP');

  // Select Permission
  try {
    // Choose Full Access or Sending (Sending is safer, but Full Access is default and easier to click)
    const sendingPill = page.locator('label:has-text("Sending")').first();
    if (await sendingPill.isVisible()) {
      await sendingPill.click();
      console.log('Selected "Sending" permission role.');
    }
  } catch (e) {
    console.log('Failed to select permission role, using default.');
  }

  // Click submit to create key
  console.log('Creating key...');
  const submitBtn = page.locator('button[type="submit"], button:has-text("Create"), button:has-text("Add")').first();
  await submitBtn.click();

  // Wait for the API key to be shown and copy it
  console.log('Waiting for API Key to be generated...');
  await page.waitForSelector('code, input[readonly], [data-copy-value]', { timeout: 15000 });

  // Extract key
  let apiKey = '';
  // Try finding in readonly input
  const inputEl = page.locator('input[readonly]').first();
  if (await inputEl.isVisible()) {
    apiKey = await inputEl.inputValue();
  }

  // Try finding code block
  if (!apiKey || !apiKey.startsWith('re_')) {
    const codeEl = page.locator('code').first();
    if (await codeEl.isVisible()) {
      apiKey = await codeEl.innerText();
    }
  }

  // Try finding data-copy-value attribute
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
    await saveKeyToVercel(apiKey);
  } else {
    console.log('❌ Could not extract API Key. Please copy it manually from Chrome and provide it.');
  }
}

async function saveKeyToVercel(apiKey) {
  console.log('🚀 Saving API Key to Vercel production Environment Variables...');
  try {
    // Remove old key if exists (ignore errors)
    try {
      execSync('npx vercel env rm RESEND_API_KEY production -y', { stdio: 'ignore' });
      console.log('Removed old RESEND_API_KEY.');
    } catch (e) {}

    // Add new key
    execSync(`npx vercel env add RESEND_API_KEY ${apiKey} production`, { stdio: 'inherit' });
    console.log('✅ Added new RESEND_API_KEY to Vercel!');

    // Trigger redeploy to apply variables
    console.log('⚡ Triggering Vercel production redeploy to apply the keys...');
    execSync('npx vercel --prod --yes', { stdio: 'inherit' });
    console.log('\n🎉 ALL DONE! The OTP system is now fully live with real email delivery!');
  } catch (err) {
    console.error('❌ Failed to update Vercel environment variables:', err.message);
  }
}

runAutomation();
