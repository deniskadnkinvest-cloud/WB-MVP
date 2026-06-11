/**
 * CHAOS TEST 04: Keyboard Navigation & Focus Rings
 * Tab'ом проходим по всей странице
 * Проверяем: все ли элементы достижимы? Видны ли focus ring?
 */
const { chromium } = require('playwright');
const path = require('path');

const SCREENSHOTS = path.join(__dirname);
const URL = 'http://localhost:4173/';

(async () => {
  console.log('⌨️ [TEST 04] Keyboard Navigation & Focus Rings');
  console.log('═'.repeat(60));

  let browser, context, page;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    context = browser.contexts()[0] || await browser.newContext();
    page = await context.newPage();

    // Навигация
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    await page.screenshot({ path: path.join(SCREENSHOTS, '04-keyboard-initial.png'), fullPage: true });
    console.log('📸 Screenshot #1: Initial page');

    // Собираем все интерактивные элементы до Tab-навигации
    const interactiveElements = await page.evaluate(() => {
      const elements = document.querySelectorAll('a, button, input, select, textarea, [tabindex], [role="button"]');
      return Array.from(elements).map((el, i) => ({
        index: i,
        tag: el.tagName.toLowerCase(),
        type: el.type || '',
        text: (el.textContent || '').trim().substring(0, 40),
        tabIndex: el.tabIndex,
        ariaLabel: el.getAttribute('aria-label') || '',
        hasHref: el.hasAttribute('href'),
        disabled: el.disabled || false,
        visible: el.offsetHeight > 0 && el.offsetWidth > 0,
      }));
    });
    
    console.log(`\n📊 Interactive elements on page: ${interactiveElements.length}`);
    interactiveElements.forEach(el => {
      const vis = el.visible ? '👁️' : '🫥';
      const dis = el.disabled ? '🚫' : '✅';
      console.log(`   ${vis} ${dis} <${el.tag}${el.type ? ' type="' + el.type + '"' : ''}> tab=${el.tabIndex} "${el.text}" ${el.ariaLabel ? 'aria="' + el.ariaLabel + '"' : ''}`);
    });

    // Tab навигация
    console.log('\n⌨️ Starting Tab navigation...');
    const focusedElements = [];
    const MAX_TABS = 30; // безопасный лимит

    for (let i = 0; i < MAX_TABS; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(200);

      const focusInfo = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        
        const style = window.getComputedStyle(el);
        const outline = style.outline;
        const boxShadow = style.boxShadow;
        const border = style.border;
        const outlineColor = style.outlineColor;
        
        // Проверяем видимость focus ring
        const hasOutline = outline && outline !== 'none' && !outline.includes('0px');
        const hasBoxShadow = boxShadow && boxShadow !== 'none';
        const hasFocusIndicator = hasOutline || hasBoxShadow;
        
        return {
          tag: el.tagName.toLowerCase(),
          type: el.type || '',
          text: (el.textContent || '').trim().substring(0, 40),
          ariaLabel: el.getAttribute('aria-label') || '',
          className: el.className?.toString().substring(0, 40) || '',
          outline,
          boxShadow: boxShadow?.substring(0, 60) || 'none',
          hasFocusIndicator,
          rect: el.getBoundingClientRect(),
        };
      });

      if (!focusInfo) {
        console.log(`   Tab #${i + 1}: Focus lost (body)`);
        if (i > 3) break; // Если фокус вернулся на body после нескольких табов, мы прошли круг
        continue;
      }

      // Проверяем на дубликат (цикл)
      const key = `${focusInfo.tag}-${focusInfo.text}-${focusInfo.className}`;
      if (focusedElements.length > 2 && focusedElements[0].key === key) {
        console.log(`   Tab #${i + 1}: ♻️ Cycle detected — back to first element`);
        break;
      }

      focusedElements.push({ ...focusInfo, key, tabIndex: i + 1 });
      
      const focusIcon = focusInfo.hasFocusIndicator ? '🟢' : '🔴';
      console.log(`   Tab #${i + 1}: ${focusIcon} <${focusInfo.tag}${focusInfo.type ? ' type="' + focusInfo.type + '"' : ''}> "${focusInfo.text}" focus=${focusInfo.hasFocusIndicator ? 'VISIBLE' : 'INVISIBLE!'}`);

      // Скриншот на каждом 3-м элементе
      if ((i + 1) % 3 === 0) {
        await page.screenshot({ path: path.join(SCREENSHOTS, `04-keyboard-tab-${i + 1}.png`), fullPage: true });
      }
    }

    // Финальный скриншот
    await page.screenshot({ path: path.join(SCREENSHOTS, '04-keyboard-final.png'), fullPage: true });
    console.log('📸 Screenshot: Final keyboard state');

    // Анализ
    const totalFocusable = focusedElements.length;
    const withFocusRing = focusedElements.filter(e => e.hasFocusIndicator).length;
    const withoutFocusRing = focusedElements.filter(e => !e.hasFocusIndicator).length;

    console.log('\n' + '═'.repeat(60));
    console.log('📋 RESULTS:');
    console.log(`   Total focusable elements reached: ${totalFocusable}`);
    console.log(`   With visible focus ring: ${withFocusRing} ✅`);
    console.log(`   WITHOUT focus ring: ${withoutFocusRing} ${withoutFocusRing > 0 ? '🚨' : '✅'}`);

    if (withoutFocusRing > 0) {
      console.log('\n   🚨 Elements WITHOUT focus indicator:');
      focusedElements.filter(e => !e.hasFocusIndicator).forEach(e => {
        console.log(`      <${e.tag}> "${e.text}" class="${e.className}"`);
      });
    }

    // Проверяем a11y: ARIA labels на кнопках без текста
    const missingAria = interactiveElements.filter(e => 
      e.visible && !e.disabled && !e.text && !e.ariaLabel && e.tag === 'button'
    );
    if (missingAria.length > 0) {
      console.log(`\n   🚨 Buttons without text or aria-label: ${missingAria.length}`);
    }

  } catch (err) {
    console.error('❌ Test failed:', err.message);
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
})();
