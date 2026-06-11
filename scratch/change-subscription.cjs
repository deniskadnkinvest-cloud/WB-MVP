const { chromium } = require('playwright');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Загружаем конфиг из .env.local
const envLocalPath = path.join(__dirname, '..', '.env.local');
let firebaseConfig = {};
if (fs.existsSync(envLocalPath)) {
  const envConfig = dotenv.parse(fs.readFileSync(envLocalPath));
  firebaseConfig = {
    apiKey: envConfig.VITE_FIREBASE_API_KEY,
    authDomain: envConfig.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: envConfig.VITE_FIREBASE_PROJECT_ID,
    storageBucket: envConfig.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: envConfig.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: envConfig.VITE_FIREBASE_APP_ID
  };
} else {
  console.error('Не найден файл .env.local!');
  process.exit(1);
}

// Получаем аргументы командной строки
const args = process.argv.slice(2);
const targetPlan = args[0] || 'base'; // none, trial, base, pro
const targetCredits = parseInt(args[1], 10) !== undefined && !isNaN(parseInt(args[1], 10)) ? parseInt(args[1], 10) : 100;
const targetAutoRenew = args[2] === 'true'; // true или false

console.log(`Целевые параметры:`);
console.log(`- План: ${targetPlan}`);
console.log(`- Кредиты: ${targetCredits}`);
console.log(`- Автопродление: ${targetAutoRenew}`);

(async () => {
  let browser;
  try {
    console.log('Подключаюсь к Chrome на localhost:9222...');
    browser = await chromium.connectOverCDP('http://localhost:9222');
    const contexts = browser.contexts();
    
    // Ищем страницу с приложением
    let appPage = null;
    for (const context of contexts) {
      for (const page of context.pages()) {
        const url = page.url();
        if (url.includes('seller-studio-ai.ru') || url.includes('vton-mvp-omega.vercel.app') || url.includes('localhost:5173')) {
          appPage = page;
          break;
        }
      }
      if (appPage) break;
    }
    
    if (!appPage) {
      console.error('Вкладка с Селлер-Студией не найдена в запущенном Chrome!');
      console.log('Пожалуйста, откройте https://seller-studio-ai.ru/ в браузере Chrome.');
      await browser.close();
      process.exit(1);
    }
    
    console.log(`Найдена вкладка: ${appPage.url()}`);
    
    // Внедряем скрипт изменения подписки
    const result = await appPage.evaluate(async ({ config, plan, credits, autoRenew }) => {
      return new Promise((resolve, reject) => {
        // Загружаем Firebase v8 динамически
        const s1 = document.createElement('script');
        s1.src = 'https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js';
        s1.onload = () => {
          const s2 = document.createElement('script');
          s2.src = 'https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js';
          s2.onload = () => {
            const s3 = document.createElement('script');
            s3.src = 'https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js';
            s3.onload = () => {
              runUpdate(window.firebase);
            };
            document.head.appendChild(s3);
          };
          document.head.appendChild(s2);
        };
        document.head.appendChild(s1);
        
        function runUpdate(fb) {
          try {
            // Инициализируем временное приложение, если еще не инициализировано
            let app;
            if (fb.apps.length > 0) {
              app = fb.app();
            } else {
              app = fb.initializeApp(config);
            }
            
            const auth = fb.auth(app);
            const db = fb.firestore(app);
            
            let resolved = false;
            
            const handleUser = async (user) => {
              const uid = user.uid;
              const email = user.email;
              
              // Вычисляем срок действия (если это не none/trial)
              let planExpiresAt = null;
              if (plan !== 'none' && plan !== 'trial') {
                const expiresDate = new Date();
                expiresDate.setMonth(expiresDate.getMonth() + 1); // +1 месяц
                planExpiresAt = fb.firestore.Timestamp.fromDate(expiresDate);
              }
              
              const ref = db.collection('users').doc(uid).collection('subscription').doc('current');
              
              const updateData = {
                plan: plan,
                credits: credits,
                creditsTotal: credits,
                planActivatedAt: fb.firestore.FieldValue.serverTimestamp(),
                planExpiresAt: planExpiresAt,
                subscriptionStatus: plan !== 'none' ? 'active' : 'inactive',
                autoRenew: autoRenew,
                updatedByAgent: true
              };
              
              try {
                await ref.set(updateData, { merge: true });
                resolve({ success: true, uid, email, updateData });
              } catch (dbErr) {
                reject(new Error(`Ошибка обновления Firestore: ${dbErr.message}`));
              }
            };
            
            // Если пользователь уже загружен в Auth инстансе
            if (auth.currentUser) {
              resolved = true;
              handleUser(auth.currentUser);
              return;
            }
            
            // Иначе слушаем события
            const unsubscribe = auth.onAuthStateChanged((user) => {
              if (user && !resolved) {
                resolved = true;
                unsubscribe();
                handleUser(user);
              }
            });
            
            // Таймаут через 4 секунды
            setTimeout(() => {
              if (!resolved) {
                unsubscribe();
                reject(new Error(`Пользователь не авторизован (превышено время ожидания Auth). Текущий URL страницы: ${window.location.href}`));
              }
            }, 4000);
            
          } catch (err) {
            reject(err);
          }
        }
      });
    }, { config: firebaseConfig, plan: targetPlan, credits: targetCredits, autoRenew: targetAutoRenew });
    
    if (result && result.success) {
      console.log(`\n✅ Успешно обновлено!`);
      console.log(`Пользователь: ${result.email} (${result.uid})`);
      console.log(`Обновленные данные:`, result.updateData);
    }
    
    await browser.close();
  } catch (err) {
    console.error('Ошибка выполнения скрипта:', err.message);
    if (browser) await browser.close();
  }
})();
