const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Navigate to login
  await page.goto('https://seller-studio-ai.ru/admin');
  await page.waitForTimeout(5000);
  
  console.log('Clicking Try Without Registration...');
  await page.click('button:has-text("Попробовать без регистрации")');
  await page.waitForTimeout(5000);
  
  console.log('Testing generations as guest...');
  // The UI shows "НЕТ ТАРИФА", but maybe we can upload an image?
  const uploadInput = page.locator('input[type="file"]').first();
  const filePath = path.join(__dirname, 'public', 'examples', 'cards', '1.png');
  
  if (fs.existsSync(filePath)) {
     console.log('Uploading file:', filePath);
     await uploadInput.setInputFiles(filePath);
     await page.waitForTimeout(5000);
     await page.screenshot({path: 'guest_upload.png'});
  } else {
     console.log('File not found:', filePath);
  }

  await browser.close();
})();
