// Diagnostic script — understand why page is black
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0] || await browser.newContext();
  const page = await context.newPage();

  // Capture console messages
  const logs = [];
  page.on('console', msg => logs.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => logs.push({ type: 'PAGE_ERROR', text: err.message }));

  console.log('Navigating...');
  await page.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  
  // Wait longer for React hydration
  console.log('Waiting 8 seconds for React to render...');
  await page.waitForTimeout(8000);

  // Dump page info
  const info = await page.evaluate(() => {
    const root = document.getElementById('root');
    const body = document.body;
    return {
      title: document.title,
      url: location.href,
      bodyChildCount: body?.children.length,
      bodyInnerHTML: body?.innerHTML?.slice(0, 2000),
      rootExists: !!root,
      rootChildCount: root?.children.length || 0,
      rootInnerHTML: root?.innerHTML?.slice(0, 2000),
      bodyBg: getComputedStyle(body).backgroundColor,
      htmlBg: getComputedStyle(document.documentElement).backgroundColor,
      allElements: document.querySelectorAll('*').length,
      scripts: Array.from(document.querySelectorAll('script')).map(s => ({ src: s.src, type: s.type })),
    };
  });

  console.log('\n=== PAGE INFO ===');
  console.log(JSON.stringify(info, null, 2));
  console.log('\n=== CONSOLE LOGS ===');
  logs.forEach(l => console.log(`[${l.type}] ${l.text}`));

  await page.screenshot({ path: __dirname + '/diag_8s.png', fullPage: true });
  console.log('\nScreenshot saved: diag_8s.png');

  await page.close();
  process.exit(0);
})();
