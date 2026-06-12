const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Navigate to login
  await page.goto('https://seller-studio-ai.ru/admin');
  await page.waitForTimeout(5000);
  
  console.log('Clicking Try Without Registration...');
  await page.click('button:has-text("Попробовать без регистрации")');
  await page.waitForTimeout(5000);
  
  await page.screenshot({path: 'admin_login_guest.png'});
  console.log('Screenshot saved.');
  
  await browser.close();
})();
