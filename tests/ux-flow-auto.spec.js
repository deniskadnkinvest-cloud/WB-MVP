import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';
const SHOT_DIR = '.audit/ux-flow-2026-07-10';
const MOCK_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function mockSignedInUser(page, { clipboardFallback = false } = {}) {
  await page.addInitScript(({ useClipboardFallback }) => {
    localStorage.setItem('vton_token', 'ux-audit-local-token');
    localStorage.setItem('vton_user', JSON.stringify({
      uid: 'tg_99001001',
      displayName: 'UX Audit User',
      isAnonymous: false,
      isGuest: false,
    }));

    if (useClipboardFallback) {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.reject(new Error('Clipboard blocked')) },
      });
      document.execCommand = () => true;
    }
  }, { useClipboardFallback: clipboardFallback });

  await page.route('**/api/subscription**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      data: {
        plan: 'base',
        credits: 100,
        creditsTotal: 100,
        planExpiresAt: '2026-08-10T00:00:00.000Z',
      },
    }),
  }));

  await page.route('**/api/user-data**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: [] }),
  }));
}

async function openGuestApp(page) {
  await page.goto(BASE_URL);
  await page.getByRole('button', { name: 'Продолжить без регистрации' }).click();
  await expect(page.locator('.mode-selector-wrapper')).toBeVisible();
}

async function uploadQuickProduct(page) {
  await page.getByRole('button', { name: '⚡ В два клика' }).click();
  await page.locator('#quick-upload').setInputFiles({
    name: 'product.png',
    mimeType: 'image/png',
    buffer: Buffer.from(MOCK_PNG_BASE64, 'base64'),
  });
  await expect(page.locator('.multi-preview-item')).toBeVisible();
}

test.describe('Seller Studio UX flow auto audit', () => {
  test('login communicates the full product and shows only working providers', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.getByText('ИИ-фотостудия для маркетплейсов')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apple' })).toHaveCount(0);
    await page.screenshot({ path: `${SHOT_DIR}/after-login.png`, fullPage: true });
  });

  test('guest pricing asks for sign-in before any payment request', async ({ page }) => {
    const paymentRequests = [];
    page.on('request', request => {
      if (request.url().includes('/api/create-payment')) paymentRequests.push(request.url());
    });

    await openGuestApp(page);
    await page.locator('.sub-badge').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Для оформления тарифа войдите');
    await expect(dialog.getByRole('button', { name: 'Войти и выбрать' })).toHaveCount(3);
    await page.screenshot({ path: `${SHOT_DIR}/after-guest-pricing.png`, fullPage: false });

    const authButtons = dialog.getByRole('button', { name: 'Войти и выбрать' });
    await authButtons.first().click();
    await expect(page.getByRole('button', { name: 'Получить код' })).toBeVisible();
    expect(paymentRequests).toHaveLength(0);
  });

  test('copy UID reports success only after a real fallback copy', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await mockSignedInUser(page, { clipboardFallback: true });
    await page.goto(BASE_URL);

    const copyButton = page.getByTitle('Скопировать ID для поддержки');
    await copyButton.click();
    await expect(copyButton).toContainText('Скопирован!');
    expect(pageErrors).toEqual([]);
  });

  test('quick upload remove control is styled and removes the image', async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 900 });
    await openGuestApp(page);
    await uploadQuickProduct(page);

    const removeButton = page.locator('.remove-preview');
    await expect(removeButton).toHaveCSS('position', 'absolute');
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOT_DIR}/after-quick-upload.png`, fullPage: false });
    await removeButton.click();
    await expect(page.locator('.multi-preview-item')).toHaveCount(0);
  });

  test('quick generation can be minimized without cancelling the server task', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await mockSignedInUser(page);
    await page.route('**/api/generate-image', async route => {
      await new Promise(resolve => setTimeout(resolve, 2500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, imageBase64: `data:image/png;base64,${MOCK_PNG_BASE64}` }),
      }).catch(() => {});
    });
    await page.goto(BASE_URL);
    await uploadQuickProduct(page);

    await page.getByRole('button', { name: '🎨 Создать фото' }).click();
    const minimizeButton = page.getByRole('button', { name: 'Свернуть — процесс продолжится' });
    await expect(minimizeButton).toBeVisible();
    await page.screenshot({ path: `${SHOT_DIR}/after-processing-overlay.png`, fullPage: false });
    await minimizeButton.click();

    await expect(page.locator('.processing-overlay')).toHaveCount(0);
    await expect(page.locator('.generation-task-pill')).toBeVisible();
    await expect(page.getByRole('button', { name: '← Новая генерация' })).toBeVisible({ timeout: 6000 });
    await page.screenshot({ path: `${SHOT_DIR}/after-background-complete.png`, fullPage: false });
    expect(pageErrors).toEqual([]);
  });

  test('hiding progress keeps the paid action locked until completion', async ({ page }) => {
    await mockSignedInUser(page);
    await page.route('**/api/generate-image', async route => {
      await new Promise(resolve => setTimeout(resolve, 5000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, imageBase64: `data:image/png;base64,${MOCK_PNG_BASE64}` }),
      });
    });
    await page.goto(BASE_URL);
    await uploadQuickProduct(page);

    const generateButton = page.locator('.quick-generate-btn');
    await generateButton.click();
    await page.getByRole('button', { name: 'Свернуть — процесс продолжится' }).click();

    await expect(generateButton).toBeDisabled({ timeout: 2000 });
    await expect(page.locator('.processing-overlay')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '← Новая генерация' })).toBeVisible();
  });

  test('card result labels unfinished video as unavailable', async ({ page }) => {
    await mockSignedInUser(page);
    await page.route('**/api/generate-image', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, imageBase64: `data:image/png;base64,${MOCK_PNG_BASE64}` }),
    }));
    await page.goto(BASE_URL);
    await uploadQuickProduct(page);
    await page.getByRole('button', { name: '📋 Готовая карточка' }).click();
    await page.getByRole('button', { name: '📋 Создать карточку' }).click();

    const videoButton = page.getByRole('button', { name: 'Скоро — кредиты не списываются' });
    await expect(videoButton).toBeDisabled();
    await expect(page.getByText('В разработке')).toBeVisible();
    await expect(page.locator('.processing-overlay')).toHaveCount(0);
    await page.screenshot({ path: `${SHOT_DIR}/after-card-result.png`, fullPage: true });
  });

  test('calibration draft recovery is visible in its real deep state', async ({ page }) => {
    await mockSignedInUser(page);
    await page.addInitScript(({ image }) => {
      localStorage.setItem('vton_appMode', 'fashion');
      localStorage.setItem('vton_generatedImage', image);
      localStorage.setItem('calib_wizard_draft_tg_99001001', JSON.stringify({
        step: 1,
        lockedImages: {},
        modelName: 'Анна',
        timestamp: Date.now(),
      }));
    }, { image: `data:image/png;base64,${MOCK_PNG_BASE64}` });
    await page.goto(BASE_URL);

    await page.getByRole('button', { name: '🎯 Сохранить модель (калибровка)' }).click();
    await expect(page.locator('.calib-draft-banner')).toBeVisible();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOT_DIR}/calibration-draft-after.png`, fullPage: false });
  });

  test('quick result has a branded and working new-generation action', async ({ page }) => {
    await mockSignedInUser(page);
    await page.route('**/api/generate-image', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, imageBase64: `data:image/png;base64,${MOCK_PNG_BASE64}` }),
    }));
    await page.goto(BASE_URL);
    await uploadQuickProduct(page);
    await page.getByRole('button', { name: '🎨 Создать фото' }).click();

    const newGeneration = page.getByRole('button', { name: '← Новая генерация' });
    await expect(newGeneration).toBeVisible();
    await expect(newGeneration).toHaveCSS('border-radius', '999px');
    await expect(page.locator('.processing-overlay')).toHaveCount(0);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOT_DIR}/after-quick-result.png`, fullPage: false });
    await newGeneration.click();
    await expect(page.getByText('Загрузите фото товара — получите готовую карточку для маркетплейса')).toBeVisible();
  });
});
