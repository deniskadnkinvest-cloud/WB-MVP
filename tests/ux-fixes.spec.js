import { test, expect } from '@playwright/test';

// Verifies the two product-mode UX fixes by driving the real React UI as a user:
//  1) BUG C — space character is now typeable in the custom scene/environment field
//  2) BUG B — a product effect is now selectable (the greyed grid is no longer pointer-events:none)

test.describe('Product-mode UX fixes', () => {
  test.beforeEach(async ({ page }) => {
    // Mock subscription so the app treats us as an active paid user
    await page.route(url => url.href.includes('/api/subscription'), route =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, data: {
          plan: 'base', credits: 100, creditsTotal: 100,
          planExpiresAt: new Date(Date.now() + 86400000 * 30).toISOString() } })
      }));
    // Tolerate other user-data calls (no backend running)
    await page.route(url => url.href.includes('/api/user-data'), route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) }));

    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');
    const guestBtn = page.locator('.guest-text-btn');
    if (await guestBtn.isVisible().catch(() => false)) {
      await guestBtn.click();
      await page.waitForLoadState('networkidle');
    }
    await page.waitForSelector('.sub-badge', { timeout: 15000 });
    await page.click('button:has-text("Предметка")');
    await expect(page.locator('button.mode-btn.active')).toContainText('Предметка');
  });

  test('BUG C: space is typeable in the custom scene field', async ({ page }) => {
    // open the "Свой вариант" scene input under Сцена / Окружение
    await page.locator('.section-title:has-text("Сцена")').scrollIntoViewIfNeeded();
    await page.locator('.add-custom-card:has-text("Свой вариант")').first().click();

    const sceneInput = page.locator('input[placeholder*="Локация с нуля"]');
    await expect(sceneInput).toBeVisible();
    await sceneInput.click();
    // type text WITH spaces, one key at a time (this is what the trim() bug broke)
    await sceneInput.pressSequentially('стол из дуба ретро', { delay: 20 });

    // the spaces must survive — before the fix the value collapsed to "столиздубаретро"
    await expect(sceneInput).toHaveValue('стол из дуба ретро');
  });

  test('BUG B: a product effect is selectable', async ({ page }) => {
    // effect grid lives under "Добавить спецэффект"; default is "Нет эффекта" (greyed but must stay clickable)
    const effectSection = page.locator('.section-subtitle-small:has-text("спецэффект")');
    await effectSection.scrollIntoViewIfNeeded();

    const waterEffect = page.locator('.preset-card:has-text("Брызги")').first();
    await expect(waterEffect).toBeVisible();
    await waterEffect.click({ timeout: 5000 }); // pre-fix this times out (pointer-events:none)
    await expect(waterEffect).toHaveClass(/active/);
  });
});
