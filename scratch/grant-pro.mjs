import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import admin from 'firebase-admin';
import { ensureFirebaseAdmin } from '../api/_firebase-admin.js';

ensureFirebaseAdmin();
const db = admin.firestore();

async function setProPlan() {
  const email = 'deniskadnkinvest@gmail.com';
  
  try {
    const userRecord = await admin.auth().getUserByEmail(email);
    console.log(`✅ Пользователь найден в Auth: ${userRecord.uid}`);
    
    const userRef = db.collection('users').doc(userRecord.uid).collection('subscription').doc('current');
    await userRef.set({
      plan: 'pro',
      credits: 9999,
      creditsTotal: 9999,
      status: 'active',
      planActivatedAt: admin.firestore.FieldValue.serverTimestamp(),
      grantedByAdmin: true
    }, { merge: true });
    
    console.log(`✅ Пользователю ${email} выдан PRO тариф (9999 кредитов)!`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка:', error);
    process.exit(1);
  }
}

setProPlan();
