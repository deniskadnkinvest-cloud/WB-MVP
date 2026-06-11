const { chromium } = require('playwright');
const path = require('path');

(async () => {
  console.log('Подключаюсь к Chrome на localhost:9222...');
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const defaultContext = browser.contexts()[0];
  const page = await defaultContext.newPage();
  
  const projectId = 'lord-f842d';
  const domainToAdd = 'seller-studio-ai.ru';
  
  console.log('Открываю Settings -> Authorized domains...');
  await page.goto(`https://console.firebase.google.com/project/${projectId}/authentication/settings`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);

  console.log('Кликаю на "Authorized domains" в левом меню...');
  const authorizedDomainsLink = page.locator('text="Authorized domains"').first();
  await authorizedDomainsLink.click();
  await page.waitForTimeout(3000);
  
  await page.screenshot({ path: path.join(__dirname, 'firebase-domains.png'), fullPage: true });
  console.log('Скриншот раздела Authorized domains сохранен');
  
  console.log('Ищу кнопку Add domain...');
  const addBtn = page.locator('button').filter({ hasText: 'Add domain' }).first();
  if (await addBtn.isVisible().catch(() => false)) {
    console.log('Нашел кнопку! Кликаю...');
    await addBtn.click();
    await page.waitForTimeout(1000);
    
    const input = page.locator('input').filter({ hasText: '' }).last();
    await input.waitFor({ state: 'visible', timeout: 5000 });
    await input.fill(domainToAdd);
    console.log(`Ввел домен: ${domainToAdd}`);
    await page.waitForTimeout(500);
    
    const confirmBtn = page.locator('button').filter({ hasText: 'Add' }).last();
    await confirmBtn.click();
    console.log('Нажал Add - домен добавлен!');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: path.join(__dirname, 'firebase-domains-after.png'), fullPage: true });
    console.log('Скриншот ПОСЛЕ добавления сохранен');
  } else {
    console.log('Кнопка Add domain не видна - делаем скриншот текущего состояния');
    await page.screenshot({ path: path.join(__dirname, 'firebase-domains-debug.png'), fullPage: true });
  }
  
  await page.close();
  console.log('Готово!');
})();
