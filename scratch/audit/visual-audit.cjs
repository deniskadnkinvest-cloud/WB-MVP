// Visual QA Audit Script — VTON-MVP
// Playwright CDP, CommonJS
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const AUDIT_DIR = __dirname;
const APP_URL = 'http://localhost:4173/';
const CDP_PORT = 9222;

(async () => {
  console.log('🔌 Подключение к Chrome через CDP порт', CDP_PORT);
  let browser;
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
  } catch (e) {
    console.error('❌ Не удалось подключиться к Chrome CDP:', e.message);
    process.exit(1);
  }
  console.log('✅ Подключено к Chrome');

  const context = browser.contexts()[0] || await browser.newContext();
  const page = await context.newPage();

  // ─────────── STEP 1: Открыть страницу и скриншот ───────────
  console.log('\n📸 STEP 1: Открываю', APP_URL);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  const title = await page.title();
  console.log('   Заголовок:', title);

  await page.screenshot({
    path: path.join(AUDIT_DIR, '01_login_fullpage.png'),
    fullPage: true,
  });
  console.log('   ✅ Скриншот: 01_login_fullpage.png');

  // viewport screenshot
  await page.screenshot({
    path: path.join(AUDIT_DIR, '01b_login_viewport.png'),
    fullPage: false,
  });

  // ─────────── STEP 2: DOM Math — сбор стилей элементов ───────────
  console.log('\n🧮 STEP 2: DOM Math — извлечение стилей интерактивных элементов');
  const domData = await page.evaluate(() => {
    const elements = document.querySelectorAll(
      'button, a, input, select, textarea, [role="button"], [role="link"], [role="tab"]'
    );
    const data = [];
    elements.forEach(el => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      data.push({
        tag: el.tagName,
        text: el.textContent?.trim().slice(0, 50),
        type: el.getAttribute('type') || '',
        placeholder: el.getAttribute('placeholder') || '',
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        padding: style.padding,
        margin: style.margin,
        borderRadius: style.borderRadius,
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        color: style.color,
        backgroundColor: style.backgroundColor,
        border: style.border,
        boxShadow: style.boxShadow,
        opacity: style.opacity,
        cursor: style.cursor,
        display: style.display,
        gap: style.gap,
        ariaLabel: el.getAttribute('aria-label') || '',
        role: el.getAttribute('role') || '',
        tabIndex: el.tabIndex,
      });
    });
    return data;
  });

  const domJsonPath = path.join(AUDIT_DIR, '02_dom_math.json');
  fs.writeFileSync(domJsonPath, JSON.stringify(domData, null, 2), 'utf-8');
  console.log(`   ✅ DOM Math: ${domData.length} элементов → 02_dom_math.json`);

  // ─────────── STEP 3: Diagnostic Grid Overlay (8px) ───────────
  console.log('\n📐 STEP 3: Diagnostic Grid Overlay (8px)');
  await page.evaluate(() => {
    const overlay = document.createElement('div');
    overlay.id = 'audit-grid-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      pointer-events: none; z-index: 99999;
      background-image:
        linear-gradient(to right, rgba(255,0,0,0.07) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255,0,0,0.07) 1px, transparent 1px);
      background-size: 8px 8px;
    `;
    document.body.appendChild(overlay);
  });
  await page.screenshot({
    path: path.join(AUDIT_DIR, '03_diagnostic_grid.png'),
    fullPage: false,
  });
  console.log('   ✅ Скриншот: 03_diagnostic_grid.png');

  // Remove overlay
  await page.evaluate(() => {
    document.getElementById('audit-grid-overlay')?.remove();
  });

  // ─────────── STEP 4: Tab Navigation & Focus Ring ───────────
  console.log('\n⌨️  STEP 4: Tab-навигация (10 нажатий Tab)');
  const focusResults = [];
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);

    const focusInfo = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        tag: el.tagName,
        text: el.textContent?.trim().slice(0, 50),
        outline: style.outline,
        outlineOffset: style.outlineOffset,
        boxShadow: style.boxShadow,
        border: style.border,
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        visible: rect.width > 0 && rect.height > 0,
      };
    });

    if (focusInfo) {
      focusResults.push({ tabIndex: i + 1, ...focusInfo });
      console.log(`   Tab ${i + 1}: <${focusInfo.tag}> "${focusInfo.text?.slice(0, 30)}" | outline: ${focusInfo.outline}`);
    } else {
      focusResults.push({ tabIndex: i + 1, tag: 'BODY', text: '(no focus)', outline: 'none' });
      console.log(`   Tab ${i + 1}: (нет фокуса или body)`);
    }
  }

  // Screenshot with focus ring visible on last focused element
  await page.screenshot({
    path: path.join(AUDIT_DIR, '04_focus_ring.png'),
    fullPage: false,
  });
  console.log('   ✅ Скриншот: 04_focus_ring.png');

  fs.writeFileSync(
    path.join(AUDIT_DIR, '04_focus_data.json'),
    JSON.stringify(focusResults, null, 2),
    'utf-8'
  );

  // ─────────── STEP 5: Mobile Viewport (375px) ───────────
  console.log('\n📱 STEP 5: Mobile viewport (375×812)');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(800);
  await page.screenshot({
    path: path.join(AUDIT_DIR, '05_mobile_375.png'),
    fullPage: true,
  });
  console.log('   ✅ Скриншот: 05_mobile_375.png');

  // Mobile DOM Math
  const mobileDom = await page.evaluate(() => {
    const elements = document.querySelectorAll(
      'button, a, input, select, textarea, [role="button"], [role="link"], [role="tab"]'
    );
    const data = [];
    elements.forEach(el => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      data.push({
        tag: el.tagName,
        text: el.textContent?.trim().slice(0, 50),
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        overflow: rect.right > 375 ? 'OVERFLOW_RIGHT' : 'ok',
        fontSize: style.fontSize,
        padding: style.padding,
      });
    });
    return data;
  });
  fs.writeFileSync(
    path.join(AUDIT_DIR, '05_mobile_dom.json'),
    JSON.stringify(mobileDom, null, 2),
    'utf-8'
  );
  console.log(`   Mobile DOM: ${mobileDom.length} элементов → 05_mobile_dom.json`);

  // Reset viewport back
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(500);

  // ─────────── STEP 6: Login Page Interactions ───────────
  console.log('\n🔐 STEP 6: Проверка Login Page');

  // Check if we are on login page
  const hasLoginForm = await page.evaluate(() => {
    const inputs = document.querySelectorAll('input[type="email"], input[type="text"], input[type="password"]');
    const buttons = document.querySelectorAll('button');
    return {
      inputCount: inputs.length,
      buttonCount: buttons.length,
      hasEmailInput: !!document.querySelector('input[type="email"]'),
      hasPasswordInput: !!document.querySelector('input[type="password"]'),
      buttonTexts: Array.from(buttons).map(b => b.textContent?.trim().slice(0, 40)),
      pageText: document.body?.innerText?.slice(0, 500),
    };
  });

  console.log('   Форма:', JSON.stringify(hasLoginForm, null, 2));
  fs.writeFileSync(
    path.join(AUDIT_DIR, '06_login_form_info.json'),
    JSON.stringify(hasLoginForm, null, 2),
    'utf-8'
  );

  // Try to focus on email input and screenshot
  const emailSelector = 'input[type="email"], input[type="text"]';
  const emailInput = await page.$(emailSelector);
  if (emailInput) {
    await emailInput.focus();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(AUDIT_DIR, '06b_email_focus.png'),
      fullPage: false,
    });
    console.log('   ✅ Скриншот: 06b_email_focus.png (email input focused)');

    // Try clicking submit with empty email
    const submitBtn = await page.$('button[type="submit"], button:has-text("Sign"), button:has-text("Log"), button:has-text("Вход")');
    if (submitBtn) {
      await submitBtn.click();
      await page.waitForTimeout(800);
      await page.screenshot({
        path: path.join(AUDIT_DIR, '06c_empty_submit.png'),
        fullPage: false,
      });
      console.log('   ✅ Скриншот: 06c_empty_submit.png (empty form submit)');
    }
  }

  // ─────────── STEP 7: Full Layout & Spacing Audit ───────────
  console.log('\n📏 STEP 7: Layout & Spacing Audit');
  const layoutData = await page.evaluate(() => {
    const all = document.querySelectorAll('*');
    const issues = [];
    const seen = new Set();
    all.forEach(el => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const tag = el.tagName.toLowerCase();

      // Skip invisible, tiny, or very common layout elements
      if (rect.width === 0 || rect.height === 0) return;
      if (['html', 'head', 'script', 'style', 'meta', 'link', 'noscript'].includes(tag)) return;

      // Check horizontal overflow
      if (rect.right > window.innerWidth + 2) {
        const key = `overflow-${tag}-${Math.round(rect.x)}-${Math.round(rect.y)}`;
        if (!seen.has(key)) {
          seen.add(key);
          issues.push({
            type: 'HORIZONTAL_OVERFLOW',
            tag,
            class: el.className?.toString().slice(0, 60),
            right: Math.round(rect.right),
            viewportWidth: window.innerWidth,
          });
        }
      }

      // Check z-index stacking
      const z = parseInt(style.zIndex);
      if (z > 100) {
        issues.push({
          type: 'HIGH_Z_INDEX',
          tag,
          class: el.className?.toString().slice(0, 60),
          zIndex: z,
        });
      }

      // Check text contrast (very basic)
      if (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3) {
        const text = el.textContent?.trim();
        if (text && text.length > 0) {
          const color = style.color;
          const bg = style.backgroundColor;
          if (color && bg && color === bg) {
            issues.push({
              type: 'ZERO_CONTRAST',
              tag,
              text: text.slice(0, 30),
              color,
              bg,
            });
          }
        }
      }
    });
    return issues;
  });

  fs.writeFileSync(
    path.join(AUDIT_DIR, '07_layout_issues.json'),
    JSON.stringify(layoutData, null, 2),
    'utf-8'
  );
  console.log(`   Layout issues found: ${layoutData.length}`);

  // ─────────── STEP 8: Design Token Compliance ───────────
  console.log('\n🎨 STEP 8: Design Token Compliance Check');
  const tokenAudit = await page.evaluate(() => {
    const EXPECTED_TOKENS = {
      bgVoid: '#050508',
      bgPrimary: '#08080d',
      goldAccent: '#d4a843',
      textPrimary: '#eeeef2',
      textSecondary: '#88889a',
    };
    const EXPECTED_FONTS = ['syne', 'space grotesk', 'jetbrains mono'];

    const results = {
      colorsUsed: new Set(),
      backgroundsUsed: new Set(),
      fontsUsed: new Set(),
      borderRadii: new Set(),
      mismatches: [],
    };

    const textEls = document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, label, a, button, input, div');
    textEls.forEach(el => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      results.colorsUsed.add(style.color);
      if (style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        results.backgroundsUsed.add(style.backgroundColor);
      }
      if (style.fontFamily) {
        results.fontsUsed.add(style.fontFamily.split(',')[0].trim().replace(/"/g, '').toLowerCase());
      }
      if (style.borderRadius && style.borderRadius !== '0px') {
        results.borderRadii.add(style.borderRadius);
      }
    });

    return {
      colorsUsed: [...results.colorsUsed],
      backgroundsUsed: [...results.backgroundsUsed],
      fontsUsed: [...results.fontsUsed],
      borderRadii: [...results.borderRadii],
      expectedFonts: EXPECTED_FONTS,
    };
  });

  fs.writeFileSync(
    path.join(AUDIT_DIR, '08_token_audit.json'),
    JSON.stringify(tokenAudit, null, 2),
    'utf-8'
  );
  console.log('   Colors used:', tokenAudit.colorsUsed.length);
  console.log('   Backgrounds used:', tokenAudit.backgroundsUsed.length);
  console.log('   Fonts used:', tokenAudit.fontsUsed);
  console.log('   Border radii:', tokenAudit.borderRadii);

  // ─────────── FINAL: Close ───────────
  console.log('\n🏁 Аудит завершён! Файлы сохранены в:', AUDIT_DIR);
  console.log('   Скриншоты: 01_login_fullpage.png, 03_diagnostic_grid.png, 04_focus_ring.png, 05_mobile_375.png');
  console.log('   JSON данные: 02_dom_math.json, 04_focus_data.json, 05_mobile_dom.json, 06_login_form_info.json, 07_layout_issues.json, 08_token_audit.json');

  await page.close();
  // Don't disconnect browser - other tabs may be open
  process.exit(0);
})();
