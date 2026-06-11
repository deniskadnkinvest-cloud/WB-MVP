const { chromium } = require('playwright');

// Получаем аргументы командной строки
const args = process.argv.slice(2);
const uid = args[0];
const targetPlan = args[1] || 'base'; // none, trial, base, pro
const targetCredits = parseInt(args[2], 10) !== undefined && !isNaN(parseInt(args[2], 10)) ? parseInt(args[2], 10) : 100;
const targetAutoRenew = args[3] === 'true'; // true или false

if (!uid) {
  console.error('Ошибка: Не указан UID пользователя!');
  process.exit(1);
}

console.log(`Параметры обновления (через браузер c credentials):`);
console.log(`- UID: ${uid}`);
console.log(`- План: ${targetPlan}`);
console.log(`- Кредиты: ${targetCredits}`);
console.log(`- Автопродление: ${targetAutoRenew}`);

(async () => {
  let browser;
  try {
    console.log('Подключаюсь к Chrome на localhost:9222...');
    browser = await chromium.connectOverCDP('http://localhost:9222');
    const defaultContext = browser.contexts()[0];
    const page = await defaultContext.newPage();
    
    let authHeader = null;
    
    // Перехватываем заголовки авторизации
    page.on('request', request => {
      const headers = request.headers();
      const auth = headers['authorization'];
      if (auth && auth.startsWith('SAPISIDHASH')) {
        authHeader = auth;
      }
    });
    
    const projectId = 'lord-f842d';
    const consoleUrl = `https://console.firebase.google.com/project/${projectId}/firestore/databases/-default-/data`;
    
    console.log('Открываю Firebase Console для получения токена...');
    await page.goto(consoleUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    console.log('Жду перехвата токена (до 10 секунд)...');
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(1000);
      if (authHeader) {
        break;
      }
    }
    
    if (!authHeader) {
      console.error('❌ Не удалось перехватить токен авторизации SAPISIDHASH.');
      await page.close();
      await browser.close();
      process.exit(1);
    }
    
    console.log('✅ Токен успешно перехвачен! Выполняю REST запрос внутри контекста браузера с credentials...');
    
    // Формируем поля Firestore REST API
    const fields = {
      plan: { stringValue: targetPlan },
      credits: { integerValue: targetCredits },
      creditsTotal: { integerValue: targetCredits },
      subscriptionStatus: { stringValue: targetPlan !== 'none' ? 'active' : 'inactive' },
      autoRenew: { booleanValue: targetAutoRenew }
    };
    
    if (targetPlan !== 'none' && targetPlan !== 'trial') {
      const expiresDate = new Date();
      expiresDate.setMonth(expiresDate.getMonth() + 1);
      fields.planExpiresAt = { timestampValue: expiresDate.toISOString() };
    } else {
      fields.planExpiresAt = { nullValue: null };
    }
    
    const restUrl = `https://firestore.clients6.google.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}/subscription/current?updateMask.fieldPaths=plan&updateMask.fieldPaths=credits&updateMask.fieldPaths=creditsTotal&updateMask.fieldPaths=subscriptionStatus&updateMask.fieldPaths=autoRenew&updateMask.fieldPaths=planExpiresAt`;
    
    // Выполняем fetch внутри контекста страницы
    const result = await page.evaluate(async ({ url, auth, bodyFields, docName }) => {
      try {
        const response = await fetch(url, {
          method: 'PATCH',
          credentials: 'include', // ВАЖНО: прикреплять куки для CORS
          headers: {
            'Authorization': auth,
            'Content-Type': 'application/json',
            'X-Goog-Encode-Response-If-Executable': 'base64',
          },
          body: JSON.stringify({
            name: docName,
            fields: bodyFields
          })
        });
        
        const text = await response.text();
        return {
          status: response.status,
          ok: response.ok,
          body: text
        };
      } catch (err) {
        return { error: err.message };
      }
    }, {
      url: restUrl,
      auth: authHeader,
      bodyFields: fields,
      docName: `projects/${projectId}/databases/(default)/documents/users/${uid}/subscription/current`
    });
    
    console.log(`Статус ответа браузера: ${result.status}`);
    if (result.ok) {
      console.log(`\n🎉 Успешно! Подписка пользователя ${uid} обновлена в Firestore через контекст браузера.`);
      console.log(JSON.stringify(JSON.parse(result.body), null, 2));
    } else {
      console.error(`\n❌ Ошибка внутри браузера:`, result.body || result.error);
    }
    
    await page.close();
    await browser.close();
  } catch (err) {
    console.error('Ошибка:', err);
    if (browser) await browser.close();
  }
})();
