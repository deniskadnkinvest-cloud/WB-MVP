/**
 * CHAOS TEST 01: Network Stress (Slow 3G Throttling)
 * Проверяет: скелетоны, loading state, или белый экран при медленной сети
 */
const { chromium } = require('playwright');
const path = require('path');

const SCREENSHOTS = path.join(__dirname);
const URL = 'http://localhost:4173/';

(async () => {
  console.log('🌐 [TEST 01] Network Stress — Slow 3G Throttle');
  console.log('═'.repeat(60));

  let browser, context, page;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    context = browser.contexts()[0] || await browser.newContext();
    page = await context.newPage();

    // Включаем CDP для Network throttling
    const cdpSession = await page.context().newCDPSession(page);
    
    // Slow 3G: downloadThroughput 50KB/s, uploadThroughput 20KB/s, latency 2000ms
    await cdpSession.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: 50000,   // 50 KB/s
      uploadThroughput: 20000,     // 20 KB/s
      latency: 2000,               // 2 seconds
    });
    console.log('✅ Slow 3G throttling enabled (50KB/s down, 20KB/s up, 2s latency)');

    // Засекаем время
    const startTime = Date.now();

    // Навигация — НЕ ждём networkidle, просто domcontentloaded
    console.log('⏳ Navigating to', URL);
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const domTime = Date.now() - startTime;
    console.log(`📊 DOM Content Loaded: ${domTime}ms`);

    // Скриншот #1 — сразу после DOMContentLoaded (ещё не всё загрузилось)
    await page.screenshot({ path: path.join(SCREENSHOTS, '01-slow3g-dom-loaded.png'), fullPage: true });
    console.log('📸 Screenshot #1: DOM loaded state');

    // Проверяем: есть ли какой-то контент?
    const bodyText = await page.textContent('body');
    const hasContent = bodyText && bodyText.trim().length > 10;
    console.log(`   Body text length: ${bodyText?.trim().length || 0}`);
    console.log(`   Has visible content: ${hasContent ? '✅ YES' : '🚨 NO (white screen!)'}`);

    // Проверяем скелетоны / loading states
    const skeletons = await page.$$('[class*="skeleton"], [class*="shimmer"], [class*="loading"], [class*="spinner"], [class*="pulse"]');
    console.log(`   Skeleton/Loading elements found: ${skeletons.length}`);

    // Ждём ещё 3 секунды для подгрузки
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(SCREENSHOTS, '01-slow3g-after-3s.png'), fullPage: true });
    console.log('📸 Screenshot #2: After 3 seconds');

    // Ждём полную загрузку (с увеличенным таймаутом)
    try {
      await page.waitForLoadState('networkidle', { timeout: 45000 });
      const fullTime = Date.now() - startTime;
      console.log(`📊 Full page load (networkidle): ${fullTime}ms`);
    } catch (e) {
      console.log('⚠️ NetworkIdle timeout — page still loading after 45s');
    }

    await page.screenshot({ path: path.join(SCREENSHOTS, '01-slow3g-final.png'), fullPage: true });
    console.log('📸 Screenshot #3: Final state');

    // Анализ результатов
    const finalBodyText = await page.textContent('body');
    const finalHasContent = finalBodyText && finalBodyText.trim().length > 10;

    console.log('\n' + '═'.repeat(60));
    console.log('📋 RESULTS:');
    console.log(`   DOM load time: ${domTime}ms`);
    console.log(`   Content visible after DOM: ${hasContent ? 'YES ✅' : 'NO 🚨'}`);
    console.log(`   Skeletons/loaders present: ${skeletons.length > 0 ? `YES (${skeletons.length}) ✅` : 'NO ⚠️'}`);
    console.log(`   Final content visible: ${finalHasContent ? 'YES ✅' : 'NO 🚨'}`);

    // Отключаем throttling
    await cdpSession.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0,
    });
    console.log('\n✅ Throttling disabled');

  } catch (err) {
    console.error('❌ Test failed:', err.message);
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
})();
