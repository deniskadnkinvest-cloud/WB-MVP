import { chromium } from 'playwright';

async function testPlaywright() {
  try {
    console.log('Connecting to Chrome via CDP...');
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    console.log('✅ Successfully connected to Chrome!');
    const contexts = browser.contexts();
    console.log(`Found ${contexts.length} browser contexts.`);
    
    // List open pages
    for (const context of contexts) {
      const pages = context.pages();
      console.log(`Context has ${pages.length} open pages:`);
      for (const page of pages) {
        console.log(` - Title: "${await page.title()}", URL: ${page.url()}`);
      }
    }
    
    await browser.close();
  } catch (err) {
    console.error('❌ Playwright connection failed:', err.message);
  }
}

testPlaywright();
