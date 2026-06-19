import { test } from '@playwright/test';

test('capture local console errors', async ({ page }) => {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('CONSOLE ERROR:', msg.text());
    }
  });
  page.on('pageerror', err => {
    console.log('UNCAUGHT EXCEPTION:', err.message);
  });
  
  await page.goto('http://localhost:4173');
  await page.waitForTimeout(5000);
});
