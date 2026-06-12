import { chromium } from '@playwright/test';
import dotenv from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';

// Загружаем .env.local
const envRaw = await fs.readFile(path.resolve('.env.local'), 'utf-8').catch(() => '');
const envConfig = dotenv.parse(envRaw);

const firebaseConfig = {
  apiKey: envConfig.VITE_FIREBASE_API_KEY,
  authDomain: envConfig.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: envConfig.VITE_FIREBASE_PROJECT_ID,
  storageBucket: envConfig.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: envConfig.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: envConfig.VITE_FIREBASE_APP_ID
};

const TARGET_PLAN = process.argv[2] || 'pro';
const TARGET_CREDITS = parseInt(process.argv[3] || '1000', 10);

console.log(`🚀 Upgrading to plan=${TARGET_PLAN}, credits=${TARGET_CREDITS}`);
console.log('Firebase project:', firebaseConfig.projectId);

let browser;
try {
  browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const contexts = browser.contexts();

  // Ищем страницу с приложением
  let page = null;
  for (const ctx of contexts) {
    for (const p of ctx.pages()) {
      if (p.url().includes('seller-studio-ai.ru')) {
        page = p;
        break;
      }
    }
    if (page) break;
  }

  if (!page) {
    console.log('Страница не найдена, создаём новую...');
    page = await contexts[0].newPage();
    await page.goto('https://seller-studio-ai.ru', { waitUntil: 'networkidle' });
  }

  console.log(`Страница найдена: ${page.url()}`);

  // Проверяем текущий статус через приложение React
  const currentBadge = await page.locator('.sub-badge').textContent().catch(() => 'N/A');
  console.log(`Текущий статус: ${currentBadge}`);

  // Обновляем Firestore через Firebase SDK уже загруженный в странице
  const result = await page.evaluate(async ({ config, plan, credits }) => {
    // Импортируем Firebase v9 модульно (т.к. приложение уже его использует)
    // Используем window.__firebaseApp если доступен, иначе грузим Firebase v8 скриптом
    return new Promise((resolve, reject) => {
      // Метод 1: Используем глобальные Firebase объекты если уже загружены
      // Метод 2: Загружаем Firebase 8.x compat через CDN
      const loadScript = (src) => new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = res;
        s.onerror = rej;
        document.head.appendChild(s);
      });

      (async () => {
        try {
          // Грузим Firebase compat v9 (совместимость с v8 API)
          await loadScript('https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js');
          await loadScript('https://www.gstatic.com/firebasejs/9.22.2/firebase-auth-compat.js');
          await loadScript('https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore-compat.js');

          const fb = window.firebase;
          
          // Инициализируем под временным именем чтобы не конфликтовать
          let app;
          try {
            app = fb.app('upgrade-tool');
          } catch {
            app = fb.initializeApp(config, 'upgrade-tool');
          }

          const auth = fb.auth(app);
          const db = fb.firestore(app);

          const getUser = () => new Promise((res, rej) => {
            if (auth.currentUser) { res(auth.currentUser); return; }
            const unsub = auth.onAuthStateChanged(u => {
              if (u) { unsub(); res(u); }
            });
            setTimeout(() => { unsub(); rej(new Error('Auth timeout')); }, 5000);
          });

          const user = await getUser();

          const ref = db.collection('users').doc(user.uid).collection('subscription').doc('current');
          await ref.set({
            plan,
            credits,
            creditsTotal: credits,
            planActivatedAt: fb.firestore.FieldValue.serverTimestamp(),
            planExpiresAt: null,
            subscriptionStatus: 'active',
            autoRenew: false,
            updatedByAgent: true
          }, { merge: true });

          resolve({ success: true, uid: user.uid, email: user.email, plan, credits });
        } catch (err) {
          reject({ error: err.message });
        }
      })();
    });
  }, { config: firebaseConfig, plan: TARGET_PLAN, credits: TARGET_CREDITS });

  console.log('\n✅ Результат:', JSON.stringify(result, null, 2));

  // Перезагружаем страницу чтобы применились новые кредиты
  console.log('\nПерезагружаем страницу...');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const newBadge = await page.locator('.sub-badge').textContent().catch(() => 'N/A');
  console.log(`Новый статус: ${newBadge}`);

  await page.screenshot({ path: 'test-results/subscription-upgraded.png' });
  console.log('Скриншот сохранен: test-results/subscription-upgraded.png');

} catch (err) {
  console.error('Ошибка:', err);
}
