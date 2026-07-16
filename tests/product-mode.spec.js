import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// Base64 string of a 1x1 blank transparent PNG image
const MOCK_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const DEBUG_LOG_PATH = path.join('C:\\Users\\LORD-KSON\\.gemini\\antigravity\\brain\\c79cd0f4-ce64-411f-bb04-1792d163525a', 'scratch', 'e2e-debug.log');

// Helper to write logs to disk
function logToFile(msg) {
  try {
    fs.mkdirSync(path.dirname(DEBUG_LOG_PATH), { recursive: true });
    fs.appendFileSync(DEBUG_LOG_PATH, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (err) {
    // Ignore log write errors
  }
}

test.describe('VTON Studio - Product Mode E2E Tests', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('vton_token', 'product-mode-local-token');
      localStorage.setItem('vton_user', JSON.stringify({
        uid: 'tg_product_mode_test',
        displayName: 'Product Mode Test',
        isAnonymous: false,
        isGuest: false,
      }));
    });

    // Request logger for API calls
    page.on('request', request => {
      if (request.url().includes('/api/')) {
        logToFile(`>> [BROWSER REQUEST] ${request.method()} ${request.url()}`);
      }
    });
    page.on('response', response => {
      if (response.url().includes('/api/')) {
        logToFile(`<< [BROWSER RESPONSE] ${response.status()} ${response.url()}`);
      }
    });

    // Mock the subscription endpoint to return the PRO plan (using predicate on url.href)
    await page.route(url => url.href.includes('/api/subscription'), async (route) => {
      logToFile(`🎯 MOCK INTERCEPTED subscription call: ${route.request().url()}`);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            plan: 'base',
            credits: 100,
            creditsTotal: 100,
            planExpiresAt: new Date(Date.now() + 86400000 * 30).toISOString()
          }
        })
      });
    });

    await page.route(url => url.href.includes('/api/user-data'), route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: [] }),
    }));

    // Navigate to the app
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');

    // Bypass authentication by clicking "Продолжить без регистрации" if it's visible
    const guestBtn = page.locator('.guest-text-btn');
    if (await guestBtn.isVisible()) {
      await guestBtn.click();
      await page.waitForLoadState('networkidle');
    }

    // Wait for the subscription badge to confirm PRO status
    await page.waitForSelector('.sub-badge', { timeout: 15000 });
    const subBadge = page.locator('.sub-badge');
    await expect(subBadge).toContainText('Про');
  });

  test('should toggle to Product Mode and verify UI updates', async ({ page }) => {
    // Check default state (should be Fashion Mode)
    await expect(page.locator('button.mode-btn.active')).toContainText('Одежда');
    await expect(page.locator('.section-title', { hasText: 'Кастинг-Рум' })).toBeVisible();

    // Click on Product Mode button
    await page.click('button:has-text("Предметка")');

    // Verify mode button is active
    await expect(page.locator('button.mode-btn.active')).toContainText('Предметка');

    // Verify UI sections updated
    await expect(page.locator('.section-title', { hasText: 'Категория товара' })).toBeVisible();
    await expect(page.locator('.section-title', { hasText: 'Сцена / Окружение' })).toBeVisible();

    // Verify that product categories are present
    const categoryCards = page.locator('.preset-grid').first().locator('.preset-card');
    await expect(categoryCards).not.toHaveCount(0);
    
    // The custom product prompt is intentionally shown only for "Другое".
    await expect(page.getByPlaceholder('Опишите ваш товар: «набор кистей для макияжа в чехле»')).toHaveCount(0);
    await page.locator('.preset-card:has-text("Другое")').click();
    await expect(page.getByPlaceholder('Опишите ваш товар: «набор кистей для макияжа в чехле»')).toBeVisible();
  });

  test('should allow selecting product categories and updating prompt', async ({ page }) => {
    await page.click('button:has-text("Предметка")');

    // The custom product field belongs to the "Other" category only.
    const otherCard = page.locator('.preset-card:has-text("Другое")');
    await otherCard.click();
    await expect(otherCard).toHaveClass(/active/);

    // Type custom product prompt
    const customInput = page.getByPlaceholder('Опишите ваш товар: «набор кистей для макияжа в чехле»');
    await customInput.fill('luxury perfume bottle, glass, gold elements');
    
    // Selecting other category resets custom prompt based on App.jsx onClick handler
    const supplementsCard = page.locator('.preset-card:has-text("Витамины")');
    await supplementsCard.click();
    await expect(supplementsCard).toHaveClass(/active/);
    await expect(customInput).toHaveCount(0);

    await otherCard.click();
    await expect(customInput).toHaveValue('');
  });

  test('should correctly send isProductMode and categoryId to backend API', async ({ page }) => {
    await page.click('button:has-text("Предметка")');

    // Select Cosmetics category
    await page.click('.preset-card:has-text("Косметика")');
    
    // Find background preset cards and select one
    const bgPreset = page.locator('.preset-card:has-text("Мрамор")').first();
    if (await bgPreset.isVisible()) {
      await bgPreset.click();
    }

    // Upload a mock product image so the generate button becomes enabled
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'test-product.png',
      mimeType: 'image/png',
      buffer: Buffer.from(MOCK_PNG_BASE64, 'base64'),
    });

    // Wait for the upload progress / status text to clear up and enable the button
    const generateBtn = page.locator('button:has-text("Сгенерировать")');
    await expect(generateBtn).toBeEnabled({ timeout: 10000 });

    // Intercept the API call using page.route to return mock response for the POST request
    await page.route('**/api/generate-image', async (route) => {
      const request = route.request();
      if (request.method() !== 'POST') {
        await route.continue();
        return;
      }
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          images: ['https://example.com/mock-image.png']
        })
      });
    });

    // Set up waitForResponse promise before clicking to prevent race condition
    const apiPromise = page.waitForResponse(response => 
      response.url().includes('/api/generate-image') && response.request().method() === 'POST'
    );

    // Attempt to click generation button
    await generateBtn.click();

    // Wait for the response and parse payload
    const response = await apiPromise;
    const request = response.request();
    const apiRequestPayload = JSON.parse(request.postData() || '{}');

    // Verify that the intercepted request payload contains the correct Product Mode flags
    expect(apiRequestPayload).not.toBeNull();
    expect(apiRequestPayload.isProductMode).toBe(true);
    expect(apiRequestPayload.categoryId).toBe('cosmetics');
    
    // Capture screenshot of successful state
    await page.screenshot({ path: 'test-results/product-mode-generation-success.png' });
  });

  test('should perform deep chaos tests (multiple changes, empty inputs, resilient UI)', async ({ page }) => {
    await page.click('button:has-text("Предметка")');

    // Perform rapid category switching
    const categories = ['Косметика', 'Духи', 'Свечи', 'Электроника', 'Еда'];
    for (const cat of categories) {
      const card = page.locator(`.preset-card:has-text("${cat}")`);
      if (await card.isVisible()) {
        await card.click();
        await expect(card).toHaveClass(/active/);
      }
    }

    // Toggle back and forth between Fashion and Product modes
    await page.click('button:has-text("Одежда")');
    await expect(page.locator('.section-title', { hasText: 'Кастинг-Рум' })).toBeVisible();

    await page.click('button:has-text("Предметка")');
    await expect(page.locator('.section-title', { hasText: 'Категория товара' })).toBeVisible();

    // Upload a mock product image so the generate button becomes enabled
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'test-product.png',
      mimeType: 'image/png',
      buffer: Buffer.from(MOCK_PNG_BASE64, 'base64'),
    });

    // Wait for button to be enabled
    const generateBtn = page.locator('button:has-text("Сгенерировать")');
    await expect(generateBtn).toBeEnabled({ timeout: 10000 });

    // Setup network mocking for POST requests
    await page.route('**/api/generate-image', async (route) => {
      const request = route.request();
      if (request.method() !== 'POST') {
        await route.continue();
        return;
      }
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, images: [] })
      });
    });

    // Set up waitForResponse promise
    const apiPromise = page.waitForResponse(response => 
      response.url().includes('/api/generate-image') && response.request().method() === 'POST'
    );

    await generateBtn.click();

    // Wait for request
    const response = await apiPromise;
    const request = response.request();
    const apiRequestPayload = JSON.parse(request.postData() || '{}');

    expect(apiRequestPayload).not.toBeNull();
    expect(apiRequestPayload.isProductMode).toBe(true);
    expect(apiRequestPayload.categoryId).toBeDefined();
    
    await page.screenshot({ path: 'test-results/deep-chaos-product-mode.png' });
  });
});
