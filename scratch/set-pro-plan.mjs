import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Инициализация Firebase
const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function setProPlan() {
  const email = 'deniskadnkinvest@gmail.com';
  
  try {
    // 1. Ищем пользователя по email в Authentication
    const userRecord = await admin.auth().getUserByEmail(email);
    console.log(`✅ Пользователь найден в Auth: ${userRecord.uid}`);
    
    // 2. Обновляем документ в коллекции users
    const userRef = db.collection('users').doc(userRecord.uid);
    await userRef.set({
      subscription: {
        plan: 'pro',
        credits: 9999,
        creditsTotal: 9999,
        status: 'active',
        periodEnd: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
      }
    }, { merge: true });
    
    console.log(`✅ Пользователю ${email} выдан PRO тариф (9999 кредитов)!`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка:', error);
    process.exit(1);
  }
}

setProPlan();
