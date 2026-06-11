const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

// Load .env.local
const envLocalPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envLocalPath)) {
  const envConfig = require("dotenv").parse(fs.readFileSync(envLocalPath));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

// Initialize Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

async function changeSubscription(email, plan, autoRenew) {
  try {
    console.log(`Поиск пользователя с email: ${email}...`);
    // 1. Найти пользователя по email
    const userRecord = await admin.auth().getUserByEmail(email);
    console.log(`Пользователь найден! UID: ${userRecord.uid}`);

    // 2. Обновить документ в Firestore
    const subRef = db.collection("users").doc(userRecord.uid).collection("subscription").doc("current");
    
    // Получаем текущие данные, чтобы не затереть credits, если они есть и мы их не передаем
    const subSnap = await subRef.get();
    let currentData = subSnap.exists ? subSnap.data() : {};

    const updateData = {
      plan: plan,
      autoRenew: autoRenew === 'true',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    if (plan === 'base') {
      updateData.credits = 100;
    } else if (plan === 'none') {
      updateData.credits = 0;
    }

    await subRef.set(updateData, { merge: true });
    console.log(`✅ Подписка успешно обновлена! Новый план: ${plan}, Автопродление: ${updateData.autoRenew}`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Ошибка:", error.message);
    process.exit(1);
  }
}

// Получаем аргументы из командной строки
const args = process.argv.slice(2);
if (args.length < 3) {
  console.log("Использование: node admin-change-subscription.cjs <email> <plan> <autoRenew>");
  console.log("Пример: node admin-change-subscription.cjs deniskadnkinvest@gmail.com base true");
  process.exit(1);
}

changeSubscription(args[0], args[1], args[2]);
