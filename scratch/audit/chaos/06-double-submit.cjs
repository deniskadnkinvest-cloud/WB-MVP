/**
 * CHAOS TEST 06: Double Submit — Payment / Pricing
 * Проверяем страницу оплаты и кнопки подписки на спам
 */
const { chromium } = require('playwright');
const path = require('path');

const SCREENSHOTS = path.join(__dirname);
const BASE_URL = 'http://localhost:4173';

(async () => {
  console.log('💳 [TEST 06] Double Submit — Payment Forms');
  console.log('═'.repeat(60));

  let browser, context, page;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    context = browser.contexts()[0] || await browser.newContext();
    page = await context.newPage();

    // Трекер платёжных запросов
    const paymentRequests = [];

    await page.route('**/api/**', async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      
      if (url.includes('payment') || url.includes('subscribe') || url.includes('checkout') || url.includes('pay') || url.includes('billing') || url.includes('stripe')) {
        paymentRequests.push({ url, method, time: Date.now() });
        console.log(`   💳 Payment request #${paymentRequests.length}: ${method} ${url.substring(0, 70)}`);
      }
      
      // Медленный ответ (3 секунды) — имитируем реальный payment processing
      await new Promise(r => setTimeout(r, 3000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, status: 'payment_mock' }),
      });
    });

    // 1. Проверяем страницу /offer
    console.log('\n📍 Checking /offer page...');
    await page.goto(BASE_URL + '/offer', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: path.join(SCREENSHOTS, '06-double-submit-offer.png'), fullPage: true });
    console.log('📸 Screenshot #1: /offer page');

    const offerContent = await page.textContent('body');
    console.log(`   Offer page has content: ${offerContent.trim().length > 50 ? '✅' : '⚠️'}`);
    console.log(`   Content preview: "${offerContent.trim().substring(0, 100)}..."`);

    // 2. Проверяем основную страницу — ищем кнопки оплаты / подписки
    console.log('\n📍 Checking main page for pricing/payment buttons...');
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Ищем кнопки оплаты/подписки/pricing
    const payButtons = await page.$$('button:has-text("Оплатить"), button:has-text("Подписаться"), button:has-text("Купить"), button:has-text("Тариф"), button:has-text("Pay"), button:has-text("Subscribe")');
    console.log(`   Payment/Subscribe buttons found: ${payButtons.length}`);

    // Ищем модалку PricingModal
    const pricingTriggers = await page.$$('[class*="pricing"], [class*="Pricing"], [class*="tariff"], [class*="plan"]');
    console.log(`   Pricing-related elements: ${pricingTriggers.length}`);

    // Пробуем открыть PricingModal — ищем триггер
    const pricingBtn = await page.$('button:has-text("Тариф"), button:has-text("Pricing"), button:has-text("Подписка"), [class*="subscription"]');
    if (pricingBtn) {
      console.log('\n📍 Found pricing trigger, clicking...');
      await pricingBtn.click();
      await page.waitForTimeout(1500);
      
      await page.screenshot({ path: path.join(SCREENSHOTS, '06-double-submit-pricing-modal.png'), fullPage: true });
      console.log('📸 Screenshot #2: Pricing modal');

      // Ищем кнопки оплаты в модалке
      const modalPayBtns = await page.$$('.modal button:has-text("Оплатить"), .modal button:has-text("Подписаться"), [class*="pricing"] button');
      console.log(`   Payment buttons in modal: ${modalPayBtns.length}`);

      if (modalPayBtns.length > 0) {
        // SPAM: 5 быстрых кликов
        console.log('\n🔨 SPAM: 5 rapid clicks on payment button!');
        for (let i = 0; i < 5; i++) {
          const isDisabled = await modalPayBtns[0].isDisabled();
          if (!isDisabled) {
            await modalPayBtns[0].click({ force: true });
            console.log(`   Click #${i + 1}: sent`);
          } else {
            console.log(`   Click #${i + 1}: BLOCKED ✅`);
          }
          await page.waitForTimeout(100);
        }
        
        await page.waitForTimeout(5000);
        await page.screenshot({ path: path.join(SCREENSHOTS, '06-double-submit-after-spam.png'), fullPage: true });
        console.log('📸 Screenshot #3: After payment spam');
      }
    } else {
      console.log('   ℹ️ No pricing button found (user not logged in — this is expected)');
    }

    // 3. Также проверяем все кнопки на login-странице (login — доступная всем)
    // Спамим кнопку "Попробовать без регистрации"
    const guestBtn = await page.$('button.guest-btn');
    if (guestBtn) {
      console.log('\n📍 Spam testing Guest button...');
      const guestRequests = [];
      
      for (let i = 0; i < 5; i++) {
        const isDisabled = await guestBtn.isDisabled();
        const btnText = await guestBtn.textContent();
        
        console.log(`   Click #${i + 1}: disabled=${isDisabled} text="${btnText.trim()}"`);
        
        if (!isDisabled) {
          await guestBtn.click({ force: true });
        }
        await page.waitForTimeout(50);
      }
      
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(SCREENSHOTS, '06-double-submit-guest-spam.png'), fullPage: true });
      console.log('📸 Screenshot #4: After guest button spam');
    }

    // Итоги
    console.log('\n' + '═'.repeat(60));
    console.log('📋 RESULTS:');
    console.log(`   Payment API requests captured: ${paymentRequests.length}`);
    if (paymentRequests.length > 1) {
      console.log(`   🚨 CRITICAL: ${paymentRequests.length} payment requests sent!`);
      console.log(`   → Potential double-charge vulnerability!`);
    } else if (paymentRequests.length === 1) {
      console.log(`   ✅ Only 1 payment request (idempotent)`);
    } else {
      console.log(`   ℹ️ No payment requests intercepted (payment form not accessible)`);
    }

  } catch (err) {
    console.error('❌ Test failed:', err.message);
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
})();
