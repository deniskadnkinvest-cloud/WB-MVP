/**
 * CHAOS TEST 05: Empty State
 * Эмулируем пустые ответы API (пустой массив [])
 * Проверяем: есть ли Empty State с CTA?
 */
const { chromium } = require('playwright');
const path = require('path');

const SCREENSHOTS = path.join(__dirname);
const URL = 'http://localhost:4173/';

(async () => {
  console.log('📭 [TEST 05] Empty State — Empty API Responses');
  console.log('═'.repeat(60));

  let browser, context, page;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    context = browser.contexts()[0] || await browser.newContext();
    page = await context.newPage();

    // Перехватываем ВСЕ API-запросы и возвращаем пустые данные
    const interceptedAPIs = [];
    
    await page.route('**/api/**', async (route) => {
      const url = route.request().url();
      interceptedAPIs.push(url);
      console.log(`   📭 Empty response for: ${url.substring(0, 70)}`);
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]), // Пустой массив
      });
    });

    // Firestore запросы — тоже пустые
    await page.route('**/firestore.googleapis.com/**', async (route) => {
      const url = route.request().url();
      interceptedAPIs.push('firestore: ' + url.substring(0, 50));
      console.log(`   📭 Empty Firestore response`);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ documents: [] }),
      });
    });

    // Навигация
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    await page.screenshot({ path: path.join(SCREENSHOTS, '05-empty-state-login.png'), fullPage: true });
    console.log('📸 Screenshot #1: Login page (empty API context)');

    // Пытаемся войти как гость (чтобы увидеть основное приложение)
    const guestBtn = await page.$('button:has-text("Попробовать без регистрации"), button:has-text("Гость"), button.guest-btn');
    if (guestBtn) {
      // Пускаем Firebase auth запросы через для гостевого входа
      await page.unroute('**/identitytoolkit.googleapis.com/**');
      
      console.log('\n📍 Attempting guest login...');
      await guestBtn.click();
      await page.waitForTimeout(5000);
      
      await page.screenshot({ path: path.join(SCREENSHOTS, '05-empty-state-after-login.png'), fullPage: true });
      console.log('📸 Screenshot #2: After guest login attempt');

      // Проверяем: мы прошли login?
      const isStillLogin = await page.$('.login-wrapper');
      if (isStillLogin) {
        console.log('   ⚠️ Still on login page (guest auth may have failed)');
      } else {
        console.log('   ✅ Passed login page');
        
        // Проверяем Empty State в основном приложении
        await page.waitForTimeout(2000);
        await page.screenshot({ path: path.join(SCREENSHOTS, '05-empty-state-main.png'), fullPage: true });
        console.log('📸 Screenshot #3: Main app with empty data');

        // Ищем Empty State паттерны
        const emptyStateChecks = await page.evaluate(() => {
          const body = document.body;
          const text = body.textContent.toLowerCase();
          
          return {
            hasEmptyText: text.includes('пусто') || text.includes('нет данных') || text.includes('ничего не найдено') || text.includes('empty') || text.includes('no data'),
            hasEmptyIcon: !!document.querySelector('[class*="empty"], [class*="Empty"], [class*="no-data"], [class*="placeholder"]'),
            hasCTA: !!document.querySelector('[class*="empty"] button, [class*="Empty"] button, [class*="empty"] a'),
            hasIllustration: !!document.querySelector('[class*="empty"] img, [class*="empty"] svg, [class*="Empty"] img'),
            pageText: text.substring(0, 200),
          };
        });

        console.log('\n   Empty State Analysis:');
        console.log(`   Has "empty" text: ${emptyStateChecks.hasEmptyText ? '✅' : '🚨 NO'}`);
        console.log(`   Has empty state element: ${emptyStateChecks.hasEmptyIcon ? '✅' : '🚨 NO'}`);
        console.log(`   Has CTA button: ${emptyStateChecks.hasCTA ? '✅' : '🚨 NO'}`);
        console.log(`   Has illustration: ${emptyStateChecks.hasIllustration ? '✅' : '⚠️ NO'}`);
        console.log(`   Page text preview: "${emptyStateChecks.pageText.substring(0, 100)}..."`);
      }
    } else {
      console.log('   ⚠️ Guest login button not found');
    }

    // Итоги
    console.log('\n' + '═'.repeat(60));
    console.log('📋 RESULTS:');
    console.log(`   Total API requests intercepted: ${interceptedAPIs.length}`);
    console.log(`   All returned empty arrays/objects`);

  } catch (err) {
    console.error('❌ Test failed:', err.message);
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
})();
