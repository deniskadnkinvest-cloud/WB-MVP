/**
 * Round 2: fashion happy path, quick ugc/card/model, zero-credits, desktop admin.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'audit-shots');
const BASE = process.env.AUDIT_BASE || 'http://localhost:5180';
const API = process.env.AUDIT_API || 'http://127.0.0.1:3001';
const ADMIN_KEY = process.env.ADMIN_ACCESS_KEY || 'admin-seller-studio-2026';
const testImg = path.join(ROOT, 'public/examples/cards/epic-glass-before.jpg');
const session = JSON.parse(fs.readFileSync(path.join(SHOTS, 'session.json'), 'utf8'));
const findings = [];
const log = (m) => {
  console.log(m);
  findings.push({ t: new Date().toISOString(), msg: m });
};
const bug = (sev, title, extra = {}) => {
  findings.push({ bug: true, sev, title, ...extra });
  console.log(`BUG ${sev}: ${title}`);
};

async function shot(page, name) {
  const p = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  return p;
}

async function dismissOverlay(page) {
  const close = page.locator('.processing-close-btn');
  if (await close.isVisible().catch(() => false)) await close.click().catch(() => {});
}

async function waitResult(page, label, re = /Готово|Скачать|успеш|готова|готово|Обложка/i) {
  try {
    await page.waitForFunction(
      (pattern) => {
        const t = document.body?.innerText || '';
        return new RegExp(pattern, 'i').test(t) && !document.querySelector('.processing-overlay');
      },
      re.source,
      { timeout: 300000 }
    );
    // allow image paint
    await page.waitForTimeout(2500);
    const img = await page.evaluate(() => {
      const i = document.querySelector('.result-image-wrap img, .quick-hero-result img, .card-result-image-wrap img, img[alt]');
      if (!i) return null;
      return { src: (i.src || '').slice(0, 100), w: i.naturalWidth, h: i.naturalHeight, complete: i.complete };
    });
    log(`${label}: RESULT ok img=${JSON.stringify(img)}`);
    if (!img || img.w < 10) bug('🟡', `${label}: result UI without loaded image`);
    return true;
  } catch {
    log(`${label}: TIMEOUT`);
    bug('🔴', `${label}: no result within timeout`);
    await dismissOverlay(page);
    return false;
  }
}

async function admin(body) {
  const res = await fetch(`${API}/api/admin/user-control`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Key': ADMIN_KEY },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) throw new Error(`admin ${JSON.stringify(json)}`);
  return json;
}

async function authedPage(browser, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.addInitScript(
    ({ token, user }) => {
      localStorage.setItem('vton_token', token);
      localStorage.setItem('vton_user', JSON.stringify(user));
    },
    { token: session.token, user: session.user }
  );
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  return { context, page };
}

async function goHome(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
}

async function uploadFirst(page) {
  const inputs = page.locator('input[type="file"]');
  if ((await inputs.count()) > 0) {
    await inputs.first().setInputFiles(testImg);
    await page.waitForTimeout(2500);
  }
}

async function setVariant1(page) {
  const one = page
    .locator('.variant-count-btn')
    .filter({ has: page.locator('.variant-count-number', { hasText: '1' }) })
    .first();
  if (await one.isVisible().catch(() => false)) {
    await one.click();
    await page.waitForTimeout(200);
  }
}

async function main() {
  // Ensure credits
  await admin({
    action: 'set-plan',
    identifier: '99001001',
    plan: 'base',
    note: 'audit round2 top-up',
  });
  log('Granted base/100');

  const browser = await chromium.launch({ headless: true });

  // ═══════════ FASHION HAPPY PATH ═══════════
  {
    const { context, page } = await authedPage(browser, { width: 420, height: 900 });
    await goHome(page);
    await page.locator('button.mode-btn').filter({ hasText: 'Одежда' }).click({ force: true });
    await page.waitForTimeout(800);
    await uploadFirst(page);
    // Select female slavic model
    const slav = page.locator('.preset-card, button, .model-card').filter({ hasText: 'Славянка' }).first();
    if (await slav.isVisible().catch(() => false)) {
      await slav.click();
      log('Fashion: selected Славянка');
    } else {
      const any = page.locator('.preset-card').first();
      if (await any.isVisible().catch(() => false)) await any.click();
      log('Fashion: selected first preset');
    }
    await setVariant1(page);
    await shot(page, '70-fashion-ready');
    const gen = page.locator('.generate-btn').first();
    await gen.click();
    await page.waitForTimeout(1500);
    await shot(page, '71-fashion-gen');
    const ok = await waitResult(page, 'FASHION');
    await shot(page, ok ? '72-fashion-result' : '72-fashion-fail');
    const body = await page.locator('body').innerText();
    log(`FASHION text: ${body.slice(0, 350).replace(/\s+/g, ' ')}`);
    if (/модерац|не удалось|Ошибка|возвращ/i.test(body) && !/Готово/i.test(body)) {
      bug('🟡', 'Fashion: API rejected or error shown to user', { snippet: body.slice(0, 200) });
    }
    await context.close();
  }

  // ═══════════ QUICK: UGC, CARD, MODEL ═══════════
  for (const mode of [
    { key: 'ugc', label: 'UGC', btn: /UGC|покупател/i, okRe: /покупател|Готово|Скачать/i },
    { key: 'card', label: 'CARD', btn: /карточк/i, okRe: /Обложка|карточк|Готово|Скачать/i },
    { key: 'model', label: 'MODEL', btn: /с моделью|моделью/i, okRe: /модель|Готово|Скачать|Обложка/i },
  ]) {
    const { context, page } = await authedPage(browser, { width: 420, height: 900 });
    await goHome(page);
    await page.locator('button.mode-btn').filter({ hasText: 'В два клика' }).click({ force: true });
    await page.waitForTimeout(800);
    await uploadFirst(page);
    // Mode buttons in card-style-options
    const modeBtn = page.locator('.card-style-btn, button').filter({ hasText: mode.btn }).first();
    if (await modeBtn.isVisible().catch(() => false)) {
      await modeBtn.click();
      await page.waitForTimeout(400);
      log(`${mode.label}: mode selected`);
    } else {
      bug('🔴', `${mode.label}: mode button not found`);
      await shot(page, `80-${mode.key}-no-mode`);
      await context.close();
      continue;
    }
    await shot(page, `80-${mode.key}-ready`);
    const gen = page.locator('.quick-generate-btn, .generate-btn').first();
    if (!(await gen.isVisible().catch(() => false))) {
      bug('🔴', `${mode.label}: generate button missing`);
      await context.close();
      continue;
    }
    await gen.click();
    await page.waitForTimeout(1000);
    const ok = await waitResult(page, mode.label, mode.okRe);
    await shot(page, ok ? `81-${mode.key}-result` : `81-${mode.key}-fail`);
    await context.close();
  }

  // ═══════════ ZERO CREDITS ═══════════
  {
    await admin({ action: 'disable-plan', identifier: '99001001', note: 'audit zero credits' });
    log('Disabled plan for zero-credit test');
    const { context, page } = await authedPage(browser, { width: 420, height: 900 });
    await goHome(page);
    await page.waitForTimeout(1500);
    await shot(page, '90-zero-credits-home');
    const badgeText = await page.locator('.sub-badge').innerText().catch(() => '');
    log(`Zero badge: ${badgeText.replace(/\s+/g, ' ')}`);
    await page.locator('button.mode-btn').filter({ hasText: 'В два клика' }).click({ force: true });
    await page.waitForTimeout(600);
    await uploadFirst(page);
    await page.locator('.quick-generate-btn, .generate-btn').first().click().catch(() => {});
    await page.waitForTimeout(1500);
    await shot(page, '91-zero-after-gen');
    const body = await page.locator('body').innerText();
    const pricing = await page.locator('.pricing-overlay, .pricing-modal, text=тариф').first().isVisible().catch(() => false);
    const blocked = /тариф|кредит|Недостаточно|Выбрать/i.test(body) || pricing;
    log(`Zero gen blocked: ${blocked} pricing=${pricing}`);
    if (!blocked) bug('🔴', 'Zero credits: generate not blocked / no pricing UX');
    await context.close();
    // restore plan
    await admin({ action: 'set-plan', identifier: '99001001', plan: 'base', note: 'audit restore after zero' });
    log('Restored base plan');
  }

  // ═══════════ DESKTOP ADMIN ═══════════
  {
    const { context, page } = await authedPage(browser, { width: 1400, height: 900 });
    await page.goto(`${BASE}/?mode=admin&key=${ADMIN_KEY}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(3000);
    await shot(page, '95-admin-desktop');
    const body = await page.locator('body').innerText();
    log(`Admin desktop: ${body.slice(0, 300).replace(/\s+/g, ' ')}`);
    if (/Доступ закрыт|Нет доступа/i.test(body) && !/Сводк|Доход|Пользовател/i.test(body)) {
      bug('🔴', 'Admin desktop: access denied');
    }

    // Click each menu by text
    const pages = ['Сводка', 'Выдача тарифов', 'Пользователи', 'Лог генераций', 'Ошибки', 'Промпты', 'Рассылки'];
    for (let i = 0; i < pages.length; i++) {
      const label = pages[i];
      const item = page
        .locator('.ant-menu-item, .ant-menu-title-content, [role="menuitem"]')
        .filter({ hasText: label })
        .first();
      try {
        if (await item.isVisible({ timeout: 3000 }).catch(() => false)) {
          await item.click({ force: true });
          await page.waitForTimeout(1200);
          await shot(page, `96-admin-${i}-${label.slice(0, 12)}`);
          const t = await page.locator('body').innerText();
          log(`Admin page ${label}: ${t.slice(0, 120).replace(/\s+/g, ' ')}`);
          if (/error|Exception|undefined is not|Failed to/i.test(t) && !/Ошибки/i.test(label)) {
            bug('🟡', `Admin page ${label}: error-like text`);
          }
        } else {
          // try sidebar custom
          const alt = page.locator(`text=${label}`).first();
          if (await alt.isVisible().catch(() => false)) {
            await alt.click({ force: true });
            await page.waitForTimeout(1200);
            await shot(page, `96-admin-${i}-${label.slice(0, 12)}`);
            log(`Admin page ${label}: via text click`);
          } else {
            bug('🟡', `Admin menu item not visible: ${label}`);
          }
        }
      } catch (e) {
        bug('🟡', `Admin nav fail ${label}: ${e.message}`);
      }
    }

    // Grants page: set-plan for audit user and verify
    try {
      const grants = page.locator('text=Выдача тарифов').first();
      if (await grants.isVisible().catch(() => false)) await grants.click({ force: true });
      await page.waitForTimeout(1000);
      const input = page.locator('input').first();
      // find identifier input
      const idInput = page.locator('input[placeholder*="id"], input[placeholder*="telegram"], input[placeholder*="Telegram"], input[placeholder*="email"], input').filter({ hasNot: page.locator('[type=hidden]') });
      const count = await idInput.count();
      log(`Admin grants inputs: ${count}`);
      if (count > 0) {
        await idInput.first().fill('99001001');
        await page.waitForTimeout(300);
        const lookup = page.locator('button').filter({ hasText: /Найти|Lookup|Искать|Проверить/i }).first();
        if (await lookup.isVisible().catch(() => false)) await lookup.click();
        await page.waitForTimeout(1500);
        await shot(page, '97-admin-grants');
      }
    } catch (e) {
      log(`Grants probe: ${e.message}`);
    }

    await context.close();
  }

  // Verify grant reflected via API
  const lookup = await admin({ action: 'lookup', identifier: '99001001' });
  const sub = lookup.user?.subscription || {};
  log(`Final sub plan=${sub.plan} credits=${sub.credits}`);

  const report = { at: new Date().toISOString(), findings };
  fs.writeFileSync(path.join(SHOTS, 'round2-report.json'), JSON.stringify(report, null, 2));
  console.log('\n=== ROUND2 FINDINGS ===\n', JSON.stringify(findings, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
