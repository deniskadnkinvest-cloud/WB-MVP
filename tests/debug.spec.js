import { test } from '@playwright/test';

test('capture console errors', async ({ page }) => {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('CONSOLE ERROR:', msg.text());
    }
  });
  page.on('pageerror', err => {
    console.log('UNCAUGHT EXCEPTION:', err.message);
  });
  
  await page.goto('https://vton-c2jshahz0-deniskadnkinvest-clouds-projects.vercel.app');
  await page.waitForTimeout(5000);
});
