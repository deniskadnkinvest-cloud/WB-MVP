import dotenv from 'dotenv';
dotenv.config({ path: '.env.vercel.prod' });

console.log('FIREBASE_SERVICE_ACCOUNT exists:', !!process.env.FIREBASE_SERVICE_ACCOUNT);
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.log('Length:', process.env.FIREBASE_SERVICE_ACCOUNT.length);
}
console.log('All FIREBASE keys:', Object.keys(process.env).filter(k => k.includes('FIREBASE')));
