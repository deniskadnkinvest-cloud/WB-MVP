/**
 * Обновляет подписку через Firestore REST API с токеном из браузера
 */
import { chromium } from '@playwright/test';

const TARGET_PLAN = 'pro';
const TARGET_CREDITS = 1000;
const FIREBASE_PROJECT_ID = 'lord-f842d'; // из localStorage ключа

console.log('🔌 Подключаюсь к Chrome на порту 9222...');

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');

// Ищем страницу
let page = null;
for (const ctx of browser.contexts()) {
  for (const p of ctx.pages()) {
    if (p.url().includes('seller-studio-ai.ru')) { page = p; break; }
  }
  if (page) break;
}

if (!page) {
  const ctx = browser.contexts()[0];
  page = await ctx.newPage();
  await page.goto('https://seller-studio-ai.ru', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3000);
}

console.log(`✅ Страница: ${page.url()}`);

// Получаем uid и idToken из localStorage
const authInfo = await page.evaluate(() => {
  const authKey = Object.keys(localStorage).find(k => k.startsWith('firebase:authUser:'));
  if (!authKey) return null;
  const data = JSON.parse(localStorage.getItem(authKey));
  return {
    uid: data?.uid,
    idToken: data?.stsTokenManager?.accessToken,
    tokenExpiry: data?.stsTokenManager?.expirationTime,
  };
});

if (!authInfo?.uid) {
  console.log('❌ Пользователь не найден в localStorage');
  process.exit(1);
}

console.log(`👤 UID: ${authInfo.uid}`);
console.log(`🔑 Токен: ${authInfo.idToken ? '✅ есть (' + authInfo.idToken.length + ' chars)' : '❌ нет'}`);
console.log(`⏰ Истекает: ${authInfo.tokenExpiry ? new Date(authInfo.tokenExpiry).toISOString() : 'N/A'}`);

// Если токен протух — обновляем через Firebase Auth refresh
let freshToken = authInfo.idToken;
const now = Date.now();
if (authInfo.tokenExpiry && authInfo.tokenExpiry < now) {
  console.log('♻️ Токен протух, обновляю...');
  freshToken = await page.evaluate(async () => {
    // Используем Firebase SDK уже загруженный в приложении
    return new Promise((resolve) => {
      const check = setInterval(() => {
        const app = window.__firebase_apps?.[0] || (typeof firebase !== 'undefined' ? firebase.apps[0] : null);
        if (app) {
          clearInterval(check);
          // Не нашли через глобальные — используем fetch к Firebase token refresh
          resolve(null);
        }
      }, 100);
      setTimeout(() => { clearInterval(check); resolve(null); }, 3000);
    });
  });
}

// Обновляем Firestore через REST API
const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${authInfo.uid}/subscription/current`;

const patchBody = {
  fields: {
    plan: { stringValue: TARGET_PLAN },
    credits: { integerValue: String(TARGET_CREDITS) },
    creditsTotal: { integerValue: String(TARGET_CREDITS) },
    subscriptionStatus: { stringValue: 'active' },
    planActivatedAt: { timestampValue: new Date().toISOString() },
    grantedByAdmin: { booleanValue: true },
    autoRenew: { booleanValue: false },
  }
};

const updateMask = Object.keys(patchBody.fields).map(f => `updateMask.fieldPaths=${f}`).join('&');

console.log(`\n📡 PATCH ${firestoreUrl}`);

const resp = await page.evaluate(async ({ url, mask, body, token }) => {
  try {
    const r = await fetch(`${url}?${mask}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: r.status, ok: r.ok, data };
  } catch (err) {
    return { error: err.message };
  }
}, { url: firestoreUrl, mask: updateMask, body: patchBody, token: freshToken });

console.log(`\n📊 Ответ Firestore [${resp.status}]:`, resp.ok ? '✅ SUCCESS' : '❌ ERROR');

if (resp.error) {
  console.log('Ошибка fetch:', resp.error);
} else if (!resp.ok) {
  console.log('Детали:', JSON.stringify(resp.data, null, 2));
} else {
  console.log(`\n🎉 ГОТОВО! Подписка обновлена: plan=${TARGET_PLAN}, credits=${TARGET_CREDITS}`);
  
  // Перезагружаем страницу
  console.log('🔄 Перезагружаю страницу...');
  await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  
  // Скриншот
  await page.screenshot({ path: 'test-results/pro-upgraded.png', fullPage: false });
  console.log('📸 Скриншот: test-results/pro-upgraded.png');
}

await browser.close().catch(() => {});
