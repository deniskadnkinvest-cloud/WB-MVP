import dotenv from 'dotenv';
dotenv.config({ path: '.env.vercel.prod' });

import admin from 'firebase-admin';
import { ensureFirebaseAdmin } from '../api/_firebase-admin.js';

ensureFirebaseAdmin();
const db = admin.firestore();

async function run() {
  const targetId = '8505788696';
  console.log(`Searching for Telegram ID: ${targetId}`);
  
  // Try directly as Document ID
  let userRef = db.collection('users').doc(targetId);
  let userSnap = await userRef.get();
  let foundUid = null;
  let userData = null;

  if (userSnap.exists) {
    foundUid = targetId;
    userData = userSnap.data();
    console.log(`✅ Found user document by doc ID: ${targetId}`, userData);
  } else {
    // Try searching by telegramId field (both as number and string)
    const queries = [
      db.collection('users').where('telegramId', '==', parseInt(targetId)),
      db.collection('users').where('telegramId', '==', targetId),
      db.collection('users').where('id', '==', parseInt(targetId)),
      db.collection('users').where('id', '==', targetId)
    ];

    for (const q of queries) {
      const snap = await q.get();
      if (!snap.empty) {
        const doc = snap.docs[0];
        foundUid = doc.id;
        userData = doc.data();
        console.log(`✅ Found user by field query: ${foundUid}`, userData);
        break;
      }
    }
  }

  if (!foundUid) {
    console.log('❌ User not found in users collection by Telegram ID ' + targetId);
    
    // Let's also check if there's any document in users to see what IDs exist
    console.log('\nLast 5 users in DB:');
    const lastUsers = await db.collection('users').limit(5).get();
    lastUsers.forEach(d => {
      console.log(`- ID: ${d.id}, data:`, d.data());
    });
  } else {
    // Fetch current subscription
    const subRef = db.doc(`users/${foundUid}/subscription/current`);
    const subSnap = await subRef.get();
    if (subSnap.exists) {
      console.log(`Current subscription for ${foundUid}:`, subSnap.data());
    } else {
      console.log(`No current subscription document for ${foundUid} yet.`);
    }
  }
}

run().catch(console.error);
