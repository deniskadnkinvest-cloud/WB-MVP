const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('https://seller-studio-ai.ru/admin');
  await page.waitForTimeout(5000);
  
  console.log('Logging in with email/password...');
  await page.fill('input[type="email"]', 'deniskadnkinvest@gmail.com');
  // It seems there is a password field only when configured, looking at the previous screenshots,
  // there is a "Пароль" field.
  const passInputs = await page.locator('input[type="password"]');
  if (await passInputs.count() > 0) {
    await passInputs.first().fill('123456');
  } else {
    // maybe it's just type="text" because of some eye icon logic
    const allInputs = await page.locator('input');
    await allInputs.nth(1).fill('123456'); 
  }
  
  await page.click('button:has-text("Войти")');
  await page.waitForTimeout(10000);
  
  await page.screenshot({path: 'admin_login_pass_test.png'});
  console.log('Screenshot saved.');

  await browser.close();
})();
