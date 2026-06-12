import { chromium } from '@playwright/test';
import { promises as fs } from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Загружаем конфиг из .env.local
const envLocalPath = path.resolve('.env.local');
let firebaseConfig = {};
if (fs.existsSync) {
  try {
    const envConfig = dotenv.parse(await fs.readFile(envLocalPath, 'utf-8'));
    firebaseConfig = {
      apiKey: envConfig.VITE_FIREBASE_API_KEY,
      authDomain: envConfig.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: envConfig.VITE_FIREBASE_PROJECT_ID,
      storageBucket: envConfig.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: envConfig.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: envConfig.VITE_FIREBASE_APP_ID
    };
  } catch (e) {
    console.error('Ошибка загрузки .env.local:', e);
  }
}

async function run() {
  console.log('Connecting to Chrome at http://127.0.0.1:9222...');
  let browser;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    console.log('Successfully connected!');
    const contexts = browser.contexts();
    const page = contexts[0] && contexts[0].pages().length > 0 ? contexts[0].pages()[0] : await browser.newPage();
    
    // Включаем вывод консоли браузера
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.text().includes('generate-image')) {
        console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`);
      }
    });

    console.log('Navigating to https://seller-studio-ai.ru...');
    await page.goto('https://seller-studio-ai.ru', { waitUntil: 'networkidle' });
    
    // 1. Авторизация
    const subBadge = page.locator('.sub-badge');
    const isAlreadyLoggedIn = await subBadge.isVisible().catch(() => false);
    
    if (!isAlreadyLoggedIn) {
      console.log('Not logged in. Clicking "Попробовать без регистрации"...');
      const guestBtn = page.locator('button:has-text("Попробовать без регистрации")');
      if (await guestBtn.isVisible()) {
        await guestBtn.click();
        console.log('Waiting for app to load...');
        await page.waitForSelector('.sub-badge', { timeout: 15000 });
      }
    } else {
      console.log('Already logged in.');
    }
    
    // 2. Начисление кредитов (выдаем 50 кредитов)
    console.log('Activating 50 trial credits via Firestore...');
    const result = await page.evaluate(async ({ config }) => {
      return new Promise((resolve, reject) => {
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
            let app = fb.apps.length > 0 ? fb.app() : fb.initializeApp(config);
            const auth = fb.auth(app);
            const db = fb.firestore(app);
            
            let resolved = false;
            const handleUser = async (user) => {
              const uid = user.uid;
              const ref = db.collection('users').doc(uid).collection('subscription').doc('current');
              const updateData = {
                plan: 'trial',
                credits: 50,
                creditsTotal: 50,
                planActivatedAt: fb.firestore.FieldValue.serverTimestamp(),
                planExpiresAt: null,
                subscriptionStatus: 'active',
                autoRenew: false,
                updatedByAgent: true
              };
              try {
                await ref.set(updateData, { merge: true });
                resolve({ success: true, uid, email: user.email });
              } catch (dbErr) {
                reject(new Error(`Firestore error: ${dbErr.message}`));
              }
            };
            
            if (auth.currentUser) {
              resolved = true;
              handleUser(auth.currentUser);
            } else {
              const unsubscribe = auth.onAuthStateChanged((user) => {
                if (user && !resolved) {
                  resolved = true;
                  unsubscribe();
                  handleUser(user);
                }
              });
              setTimeout(() => {
                if (!resolved) {
                  unsubscribe();
                  reject(new Error('Auth timeout'));
                }
              }, 4000);
            }
          } catch (err) { reject(err); }
        }
      });
    }, { config: firebaseConfig });
    
    console.log(`Credits activated for user: ${result.uid}. Reloading page...`);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    const badgeText = await page.locator('.sub-badge').textContent();
    console.log(`New subscription status: "${badgeText}"`);
    
    // Создаем директорию для скриншотов
    await fs.mkdir('test-results/real-tests', { recursive: true });

    // ==========================================
    // ТЕСТ 1: Fashion VTON (Одежда)
    // ==========================================
    console.log('\n--- TEST 1: Fashion VTON ("Одежда") ---');
    await page.locator('button.mode-btn:has-text("Одежда")').click();
    await page.waitForTimeout(1000);
    
    // Загружаем одежду
    const pajamaPath = path.resolve('public/examples/cards/epic-pajama-before.jpg');
    console.log(`Uploading clothing image: ${pajamaPath}`);
    const fileInput1 = page.locator('input[type="file"]').first();
    await fileInput1.setInputFiles(pajamaPath);
    console.log('Waiting for preview...');
    await page.waitForSelector('.multi-preview-item img', { timeout: 10000 });
    
    // Выбираем количество кадров: 1 вариант (чтобы сэкономить кредиты и время)
    const oneCardBtn = page.locator('.variant-count-btn', { hasText: '1' }).first();
    if (await oneCardBtn.isVisible()) {
      await oneCardBtn.click();
      await page.waitForTimeout(300);
    }

    // Делаем скриншот перед генерацией
    await page.screenshot({ path: 'test-results/real-tests/01_vton_before.png', fullPage: true });

    // Нажимаем сгенерировать
    const genBtn1 = page.locator('button.generate-btn:has-text("Сгенерировать")');
    console.log('Clicking generate...');
    await genBtn1.click();
    
    // Ждем окончания генерации (статус успеха или появление картинки в галерее)
    console.log('Waiting for generation to complete (up to 60s)...');
    await page.waitForSelector('.generated-image-container, .status-banner.success', { timeout: 70000 });
    console.log('VTON generation completed!');
    
    await page.screenshot({ path: 'test-results/real-tests/02_vton_result.png', fullPage: true });
    
    // ==========================================
    // ТЕСТ 2: Product Mode (Предметка)
    // ==========================================
    console.log('\n--- TEST 2: Product Mode ("Предметка") ---');
    await page.locator('button.mode-btn:has-text("Предметка")').click();
    await page.waitForTimeout(1500);
    
    // Сначала удалим старые превью, если они остались
    const removeBtns = page.locator('.remove-btn');
    const count = await removeBtns.count();
    for (let i = 0; i < count; i++) {
      await removeBtns.first().click();
      await page.waitForTimeout(200);
    }
    
    // Загружаем товар
    const glassPath = path.resolve('public/examples/cards/epic-glass-before.jpg');
    console.log(`Uploading product image: ${glassPath}`);
    const fileInput2 = page.locator('input[type="file"]').first();
    await fileInput2.setInputFiles(glassPath);
    await page.waitForSelector('.multi-preview-item img', { timeout: 10000 });
    
    // Выбираем категорию "Косметика и уход"
    console.log('Selecting category Cosmetics...');
    const catCosmetics = page.locator('.preset-card:has-text("Косметика")').first();
    await catCosmetics.click();
    await page.waitForTimeout(300);
    
    // Выбираем сцену "Чистая эстетика"
    console.log('Selecting background...');
    const bgAesthetics = page.locator('.preset-card:has-text("Чистая эстетика")').first();
    if (await bgAesthetics.isVisible()) {
      await bgAesthetics.click();
      await page.waitForTimeout(300);
    }
    
    // Количество вариантов: 1
    const oneCardBtn2 = page.locator('.variant-count-btn', { hasText: '1' }).first();
    if (await oneCardBtn2.isVisible()) {
      await oneCardBtn2.click();
      await page.waitForTimeout(300);
    }
    
    await page.screenshot({ path: 'test-results/real-tests/03_product_before.png', fullPage: true });
    
    // Нажимаем сгенерировать
    console.log('Clicking generate...');
    const genBtn2 = page.locator('button.generate-btn:has-text("Сгенерировать")');
    await genBtn2.click();
    
    console.log('Waiting for product generation to complete...');
    await page.waitForSelector('.generated-image-container, .status-banner.success', { timeout: 70000 });
    console.log('Product generation completed!');
    
    await page.screenshot({ path: 'test-results/real-tests/04_product_result.png', fullPage: true });

    // ==========================================
    // ТЕСТ 3: Quick Mode (В два клика)
    // ==========================================
    console.log('\n--- TEST 3: Quick Mode ("В два клика") ---');
    await page.locator('button.mode-btn:has-text("В два клика")').click();
    await page.waitForTimeout(1500);
    
    // Удаляем старые превью, если остались
    const quickRemoveBtns = page.locator('.remove-preview');
    const quickCount = await quickRemoveBtns.count();
    for (let i = 0; i < quickCount; i++) {
      await quickRemoveBtns.first().click();
      await page.waitForTimeout(200);
    }

    // Загружаем товар
    console.log(`Uploading image for Quick Mode: ${glassPath}`);
    const fileInput3 = page.locator('#quick-upload');
    await fileInput3.setInputFiles(glassPath);
    await page.waitForSelector('.multi-preview-item img', { timeout: 10000 });
    
    // Выбираем стиль карточки "Естественная"
    const styleBtn = page.locator('.card-style-btn', { hasText: 'Естественная' }).first();
    await styleBtn.click();
    await page.waitForTimeout(300);
    
    await page.screenshot({ path: 'test-results/real-tests/05_quick_before.png', fullPage: true });
    
    // Нажимаем Создать карточку
    console.log('Clicking "Создать карточку"...');
    const genBtn3 = page.locator('button.generate-btn.quick-generate-btn');
    await genBtn3.click();
    
    // Этот процесс занимает два шага (сначала Шаг 1, потом Шаг 2)
    console.log('Waiting for Quick Mode (Step 1 + Step 2) to complete...');
    // Ждем, пока статус-текст покажет успех
    await page.waitForSelector('text=Карточка маркетплейса создана, .status-banner.success', { timeout: 130000 });
    console.log('Quick Mode generation completed!');
    
    await page.screenshot({ path: 'test-results/real-tests/06_quick_result.png', fullPage: true });

    // ==========================================
    // ТЕСТ 4: Card Designer
    // ==========================================
    console.log('\n--- TEST 4: Card Designer ---');
    // Мы можем оформить карточку из сгенерированного изображения
    // Ищем кнопку создания карточки под результатом генерации
    const cardDesignBtn = page.locator('button:has-text("Оформить карточку"), button:has-text("Создать карточку")').first();
    if (await cardDesignBtn.isVisible()) {
      console.log('Clicking "Оформить карточку" on generated image...');
      await cardDesignBtn.click();
      await page.waitForTimeout(1000);
      
      // Ищем кнопку запуска генерации карточки в открывшемся оверлее / форме
      const submitCardBtn = page.locator('.card-generator-panel button:has-text("Сгенерировать"), button:has-text("Сгенерировать карточку")').first();
      if (await submitCardBtn.isVisible()) {
        await submitCardBtn.click();
        console.log('Waiting for Card Designer to complete...');
        await page.waitForSelector('.status-banner.success', { timeout: 70000 });
        console.log('Card Designer completed!');
        await page.screenshot({ path: 'test-results/real-tests/07_card_designer_result.png', fullPage: true });
      } else {
        console.log('Submit button in card generator not found.');
      }
    } else {
      console.log('Card design trigger button not found under results.');
    }
    
    console.log('\n✅ All tests finished successfully!');
    // Оставляем браузер открытым, чтобы пользователь видел результат
  } catch (error) {
    console.error('E2E run failed:', error);
  }
}

run();
