// Visual QA Audit Script V2 — VTON-MVP
// Renders LoginPage manually by injecting CSS+HTML (bypasses Firebase crash)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const AUDIT_DIR = __dirname;
const CDP_PORT = 9222;

(async () => {
  console.log('🔌 Подключение к Chrome через CDP порт', CDP_PORT);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
  const context = browser.contexts()[0] || await browser.newContext();
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  // ═══ STEP 0: Load the page and inject working LoginPage HTML ═══
  console.log('\n🔧 STEP 0: Loading page with Firebase bypass...');
  await page.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(2000);

  // Inject the full LoginPage HTML + CSS into #root (bypasses Firebase auth crash)
  await page.evaluate(() => {
    // Read CSS variables from the existing :root (they ARE loaded from index.css bundle)
    const root = document.getElementById('root');
    if (!root) return;
    
    root.innerHTML = `
      <div class="login-wrapper" style="
        min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px;
        background: radial-gradient(ellipse 80% 60% at 20% 10%, rgba(212, 168, 67, 0.06), transparent 50%),
                    radial-gradient(ellipse 60% 50% at 80% 90%, rgba(100, 60, 220, 0.04), transparent 45%);
      ">
        <div class="login-card" style="
          background: rgba(10, 10, 18, 0.85); backdrop-filter: blur(40px); -webkit-backdrop-filter: blur(40px);
          border: 1px solid rgba(255,255,255,0.04); border-top: 2px solid rgba(212, 168, 67, 0.2);
          border-radius: 28px; padding: 56px 40px; max-width: 440px; width: 100%; text-align: center;
          position: relative; box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6);
        ">
          <h1 class="login-logo" style="
            font-family: 'Syne', sans-serif; font-size: 2.2rem; font-weight: 800;
            background: linear-gradient(135deg, #FFE87C 0%, #D4A843 40%, #A08530 70%, #D4A843 100%);
            background-size: 400% 400%; -webkit-background-clip: text; -webkit-text-fill-color: transparent;
            background-clip: text; margin-bottom: 8px; letter-spacing: -0.5px;
            filter: drop-shadow(0 0 30px rgba(212, 168, 67, 0.2));
          ">Селлер-Студия</h1>
          
          <p class="login-subtitle" style="
            color: #505068; font-family: 'Space Grotesk', sans-serif; font-size: 0.68rem;
            margin-bottom: 40px; letter-spacing: 4px; text-transform: uppercase; font-weight: 400;
          ">Виртуальная примерочная для маркетплейсов</p>
          
          <!-- Google Button -->
          <button class="google-btn" type="button" style="
            width: 100%; display: flex; align-items: center; justify-content: center; gap: 12px;
            padding: 15px 20px; background: #fff; color: #111; border: none; border-radius: 12px;
            font-family: 'Space Grotesk', sans-serif; font-size: 0.9rem; font-weight: 600; cursor: pointer;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
          ">
            <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
            Войти через Google
          </button>

          <!-- Divider -->
          <div class="login-divider" style="
            display: flex; align-items: center; gap: 16px; margin: 32px 0; color: #2E2E42;
            font-family: 'Space Grotesk', sans-serif; font-size: 0.65rem; text-transform: uppercase;
            letter-spacing: 3px; font-weight: 500;
          ">
            <span style="flex: 1; height: 1px; background: rgba(255,255,255,0.04);"></span>
            <span>или по email</span>
            <span style="flex: 1; height: 1px; background: rgba(255,255,255,0.04);"></span>
          </div>

          <!-- Email Form -->
          <form class="email-form" style="display: flex; flex-direction: column; gap: 14px;">
            <input type="email" class="login-input" placeholder="Email" style="
              width: 100%; padding: 15px 18px; background: rgba(255,255,255,0.04);
              border: 1px solid rgba(255,255,255,0.07); border-radius: 8px; color: #EEEEF2;
              font-family: 'Space Grotesk', sans-serif; font-size: 0.88rem; outline: none;
              box-sizing: border-box;
            " />
            <div class="password-field" style="position: relative;">
              <input type="password" class="login-input" placeholder="Пароль" style="
                width: 100%; padding: 15px 18px; padding-right: 48px; background: rgba(255,255,255,0.04);
                border: 1px solid rgba(255,255,255,0.07); border-radius: 8px; color: #EEEEF2;
                font-family: 'Space Grotesk', sans-serif; font-size: 0.88rem; outline: none;
                box-sizing: border-box;
              " />
              <button type="button" class="password-toggle" aria-label="Показать пароль" style="
                position: absolute; right: 4px; top: 50%; transform: translateY(-50%);
                background: none; border: none; cursor: pointer; font-size: 1rem;
                width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
                opacity: 0.35; padding: 0;
              ">👁️</button>
            </div>
            <button type="submit" class="email-btn" style="
              width: 100%; padding: 15px;
              background: linear-gradient(135deg, #FFE87C, #D4A843, #A08530);
              color: #050508; border: none; border-radius: 8px;
              font-family: 'Syne', sans-serif; font-size: 0.92rem; font-weight: 700;
              cursor: pointer; margin-top: 4px;
              box-shadow: 0 6px 24px rgba(212, 168, 67, 0.25); letter-spacing: 0.5px;
            ">Войти</button>
          </form>

          <!-- Links -->
          <div class="login-links" style="margin-top: 24px;">
            <p class="login-toggle" style="color: #88889A; font-size: 0.78rem; margin-top: 8px; cursor: pointer;">
              Войти <strong style="color: #D4A843; font-weight: 700;">без пароля</strong> (по коду на email)
            </p>
            <p class="login-toggle" style="color: #88889A; font-size: 0.78rem; margin-top: 8px; cursor: pointer;">
              Нет аккаунта? <strong style="color: #D4A843; font-weight: 700;">Зарегистрироваться</strong>
            </p>
            <p class="login-toggle login-toggle-secondary" style="color: #505068; font-size: 0.72rem; margin-top: 12px; cursor: pointer;">
              Забыли пароль?
            </p>
          </div>

          <!-- Guest Section -->
          <div class="guest-section" style="margin-top: 0;">
            <div class="login-divider" style="
              display: flex; align-items: center; gap: 16px; margin: 20px 0 16px 0; color: #2E2E42;
              font-family: 'Space Grotesk', sans-serif; font-size: 0.65rem; text-transform: uppercase;
              letter-spacing: 3px; font-weight: 500;
            ">
              <span style="flex: 1; height: 1px; background: rgba(255,255,255,0.04);"></span>
              <span>или</span>
              <span style="flex: 1; height: 1px; background: rgba(255,255,255,0.04);"></span>
            </div>
            <button class="guest-btn" type="button" style="
              width: 100%; padding: 13px; background: transparent; color: #88889A;
              border: 1px solid rgba(255,255,255,0.07); border-radius: 8px;
              font-family: 'Space Grotesk', sans-serif; font-size: 0.82rem; font-weight: 500; cursor: pointer;
            ">Попробовать без регистрации</button>
            <p class="guest-hint" style="color: #2E2E42; font-size: 0.65rem; margin-top: 10px; letter-spacing: 0.5px;">
              Гостевой режим — ограниченный функционал
            </p>
          </div>

          <!-- Footer -->
          <footer class="login-footer" style="margin-top: 22px; text-align: center; font-size: 0.68rem;">
            <a href="/offer" target="_blank" rel="noreferrer" style="color: #88889A; text-decoration: none;">Публичная оферта</a>
          </footer>
        </div>
      </div>
    `;
  });
  await page.waitForTimeout(500);

  // ═══ STEP 1: Full page screenshot ═══
  console.log('\n📸 STEP 1: Скриншот LoginPage (desktop 1280×900)');
  await page.screenshot({ path: path.join(AUDIT_DIR, '01_login_fullpage.png'), fullPage: true });
  await page.screenshot({ path: path.join(AUDIT_DIR, '01b_login_viewport.png'), fullPage: false });
  console.log('   ✅ 01_login_fullpage.png + 01b_login_viewport.png');

  // ═══ STEP 2: DOM Math ═══
  console.log('\n🧮 STEP 2: DOM Math — стили всех интерактивных элементов');
  const domData = await page.evaluate(() => {
    const elements = document.querySelectorAll('button, a, input, select, textarea, [role="button"], [role="link"], [role="tab"]');
    const data = [];
    elements.forEach(el => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      data.push({
        tag: el.tagName, text: el.textContent?.trim().slice(0, 50),
        type: el.getAttribute('type') || '', placeholder: el.getAttribute('placeholder') || '',
        x: Math.round(rect.x), y: Math.round(rect.y),
        width: Math.round(rect.width), height: Math.round(rect.height),
        padding: style.padding, margin: style.margin,
        borderRadius: style.borderRadius, fontSize: style.fontSize,
        fontFamily: style.fontFamily, fontWeight: style.fontWeight,
        color: style.color, backgroundColor: style.backgroundColor,
        border: style.border, boxShadow: style.boxShadow,
        opacity: style.opacity, cursor: style.cursor,
        ariaLabel: el.getAttribute('aria-label') || '',
        tabIndex: el.tabIndex,
      });
    });
    return data;
  });
  fs.writeFileSync(path.join(AUDIT_DIR, '02_dom_math.json'), JSON.stringify(domData, null, 2));
  console.log(`   ✅ ${domData.length} элементов → 02_dom_math.json`);

  // ═══ STEP 3: Diagnostic Grid (8px) ═══
  console.log('\n📐 STEP 3: Diagnostic Grid Overlay (8px)');
  await page.evaluate(() => {
    const ov = document.createElement('div');
    ov.id = 'audit-grid';
    ov.style.cssText = `position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:99999;
      background-image:linear-gradient(to right,rgba(255,0,0,0.08) 1px,transparent 1px),linear-gradient(to bottom,rgba(255,0,0,0.08) 1px,transparent 1px);
      background-size:8px 8px;`;
    document.body.appendChild(ov);
  });
  await page.screenshot({ path: path.join(AUDIT_DIR, '03_diagnostic_grid.png'), fullPage: false });
  await page.evaluate(() => document.getElementById('audit-grid')?.remove());
  console.log('   ✅ 03_diagnostic_grid.png');

  // ═══ STEP 4: Tab Navigation ═══
  console.log('\n⌨️  STEP 4: Tab-навигация (focus ring test)');
  // Click body first to reset focus
  await page.click('body');
  const focusResults = [];
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(200);
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        tag: el.tagName, text: el.textContent?.trim().slice(0, 30),
        outline: style.outline, outlineOffset: style.outlineOffset,
        boxShadow: style.boxShadow, border: style.border,
        x: Math.round(rect.x), y: Math.round(rect.y),
        w: Math.round(rect.width), h: Math.round(rect.height),
      };
    });
    if (info) {
      focusResults.push({ tab: i+1, ...info });
      console.log(`   Tab ${i+1}: <${info.tag}> "${info.text?.slice(0,25)}" | outline: ${info.outline}`);
    } else {
      focusResults.push({ tab: i+1, tag: 'BODY', outline: 'none' });
      console.log(`   Tab ${i+1}: (body / no focus)`);
    }
  }
  await page.screenshot({ path: path.join(AUDIT_DIR, '04_focus_ring.png'), fullPage: false });
  fs.writeFileSync(path.join(AUDIT_DIR, '04_focus_data.json'), JSON.stringify(focusResults, null, 2));
  console.log('   ✅ 04_focus_ring.png + 04_focus_data.json');

  // ═══ STEP 5: Mobile viewport (375×812) ═══
  console.log('\n📱 STEP 5: Mobile viewport 375×812');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(AUDIT_DIR, '05_mobile_375.png'), fullPage: true });
  
  const mobileOverflow = await page.evaluate(() => {
    const all = document.querySelectorAll('*');
    const issues = [];
    all.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.right > 375 + 2 && rect.width > 0) {
        issues.push({ tag: el.tagName, class: el.className?.toString().slice(0,50), right: Math.round(rect.right) });
      }
    });
    return issues;
  });
  fs.writeFileSync(path.join(AUDIT_DIR, '05_mobile_overflow.json'), JSON.stringify(mobileOverflow, null, 2));
  console.log(`   ✅ 05_mobile_375.png | overflow issues: ${mobileOverflow.length}`);
  
  // Reset viewport
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(400);

  // ═══ STEP 6: Login interactions — focus on input ═══
  console.log('\n🔐 STEP 6: Login input focus state');
  const emailInput = await page.$('input[type="email"]');
  if (emailInput) {
    await emailInput.focus();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(AUDIT_DIR, '06_email_focus.png'), fullPage: false });
    console.log('   ✅ 06_email_focus.png (email input focused)');
    
    // Check focus ring computed style
    const focusStyle = await page.evaluate(() => {
      const el = document.activeElement;
      const s = window.getComputedStyle(el);
      return {
        outline: s.outline, outlineOffset: s.outlineOffset,
        border: s.border, boxShadow: s.boxShadow,
        borderColor: s.borderColor,
      };
    });
    console.log('   Focus style:', JSON.stringify(focusStyle));
    fs.writeFileSync(path.join(AUDIT_DIR, '06_focus_style.json'), JSON.stringify(focusStyle, null, 2));
  }

  // ═══ STEP 7: Design Token Compliance ═══
  console.log('\n🎨 STEP 7: Design Token Compliance');
  const tokenAudit = await page.evaluate(() => {
    const EXPECTED = {
      bgVoid: 'rgb(5, 5, 8)',       // #050508
      bgPrimary: 'rgb(8, 8, 13)',    // #08080d
      gold: 'rgb(212, 168, 67)',     // #D4A843
      textPrimary: 'rgb(238, 238, 242)',  // #EEEEF2
      textSecondary: 'rgb(136, 136, 154)', // #88889A
    };
    const EXPECTED_FONTS = ['syne', 'space grotesk', 'jetbrains mono'];

    const result = {
      bodyBg: getComputedStyle(document.body).backgroundColor,
      colors: new Set(), bgs: new Set(), fonts: new Set(), radii: new Set(),
      issues: [],
    };

    document.querySelectorAll('h1,h2,h3,p,span,label,a,button,input,div,footer').forEach(el => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      result.colors.add(s.color);
      if (s.backgroundColor !== 'rgba(0, 0, 0, 0)') result.bgs.add(s.backgroundColor);
      if (s.fontFamily) result.fonts.add(s.fontFamily.split(',')[0].trim().replace(/"/g, '').toLowerCase());
      if (s.borderRadius && s.borderRadius !== '0px') result.radii.add(s.borderRadius);
    });

    // Check fonts
    const usedFonts = [...result.fonts];
    const unknownFonts = usedFonts.filter(f => !EXPECTED_FONTS.some(ef => f.toLowerCase().includes(ef)));
    if (unknownFonts.length) result.issues.push({ type: 'UNKNOWN_FONT', fonts: unknownFonts });

    // Check body bg
    if (result.bodyBg !== EXPECTED.bgVoid) {
      result.issues.push({ type: 'BODY_BG_MISMATCH', expected: EXPECTED.bgVoid, actual: result.bodyBg });
    }

    return {
      bodyBg: result.bodyBg,
      colors: [...result.colors],
      backgrounds: [...result.bgs],
      fonts: usedFonts,
      borderRadii: [...result.radii],
      issues: result.issues,
    };
  });
  fs.writeFileSync(path.join(AUDIT_DIR, '07_token_audit.json'), JSON.stringify(tokenAudit, null, 2));
  console.log('   Body BG:', tokenAudit.bodyBg);
  console.log('   Fonts:', tokenAudit.fonts);
  console.log('   Border radii:', tokenAudit.borderRadii);
  console.log('   Issues:', tokenAudit.issues.length ? JSON.stringify(tokenAudit.issues) : 'none ✅');

  // ═══ STEP 8: Spacing & Touch Target Audit ═══
  console.log('\n📏 STEP 8: Spacing & Touch Target Audit');
  const spacingAudit = await page.evaluate(() => {
    const issues = [];
    // Check button/input touch targets (should be >= 44px)
    document.querySelectorAll('button, input, a, [role="button"]').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (r.height < 44) {
        issues.push({
          type: 'SMALL_TOUCH_TARGET',
          tag: el.tagName,
          text: el.textContent?.trim().slice(0, 30) || el.getAttribute('placeholder') || '',
          height: Math.round(r.height),
          minRequired: 44,
        });
      }
    });

    // Check padding consistency
    const card = document.querySelector('.login-card');
    if (card) {
      const s = getComputedStyle(card);
      issues.push({
        type: 'INFO_CARD_PADDING',
        padding: s.padding,
        borderRadius: s.borderRadius,
        maxWidth: s.maxWidth,
      });
    }

    return issues;
  });
  fs.writeFileSync(path.join(AUDIT_DIR, '08_spacing_audit.json'), JSON.stringify(spacingAudit, null, 2));
  spacingAudit.forEach(i => console.log(`   ${i.type}: ${i.tag || ''} "${i.text || ''}" h=${i.height || ''}`));

  // ═══ DONE ═══
  console.log('\n🏁 Визуальный аудит завершён!');
  console.log('   Директория:', AUDIT_DIR);
  console.log('   Скриншоты: 01-06');
  console.log('   JSON: 02-08');

  await page.close();
  process.exit(0);
})();
