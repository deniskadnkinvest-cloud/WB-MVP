/**
 * Real E2E: fashion (1 variant) + quick photo (1 gen). Screenshots + report append.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'audit-shots');
const BASE = process.env.AUDIT_BASE || 'http://localhost:5180';
const session = JSON.parse(fs.readFileSync(path.join(SHOTS, 'session.json'), 'utf8'));
const testImg = path.join(ROOT, 'public/examples/cards/epic-glass-before.jpg');
const findings = [];
const log = (m) => { console.log(m); findings.push({ t: new Date().toISOString(), msg: m }); };

async function shot(page, name) {
  const p = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  return p;
}

async function dismissOverlay(page) {
  const close = page.locator('.processing-close-btn');
  if (await close.isVisible().catch(() => false)) await close.click().catch(() => {});
}

async function waitResult(page, label) {
  try {
    await page.waitForFunction(() => {
      const t = document.body?.innerText || '';
      const hasResult = /Готово|Скачать|ФИНАЛЬНЫЙ|лист/i.test(t);
      const overlayGone = !document.querySelector('.processing-overlay');
      return hasResult && overlayGone;
    }, null, { timeout: 300000 });
    log(`${label}: RESULT OK`);
    return true;
  } catch {
    log(`${label}: TIMEOUT waiting result`);
    findings.push({ bug: true, sev: '🔴', title: `${label}: no result UI` });
    await dismissOverlay(page);
    return false;
  }
}

async function pickVariant1(page) {
  // Click the variant "1" button by structure
  const btns = page.locator('.variant-count-btn');
  const n = await btns.count();
  for (let i = 0; i < n; i++) {
    const text = (await btns.nth(i).innerText().catch(() => '')) || '';
    if (/^1\b|1\s*вариант/i.test(text.trim()) || text.includes('1') && text.includes('кредит')) {
      // Prefer exact number 1 as first line
    }
  }
  // Click first variant-count-btn that has number span = 1
  const one = page.locator('.variant-count-btn').filter({ has: page.locator('.variant-count-number', { hasText: '1' }) }).first();
  if (await one.isVisible().catch(() => false)) {
    await one.click();
    await page.waitForTimeout(200);
    log('variantCount set to 1');
  } else {
    log('WARN: variant 1 button not found');
  }
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
  page.setDefaultTimeout(30000);

  // ── FASHION ──
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  await shot(page, '30-fashion-start');

  await page.locator('button.mode-btn').filter({ hasText: 'Одежда' }).first().click({ force: true });
  await page.waitForTimeout(800);
  await shot(page, '31-fashion-mode');

  // Upload garment
  const fileInputs = page.locator('input[type="file"]');
  if ((await fileInputs.count()) > 0 && fs.existsSync(testImg)) {
    await fileInputs.first().setInputFiles(testImg);
    await page.waitForTimeout(2500);
    await shot(page, '32-fashion-uploaded');
  }

  // Select first model preset if not already
  const modelCard = page.locator('.preset-card').first();
  if (await modelCard.isVisible().catch(() => false)) {
    await modelCard.click();
    await page.waitForTimeout(300);
  }

  await pickVariant1(page);
  await shot(page, '33-fashion-ready');

  const fashionGen = page.locator('.generate-btn').first();
  if (await fashionGen.isVisible().catch(() => false)) {
    await fashionGen.click();
    await page.waitForTimeout(1500);
    await shot(page, '34-fashion-generating');
    const ok = await waitResult(page, 'FASHION');
    await shot(page, ok ? '35-fashion-result' : '35-fashion-timeout');
    const body = await page.locator('body').innerText();
    log(`FASHION body slice: ${body.slice(0, 350).replace(/\s+/g, ' ')}`);
  } else {
    log('FAIL: fashion generate btn missing');
    findings.push({ bug: true, sev: '🔴', title: 'Fashion: generate button missing' });
  }

  await dismissOverlay(page);

  // ── QUICK ──
  await page.locator('button.mode-btn').filter({ hasText: 'В два клика' }).first().click({ force: true });
  await page.waitForTimeout(1000);
  await shot(page, '40-quick-mode');

  // Prefer photo submode if buttons exist
  const photoMode = page.locator('button, .quick-mode-card, .submode-btn').filter({ hasText: /Фото|Photo|картинк/i }).first();
  if (await photoMode.isVisible().catch(() => false)) {
    await photoMode.click();
    await page.waitForTimeout(400);
  }

  const qFiles = page.locator('input[type="file"]');
  if ((await qFiles.count()) > 0 && fs.existsSync(testImg)) {
    await qFiles.first().setInputFiles(testImg);
    await page.waitForTimeout(2500);
    await shot(page, '41-quick-uploaded');
  }

  const quickGen = page.locator('.generate-btn, .quick-generate-btn').first();
  if (await quickGen.isVisible().catch(() => false)) {
    await quickGen.click();
    await page.waitForTimeout(1500);
    await shot(page, '42-quick-generating');
    const ok = await waitResult(page, 'QUICK');
    await shot(page, ok ? '43-quick-result' : '43-quick-timeout');
    const body = await page.locator('body').innerText();
    log(`QUICK body slice: ${body.slice(0, 350).replace(/\s+/g, ' ')}`);
  } else {
    log('FAIL: quick generate btn missing');
    findings.push({ bug: true, sev: '🔴', title: 'Quick: generate button missing' });
  }

  // History re-check
  await dismissOverlay(page);
  const hist = page.locator('button:has-text("Мои работы")').first();
  if (await hist.isVisible().catch(() => false)) {
    await hist.click({ force: true });
    await page.waitForTimeout(2000);
    await shot(page, '50-history-after');
    const ht = await page.locator('body').innerText();
    log(`HISTORY: ${ht.slice(0, 400).replace(/\s+/g, ' ')}`);
  }

  // Pricing Escape re-verify
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const badge = page.locator('.sub-badge').first();
  if (await badge.isVisible().catch(() => false)) {
    await badge.click();
    await page.waitForTimeout(300);
    // open pricing via menu
    const planItem = page.locator('.sub-badge-menu-item:has-text("тариф"), text=Выбрать тариф').first();
    if (await planItem.isVisible().catch(() => false)) await planItem.click();
    else await badge.click(); // none plan path
    await page.waitForTimeout(500);
    await shot(page, '51-pricing-open');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const still = await page.locator('.pricing-modal, .pricing-overlay').first().isVisible().catch(() => false);
    log(`Pricing Escape closed: ${!still}`);
    if (still) findings.push({ bug: true, sev: '🟢', title: 'Pricing Escape still open' });
    // Top-up path
    await badge.click().catch(() => {});
    await page.waitForTimeout(300);
    const topup = page.locator('.sub-badge-menu-item:has-text("Пополнить")').first();
    if (await topup.isVisible().catch(() => false)) {
      await topup.click();
      await page.waitForTimeout(500);
      const pricingOpen = await page.locator('.pricing-overlay, .topup-section, text=Нужно больше').first().isVisible().catch(() => false);
      log(`TopUp opens pricing: ${pricingOpen}`);
      await shot(page, '52-topup');
      if (!pricingOpen) findings.push({ bug: true, sev: '🟡', title: 'TopUp still dead' });
      else findings.push({ bug: false, sev: '✅', title: 'TopUp opens pricing' });
    }
  }

  fs.writeFileSync(path.join(SHOTS, 'fashion-quick-report.json'), JSON.stringify({ findings, at: new Date().toISOString() }, null, 2));
  console.log('\n=== FINDINGS ===\n', JSON.stringify(findings, null, 2));
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
