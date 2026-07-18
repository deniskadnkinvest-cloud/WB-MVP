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

async function installSignedInState(page, { generationRecords = () => [], history = [] } = {}) {
  await page.addInitScript(() => {
    localStorage.setItem('vton_token', 'generation-flow-token');
    localStorage.setItem('vton_user', JSON.stringify({
      uid: 'tg_99001001',
      displayName: 'Generation Flow QA',
      isAnonymous: false,
      isGuest: false,
      isTelegramUser: true,
    }));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => true },
    });
  });

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
      const data = type === 'models' ? [SAVED_MODEL] : type === 'generation-tasks' ? generationRecords() : [];
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

  test('switching to My Models visibly disables presets until a saved model is chosen', async ({ page }) => {
    await installSignedInState(page);
    await page.goto(BASE_URL);

    const casting = page.locator('.section').filter({ has: page.getByText('Кастинг-Рум — выбор модели') });
    await expect(casting.locator('.preset-card.active')).toHaveCount(1);
    await casting.getByRole('button', { name: /Мои Модели/u }).click();

    await expect(casting.getByText('Используются только ваши модели. Выбор из пресетов сброшен.')).toBeVisible();
    await expect(casting.locator('.preset-card.active')).toHaveCount(0);
    await expect(casting.locator('.selected-model-indicator')).toHaveCount(0);

    await casting.locator('.model-avatar', { hasText: 'Kson 1' }).click();
    await expect(casting.getByText('Выбрана: Kson 1')).toBeVisible();
    await page.screenshot({ path: `${SHOT_DIR}/my-model-selected-mobile.png`, fullPage: false });
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
