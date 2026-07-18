import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';
const SHOT_DIR = '.audit/generation-background-2026-07-18';
const MOCK_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const SAVED_MODEL = {
  id: 30,
  name: 'Kson 1',
  modelType: 'own_model',
  prompt: 'the exact person from the supplied references',
  imageUrls: [MOCK_IMAGE],
  fullbodyUrl: MOCK_IMAGE,
};
const SAVED_MODEL_2 = {
  ...SAVED_MODEL,
  id: 31,
  name: 'Kson 2',
};

async function installSignedInState(page, { generationRecords = () => [], history = [], models = [SAVED_MODEL], withGarment = false } = {}) {
  await page.addInitScript(({ mockImage, seedGarment }) => {
    localStorage.setItem('vton_token', 'generation-flow-token');
    localStorage.setItem('vton_user', JSON.stringify({
      uid: 'tg_99001001',
      displayName: 'Generation Flow QA',
      isAnonymous: false,
      isGuest: false,
      isTelegramUser: true,
    }));
    if (seedGarment) localStorage.setItem('vton_garmentUrls', JSON.stringify([mockImage]));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => true },
    });
  }, { mockImage: MOCK_IMAGE, seedGarment: withGarment });

  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/subscription') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { plan: 'base', credits: 100, creditsTotal: 100 } }),
      });
    }
    if (url.pathname === '/api/user-data') {
      if (request.method() === 'DELETE') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      }
      const type = url.searchParams.get('type');
      const data = type === 'models' ? models : type === 'generation-tasks' ? generationRecords() : [];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data }) });
    }
    if (url.pathname === '/api/admin/user-history') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, generations: history }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) });
  });
}

test.describe('Generation background and history UX', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Mobile Telegram',
  });

  test('one tap selects each saved model on mobile and disables presets', async ({ page }) => {
    await installSignedInState(page, { models: [SAVED_MODEL, SAVED_MODEL_2] });
    await page.goto(BASE_URL);

    const casting = page.locator('.section').filter({ has: page.getByText('Кастинг-Рум — выбор модели') });
    await expect(casting.locator('.preset-card.active')).toHaveCount(1);
    await casting.getByRole('button', { name: /Мои Модели/u }).click();

    await expect(casting.getByText('Если используете свои модели, выбор моделей из пресетов не доступен')).toBeVisible();
    await expect(casting.locator('.preset-card.active')).toHaveCount(0);
    await expect(casting.locator('.selected-model-indicator')).toHaveCount(0);

    await casting.locator('.model-avatar', { hasText: 'Kson 1' }).click();
    await expect(casting.locator('.model-avatar', { hasText: 'Kson 1' })).toHaveAttribute('aria-checked', 'true');
    await casting.locator('.model-avatar', { hasText: 'Kson 2' }).click();
    await expect(casting.locator('.model-avatar', { hasText: 'Kson 2' })).toHaveAttribute('aria-checked', 'true');
    await expect(casting.getByText('Выбрано: Kson 1, Kson 2')).toBeVisible();
    await page.screenshot({ path: `${SHOT_DIR}/my-model-selected-mobile.png`, fullPage: false });
  });

  test('when eight images are active the user can launch only the two available slots', async ({ page }) => {
    const activeRecords = Array.from({ length: 8 }, (_, index) => ({
      id: 900 + index,
      clientBatchId: 'already-running',
      clientTaskId: `running-${index + 1}`,
      clientTaskLabel: `Кадр ${index + 1}`,
      clientTaskTotal: 8,
      clientJobTitle: 'Предыдущая генерация',
      clientJobKind: 'product',
      clientResumeMode: 'product',
      status: 'running',
      createdAt: new Date().toISOString(),
    }));
    const launchedBodies = [];
    await installSignedInState(page, {
      generationRecords: () => activeRecords,
      models: [SAVED_MODEL, SAVED_MODEL_2],
      withGarment: true,
    });
    await page.route('**/api/generate-image', async route => {
      if (route.request().method() !== 'POST') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      }
      launchedBodies.push(JSON.parse(route.request().postData() || '{}'));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, imageUrl: MOCK_IMAGE, creditsRemaining: 99 }),
      });
    });
    await page.goto(BASE_URL);

    const casting = page.locator('.section').filter({ has: page.getByText('Кастинг-Рум — выбор модели') });
    await casting.getByRole('button', { name: /Мои Модели/u }).click();
    await casting.locator('.model-avatar', { hasText: 'Kson 1' }).click();
    await casting.locator('.model-avatar', { hasText: 'Kson 2' }).click();
    await page.getByRole('button', { name: /^2 варианта/u }).click();

    const generateButton = page.locator('button.generate-btn').filter({ hasText: 'Сгенерировать 2 из 4' });
    await expect(generateButton).toBeEnabled();
    await generateButton.click();
    await expect(page.getByText('Запустить доступные 2?')).toBeVisible();
    await expect(page.getByText(/остальные не будут поставлены в очередь/u)).toBeVisible();
    await page.screenshot({ path: `${SHOT_DIR}/ten-image-limit-mobile.png`, fullPage: false });
    await page.getByRole('button', { name: 'Сгенерировать 2', exact: true }).click();

    await expect.poll(() => launchedBodies.length).toBe(2);
    expect(new Set(launchedBodies.map(body => body.sourceModelId))).toEqual(new Set([30, 31]));
  });

  test('a running fashion generation does not block a product generation', async ({ page }) => {
    const requestBodies = [];
    const pendingRoutes = [];
    await installSignedInState(page, { withGarment: true });
    await page.route('**/api/generate-image', route => {
      if (route.request().method() !== 'POST') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      }
      requestBodies.push(JSON.parse(route.request().postData() || '{}'));
      return new Promise(resolve => {
        pendingRoutes.push(() => route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, imageUrl: MOCK_IMAGE, creditsRemaining: 99 }),
        }).then(resolve));
      });
    });
    await page.goto(BASE_URL);

    await page.locator('button.generate-btn').filter({ hasText: 'Сгенерировать' }).click();
    await expect.poll(() => requestBodies.filter(body => body.isProductMode === false).length).toBe(2);
    await page.locator('.processing-close-btn').click();
    await page.getByRole('button', { name: /Предметка/u }).click();

    const productGenerate = page.locator('button.generate-btn').filter({ hasText: 'Сгенерировать' });
    await expect(productGenerate).toBeEnabled();
    await productGenerate.click();
    await expect.poll(() => requestBodies.filter(body => body.isProductMode === true).length).toBe(2);
    expect(requestBodies.some(body => body.isProductMode === false)).toBe(true);
    expect(requestBodies.some(body => body.isProductMode === true)).toBe(true);
    await page.screenshot({ path: `${SHOT_DIR}/cross-category-concurrent-mobile.png`, fullPage: false });

    await Promise.all(pendingRoutes.map(release => release()));
  });

  test('a minimized task survives reload and reflects running, error and completed states', async ({ page }) => {
    let status = 'running';
    await installSignedInState(page, {
      generationRecords: () => [{
        id: 800,
        clientBatchId: 'batch-persistent',
        clientTaskId: 'task-persistent',
        clientTaskLabel: 'Кадр 1',
        clientTaskTotal: 1,
        clientJobTitle: 'Виртуальная примерка',
        clientJobKind: 'fashion',
        clientResumeMode: 'fashion',
        status,
        error: status === 'error' ? 'KIE timeout' : '',
        imageUrl: status === 'success' ? MOCK_IMAGE : null,
        success: status === 'success',
        createdAt: new Date().toISOString(),
      }],
    });
    await page.goto(BASE_URL);

    const pill = page.locator('.generation-task-pill');
    await expect(pill).toHaveClass(/status-running/u);
    await pill.click();
    await expect(page.locator('.processing-overlay')).toBeVisible();
    await page.locator('.processing-close-btn').click();
    await expect(page.locator('.processing-overlay')).toHaveCount(0);
    await expect(pill).toBeVisible();

    await page.reload();
    await expect(page.locator('.generation-task-pill')).toHaveClass(/status-running/u);

    status = 'error';
    await page.reload();
    await expect(page.locator('.generation-task-pill')).toHaveClass(/status-error/u);
    await expect(page.locator('.generation-task-pill')).toContainText('Ошибка');

    status = 'success';
    await page.reload();
    await expect(page.locator('.generation-task-pill')).toHaveClass(/status-success/u);
    await expect(page.locator('.generation-task-pill')).toContainText('Готово');
    await page.screenshot({ path: `${SHOT_DIR}/background-task-complete-mobile.png`, fullPage: false });
  });

  test('My Works keeps the user inside the app and exposes the full action menu', async ({ page }) => {
    const history = [{
      id: 622,
      type: 'fashion',
      imageUrl: MOCK_IMAGE,
      createdAt: new Date().toISOString(),
      sourceModelId: 30,
      sourceModelName: 'Kson 1',
      modelPreset: 'the exact person from the supplied references',
      posePreset: 'standing straight',
      backgroundPreset: 'white studio',
      cameraAngle: 'full body',
      aspectRatio: '3:4',
      garmentUrls: [MOCK_IMAGE],
      attributes: {},
    }];
    await installSignedInState(page, { history });
    let popupCount = 0;
    page.on('popup', () => { popupCount += 1; });
    await page.goto(BASE_URL);
    await page.locator('.my-history-btn').click();
    await page.locator('.history-card').click();

    const lightbox = page.locator('.history-lightbox');
    await expect(lightbox).toBeVisible();
    for (const label of ['Фотосессия', 'Изменить кадр', 'Скачать', 'Поделиться', 'Удалить']) {
      await expect(lightbox.getByRole('button', { name: new RegExp(label, 'u') })).toBeVisible();
    }

    const urlBeforeDownload = page.url();
    const downloadPromise = page.waitForEvent('download');
    await lightbox.getByRole('button', { name: /Скачать/u }).click();
    await downloadPromise;
    await expect(lightbox).toBeVisible();
    expect(page.url()).toBe(urlBeforeDownload);
    expect(popupCount).toBe(0);

    await lightbox.getByRole('button', { name: /Поделиться/u }).click();
    await expect(lightbox.getByText('Ссылка на работу скопирована.')).toBeVisible();
    await page.screenshot({ path: `${SHOT_DIR}/my-works-actions-mobile.png`, fullPage: false });

    await lightbox.getByRole('button', { name: /Удалить/u }).click();
    await expect(lightbox.getByText('Удалить эту работу?')).toBeVisible();
    await lightbox.getByRole('button', { name: 'Отмена' }).click();
    await lightbox.getByRole('button', { name: /Изменить кадр/u }).click();

    await expect(page.locator('.history-lightbox')).toHaveCount(0);
    await expect(page.locator('.result-section')).toBeVisible();
    await expect(page.getByRole('button', { name: /Сохранить модель/u })).toHaveCount(0);
  });
});
