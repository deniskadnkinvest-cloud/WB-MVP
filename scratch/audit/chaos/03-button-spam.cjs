/**
 * CHAOS TEST 03: Button Spam (Idempotency)
 * Вводим email и быстро нажимаем OTP кнопку 5 раз
 * Проверяем: заблокирована ли кнопка? Сколько запросов ушло?
 */
const { chromium } = require('playwright');
const path = require('path');

const SCREENSHOTS = path.join(__dirname);
const URL = 'http://localhost:4173/';

(async () => {
  console.log('🔨 [TEST 03] Button Spam — OTP Idempotency');
  console.log('═'.repeat(60));

  let browser, context, page;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    context = browser.contexts()[0] || await browser.newContext();
    page = await context.newPage();

    // Трекер запросов OTP
    const otpRequests = [];
    
    await page.route('**/api/**', async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      const body = route.request().postData();
      
      if (url.includes('otp') || url.includes('send-code') || url.includes('magic') || url.includes('email')) {
        otpRequests.push({
          url,
          method,
          body,
          timestamp: Date.now()
        });
        console.log(`   📨 OTP Request #${otpRequests.length}: ${method} ${url.substring(0, 60)}...`);
      }
      
      // Эмулируем медленный ответ (2 секунды)
      await new Promise(r => setTimeout(r, 2000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'OTP sent (chaos mock)' }),
      });
    });

    // Также трекаем Firebase запросы
    const firebaseRequests = [];
    await page.route('**/identitytoolkit.googleapis.com/**', async (route) => {
      firebaseRequests.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ kind: 'mock' }),
      });
    });

    // Навигация
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    await page.screenshot({ path: path.join(SCREENSHOTS, '03-spam-initial.png'), fullPage: true });
    console.log('📸 Screenshot #1: Initial login page');

    // Переключаемся на OTP режим
    const otpLink = await page.$('text=Войти без пароля');
    if (otpLink) {
      await otpLink.click();
      await page.waitForTimeout(500);
      console.log('✅ Switched to OTP mode');
    } else {
      // Может быть уже в OTP режиме (otp_request по умолчанию)
      console.log('ℹ️ Already in OTP mode or mode unavailable');
    }

    // Заполняем email
    const emailInput = await page.$('input[type="email"]');
    if (!emailInput) {
      console.error('❌ Email input not found!');
      return;
    }
    await emailInput.fill('spam-test@chaos.io');
    console.log('✅ Email filled: spam-test@chaos.io');

    await page.screenshot({ path: path.join(SCREENSHOTS, '03-spam-email-filled.png'), fullPage: true });
    console.log('📸 Screenshot #2: Email filled');

    // Находим кнопку OTP
    const otpBtn = await page.$('button.email-btn');
    if (!otpBtn) {
      console.error('❌ OTP submit button not found!');
      return;
    }

    // 🔨 SPAM: 5 быстрых кликов подряд!
    console.log('\n🔨 SPAM START: 5 rapid clicks!');
    const clickTimestamps = [];
    
    for (let i = 0; i < 5; i++) {
      // Проверяем состояние кнопки ПЕРЕД кликом
      const isDisabled = await otpBtn.isDisabled();
      const btnText = await otpBtn.textContent();
      
      clickTimestamps.push(Date.now());
      console.log(`   Click #${i + 1}: disabled=${isDisabled}, text="${btnText.trim()}"`);
      
      if (!isDisabled) {
        await otpBtn.click({ force: true }); // force: true — кликаем даже если перекрыт
      } else {
        console.log(`   → Skipped (button disabled ✅)`);
      }
      
      // Минимальная задержка между кликами (50ms — реалистичный спам)
      await page.waitForTimeout(50);
    }
    
    console.log('🔨 SPAM END');

    // Ждём все ответы
    await page.waitForTimeout(5000);

    await page.screenshot({ path: path.join(SCREENSHOTS, '03-spam-after.png'), fullPage: true });
    console.log('📸 Screenshot #3: After spam');

    // Анализ
    const btnAfterSpam = await page.$('button.email-btn');
    const btnDisabledAfter = btnAfterSpam ? await btnAfterSpam.isDisabled() : 'N/A';
    const btnTextAfter = btnAfterSpam ? await btnAfterSpam.textContent() : 'N/A';

    console.log('\n' + '═'.repeat(60));
    console.log('📋 RESULTS:');
    console.log(`   Total OTP API requests sent: ${otpRequests.length}`);
    console.log(`   Total Firebase requests: ${firebaseRequests.length}`);
    console.log(`   Button disabled after 1st click: ${btnDisabledAfter}`);
    console.log(`   Button text after spam: "${String(btnTextAfter).trim()}"`);

    if (otpRequests.length > 1) {
      console.log(`\n   🚨 CRITICAL: ${otpRequests.length} OTP requests sent!`);
      console.log(`   → Нет debounce/lock! Кнопка не блокируется!`);
      const timeDiffs = [];
      for (let i = 1; i < otpRequests.length; i++) {
        timeDiffs.push(otpRequests[i].timestamp - otpRequests[i - 1].timestamp);
      }
      console.log(`   → Time gaps between requests: ${timeDiffs.map(d => d + 'ms').join(', ')}`);
    } else if (otpRequests.length === 1) {
      console.log(`\n   ✅ PERFECT: Only 1 OTP request sent despite 5 clicks`);
    } else {
      console.log(`\n   ⚠️ No OTP requests intercepted (requests may go to Firebase directly)`);
    }

  } catch (err) {
    console.error('❌ Test failed:', err.message);
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
})();
