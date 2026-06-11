/**
 * CHAOS TEST 02: API Error Injection
 * Перехватываем запросы к /api/* и возвращаем HTTP 500
 * Проверяем: Error State, Retry button, crash resilience
 */
const { chromium } = require('playwright');
const path = require('path');

const SCREENSHOTS = path.join(__dirname);
const URL = 'http://localhost:4173/';

(async () => {
  console.log('💥 [TEST 02] API Error Injection — HTTP 500');
  console.log('═'.repeat(60));

  let browser, context, page;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    context = browser.contexts()[0] || await browser.newContext();
    page = await context.newPage();

    // Трекер перехваченных запросов
    const interceptedRequests = [];
    let errorCount = 0;

    // Перехватываем ВСЕ API-запросы
    await page.route('**/api/**', async (route) => {
      const url = route.request().url();
      interceptedRequests.push(url);
      errorCount++;

      console.log(`   🔴 Intercepted #${errorCount}: ${route.request().method()} ${url}`);
      
      // Возвращаем 500 на первые 3 запроса, потом пропускаем
      if (errorCount <= 3) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error (Chaos Test)' }),
        });
        console.log(`   → Returned HTTP 500`);
      } else {
        await route.continue();
        console.log(`   → Passed through`);
      }
    });

    // Также перехватываем Firebase auth запросы
    await page.route('**/identitytoolkit.googleapis.com/**', async (route) => {
      const url = route.request().url();
      interceptedRequests.push(url);
      console.log(`   🔴 Firebase Auth intercepted: ${url.substring(0, 80)}...`);
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'SERVICE_UNAVAILABLE' } }),
      });
    });

    console.log('✅ API route interception enabled');
    
    // Навигация
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: path.join(SCREENSHOTS, '02-api-error-initial.png'), fullPage: true });
    console.log('📸 Screenshot #1: After page load with API errors');

    // Проверяем: видна ли страница вообще? (не crash)
    const bodyHTML = await page.innerHTML('body');
    const hasCrashed = bodyHTML.includes('Something went wrong') || bodyHTML.includes('Error') || bodyHTML.includes('error-boundary');
    const hasContent = bodyHTML.length > 100;
    console.log(`\n   App crashed: ${hasCrashed ? '🚨 YES' : '✅ NO'}`);
    console.log(`   Has content: ${hasContent ? '✅ YES' : '🚨 NO'}`);

    // Проверяем Error State UI
    const errorElements = await page.$$('[class*="error"], [class*="Error"], [role="alert"], .error-message, .error-state');
    console.log(`   Error UI elements: ${errorElements.length}`);

    // Проверяем Retry кнопки
    const retryBtns = await page.$$('button:has-text("retry"), button:has-text("Retry"), button:has-text("Повторить"), button:has-text("повторить"), button:has-text("Попробовать")');
    console.log(`   Retry buttons: ${retryBtns.length}`);

    // Попробуем взаимодействовать — нажать "Войти через Google" с перехваченным API
    const googleBtn = await page.$('button:has-text("Войти через Google")');
    if (googleBtn) {
      console.log('\n   📍 Clicking "Войти через Google" with API 500s...');
      await googleBtn.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(SCREENSHOTS, '02-api-error-after-google.png'), fullPage: true });
      console.log('📸 Screenshot #2: After Google login with API errors');

      // Проверяем: показалось ли сообщение об ошибке?
      const errorMsg = await page.$('.login-error, [class*="error"]');
      console.log(`   Error message visible: ${errorMsg ? '✅ YES' : '🚨 NO'}`);
      if (errorMsg) {
        const errorText = await errorMsg.textContent();
        console.log(`   Error text: "${errorText}"`);
      }
    }

    // Попробуем OTP flow с ошибкой
    const otpLink = await page.$('text=Войти без пароля');
    if (otpLink) {
      await otpLink.click();
      await page.waitForTimeout(500);
      
      const emailInput = await page.$('input[type="email"]');
      if (emailInput) {
        await emailInput.fill('chaos@test.com');
        const submitBtn = await page.$('button.email-btn');
        if (submitBtn) {
          console.log('\n   📍 Submitting OTP request with API 500...');
          await submitBtn.click();
          await page.waitForTimeout(3000);
          await page.screenshot({ path: path.join(SCREENSHOTS, '02-api-error-after-otp.png'), fullPage: true });
          console.log('📸 Screenshot #3: OTP request with API error');
          
          const errorMsg2 = await page.$('.login-error');
          if (errorMsg2) {
            const t = await errorMsg2.textContent();
            console.log(`   Error message: "${t}"`);
          }
        }
      }
    }

    // Проверяем: приложение ещё живо?
    const stillAlive = await page.evaluate(() => {
      return document.querySelector('.login-wrapper') !== null || document.querySelector('#root') !== null;
    });
    console.log(`\n   App still alive after errors: ${stillAlive ? '✅ YES' : '🚨 NO (CRASHED)'}`);

    // Итоги
    console.log('\n' + '═'.repeat(60));
    console.log('📋 RESULTS:');
    console.log(`   Total API requests intercepted: ${interceptedRequests.length}`);
    console.log(`   HTTP 500 returned: ${Math.min(errorCount, 3)}`);
    console.log(`   Error UI shown: ${errorElements.length > 0 ? 'YES ✅' : 'NO 🚨'}`);
    console.log(`   Retry buttons present: ${retryBtns.length > 0 ? 'YES ✅' : 'NO 🚨'}`);
    console.log(`   App survived: ${stillAlive ? 'YES ✅' : 'NO 🚨'}`);

  } catch (err) {
    console.error('❌ Test failed:', err.message);
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
})();
