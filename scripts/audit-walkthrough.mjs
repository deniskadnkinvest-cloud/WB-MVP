/**
 * UX walkthrough: authenticated click → screenshot → DOM notes.
 * Usage: node scripts/audit-walkthrough.mjs
 * Env: AUDIT_BASE=http://localhost:5180  AUDIT_REAL_GEN=0|1
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'audit-shots');
const BASE = process.env.AUDIT_BASE || 'http://localhost:5180';
const REAL_GEN = process.env.AUDIT_REAL_GEN === '1';
const session = JSON.parse(fs.readFileSync(path.join(SHOTS, 'session.json'), 'utf8'));

fs.mkdirSync(SHOTS, { recursive: true });

const findings = [];
const log = (msg) => {
  console.log(msg);
  findings.push({ t: new Date().toISOString(), msg });
};

async function shot(page, name) {
  const p = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  return p;
}

async function bodyText(page) {
  return page.locator('body').innerText().catch(() => '');
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 420, height: 900 },
    deviceScaleFactor: 2,
  });
  await context.addInitScript(({ token, user }) => {
    localStorage.setItem('vton_token', token);
    localStorage.setItem('vton_user', JSON.stringify(user));
  }, { token: session.token, user: session.user });

  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') log(`CONSOLE_ERROR: ${m.text()}`);
  });

  // ── 1. Landing authenticated ──
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  await shot(page, '01-home-auth');
  const homeText = await bodyText(page);
  log(`HOME has badge-ish: ${/кредит|Про|тариф|base|100|Генерац/i.test(homeText)}`);
  log(`HOME guest wall: ${/войти|guest|гостев/i.test(homeText) && !/mode-btn|Предметк/i.test(homeText)}`);
  const modes = await page.locator('.mode-btn').allTextContents().catch(() => []);
  log(`MODES: ${JSON.stringify(modes)}`);

  // If login still shown, try guest as fallback note
  const guest = page.locator('.guest-text-btn');
  if (await guest.isVisible().catch(() => false)) {
    log('WARN: still on login — token may not hydrate; clicking guest for partial probe');
    await guest.click();
    await page.waitForTimeout(1500);
    await shot(page, '01b-after-guest');
  }

  // ── 2. Mode: product ──
  const productBtn = page.locator('button.mode-btn:has-text("Предметк"), button:has-text("Предметка")').first();
  if (await productBtn.isVisible().catch(() => false)) {
    await productBtn.click();
    await page.waitForTimeout(800);
    await shot(page, '02-product-mode');
  } else {
    log('FAIL: product mode button not found');
  }

  // Categories + Другое
  const other = page.locator('text=Другое').first();
  if (await other.isVisible().catch(() => false)) {
    await other.click();
    await page.waitForTimeout(400);
    await shot(page, '03-other-selected');
    const input = page.locator('input.custom-variant-input, input[placeholder*="набор"], textarea[placeholder*="товар"], input[placeholder*="товар"]').first();
    if (await input.isVisible().catch(() => false)) {
      await input.click();
      await input.fill('');
      await input.pressSequentially('Конденсаторный микрофон', { delay: 15 });
      await page.waitForTimeout(300);
      await shot(page, '04-other-typed');
      const val = await input.inputValue().catch(() => '');
      const confirm = page.locator('text=Учтём при генерации');
      const confirmVisible = await confirm.isVisible().catch(() => false);
      const otherCard = page.locator('.preset-card:has-text("Другое"), button:has-text("Другое"), .category-card:has-text("Другое")').first();
      const cls = (await otherCard.getAttribute('class').catch(() => '')) || '';
      log(`OTHER value="${val}" confirm=${confirmVisible} class=${cls}`);
      if (!confirmVisible) findings.push({ bug: true, sev: '🟡', title: 'Другое: no confirmation after type' });
      if (cls && !/active/.test(cls)) findings.push({ bug: true, sev: '🟡', title: 'Другое: lost active after type' });
    } else {
      log('FAIL: custom product input not found after Другое');
      findings.push({ bug: true, sev: '🔴', title: 'Другое input missing' });
    }
  }

  // Upload test image
  const testImg = path.join(ROOT, 'public/examples/cards/epic-glass-before.jpg');
  const fileInputs = page.locator('input[type="file"]');
  const nFiles = await fileInputs.count();
  log(`file inputs: ${nFiles}`);
  if (nFiles > 0 && fs.existsSync(testImg)) {
    await fileInputs.first().setInputFiles(testImg);
    await page.waitForTimeout(2000);
    await shot(page, '05-product-uploaded');
  }

  // Set variant count to 1 to save credits during audit
  const v1 = page.locator('.variant-count-btn').filter({ hasText: /^1$/ }).first();
  if (await v1.isVisible().catch(() => false)) {
    await v1.click();
    await page.waitForTimeout(200);
  }

  // Generate
  const genBtn = page.locator('.generate-btn').first();
  if (await genBtn.isVisible().catch(() => false)) {
    await genBtn.click();
    await page.waitForTimeout(2000);
    await shot(page, '06-product-after-generate-click');
    if (REAL_GEN) {
      try {
        // Playwright signature: waitForFunction(fn, arg, options)
        await page.waitForFunction(() => {
          const t = document.body?.innerText || '';
          const hasResult = /Готово|Скачать фото|Скачать|ФИНАЛЬНЫЙ|лист/i.test(t);
          const overlayGone = !document.querySelector('.processing-overlay');
          return hasResult && overlayGone;
        }, null, { timeout: 300000 });
        await shot(page, '07-product-result');
        log('REAL_GEN product: result UI appeared');
        const dl = page.locator('button:has-text("Скачать"), a:has-text("Скачать")').first();
        log(`Download btn visible: ${await dl.isVisible().catch(() => false)}`);
      } catch {
        // dismiss overlay if stuck so rest of audit continues
        const closeOv = page.locator('.processing-close-btn');
        if (await closeOv.isVisible().catch(() => false)) await closeOv.click();
        await shot(page, '07-product-timeout');
        log('REAL_GEN product: timeout waiting result');
        findings.push({ bug: true, sev: '🔴', title: 'Product generate: no result UI within timeout' });
      }
    } else {
      const closeOv = page.locator('.processing-close-btn');
      if (await closeOv.isVisible().catch(() => false)) await closeOv.click();
      await page.waitForTimeout(400);
    }
  } else {
    log('WARN: generate button not visible in product');
  }

  // Ensure overlay not blocking further clicks
  {
    const closeOv = page.locator('.processing-close-btn');
    if (await closeOv.isVisible().catch(() => false)) await closeOv.click().catch(() => {});
    await page.evaluate(() => {
      document.querySelectorAll('.processing-overlay').forEach((el) => el.remove());
    }).catch(() => {});
  }

  // ── 3. Fashion mode ──
  const fashionBtn = page.locator('button.mode-btn').filter({ hasText: 'Одежда' }).first();
  if (await fashionBtn.isVisible().catch(() => false)) {
    await fashionBtn.click({ force: true });
    await page.waitForTimeout(800);
    await shot(page, '08-fashion-mode');
    const model = page.locator('.preset-card, .model-card').first();
    if (await model.isVisible().catch(() => false)) {
      await model.click();
      await page.waitForTimeout(300);
    }
    await shot(page, '09-fashion-selected');
  }

  // ── 4. Quick mode ──
  const quickBtn = page.locator('button.mode-btn:has-text("Быстр"), button:has-text("Быстрый")').first();
  if (await quickBtn.isVisible().catch(() => false)) {
    await quickBtn.click();
    await page.waitForTimeout(800);
    await shot(page, '10-quick-mode');
    const subModes = await page.locator('button, .quick-mode-card, .submode').allTextContents().catch(() => []);
    log(`QUICK surface texts sample: ${JSON.stringify(subModes.slice(0, 30))}`);
  }

  // ── 5. Pricing modal Escape ──
  const badge = page.locator('.sub-badge, [class*="SubscriptionBadge"], button:has-text("кредит")').first();
  if (await badge.isVisible().catch(() => false)) {
    await badge.click();
    await page.waitForTimeout(600);
    await shot(page, '11-pricing-open');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const stillOpen = await page.locator('.pricing-modal, [class*="PricingModal"], text=Про ⚡, text=Gold Seller').first().isVisible().catch(() => false);
    await shot(page, '12-pricing-after-esc');
    log(`Pricing after Escape still visible (approx): ${stillOpen}`);
    if (stillOpen) {
      findings.push({ bug: true, sev: '🟢', title: 'Pricing modal: Escape may not close' });
      // close via X or backdrop
      const close = page.locator('button:has-text("×"), .modal-close, button[aria-label="Close"]').first();
      if (await close.isVisible().catch(() => false)) await close.click();
      else await page.mouse.click(10, 10);
    }
  }

  // ── 6. History ──
  const hist = page.locator('button:has-text("История"), button:has-text("Мои работы"), a:has-text("История")').first();
  if (await hist.isVisible().catch(() => false)) {
    await hist.click();
    await page.waitForTimeout(1500);
    await shot(page, '13-history');
    const ht = await bodyText(page);
    if (/Unexpected end of JSON|Failed to execute/i.test(ht)) {
      findings.push({ bug: true, sev: '🟡', title: 'History shows raw JS error' });
    }
    log(`HISTORY snippet: ${ht.slice(0, 300).replace(/\s+/g, ' ')}`);
    // back
    const back = page.locator('button:has-text("Назад"), button:has-text("←")').first();
    if (await back.isVisible().catch(() => false)) await back.click();
  }

  // ── 7. Top-up button ──
  // open badge menu if exists
  if (await badge.isVisible().catch(() => false)) {
    await badge.click().catch(() => {});
    await page.waitForTimeout(400);
    const topup = page.locator('text=Пополнить');
    if (await topup.isVisible().catch(() => false)) {
      await topup.click();
      await page.waitForTimeout(500);
      await shot(page, '14-topup-click');
      const after = await bodyText(page);
      log(`TOPUP after: ${after.slice(0, 200).replace(/\s+/g, ' ')}`);
      // If nothing changed, dead control
    }
  }

  // ── 8. Admin UI ──
  await page.goto(`${BASE}/?mode=admin&key=admin-seller-studio-2026`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForTimeout(2500);
  await shot(page, '20-admin-home');
  const adminText = await bodyText(page);
  log(`ADMIN snippet: ${adminText.slice(0, 400).replace(/\s+/g, ' ')}`);
  if (/Доступ закрыт|Нет доступа|403/i.test(adminText) && !/Dev|Dashboard|Сводк|Пользовател/i.test(adminText)) {
    findings.push({ bug: true, sev: '🟡', title: 'Admin UI access denied with key in query' });
  }

  // Click sidebar items if present
  const menuItems = page.locator('.ant-menu-item, [class*="Sidebar"] button, aside button, .ant-menu-title-content');
  const menuCount = await menuItems.count().catch(() => 0);
  log(`ADMIN menu items: ${menuCount}`);
  for (let i = 0; i < Math.min(menuCount, 8); i++) {
    try {
      await menuItems.nth(i).click({ timeout: 2000 });
      await page.waitForTimeout(800);
      await shot(page, `21-admin-page-${i}`);
    } catch (e) {
      log(`admin menu ${i} click fail: ${e.message}`);
    }
  }

  // Write report
  const report = {
    base: BASE,
    realGen: REAL_GEN,
    findings,
    at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(SHOTS, 'walkthrough-report.json'), JSON.stringify(report, null, 2));
  console.log('\n=== FINDINGS ===');
  console.log(JSON.stringify(findings, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
