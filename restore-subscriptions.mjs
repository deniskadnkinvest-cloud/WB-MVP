// Скрипт восстановления тарифов через рабочий API /api/subscription
// Запуск: node restore-subscriptions.mjs
// Генерирует JWT и вызывает POST /api/subscription для каждого юзера из списка

import jwt from 'jsonwebtoken';

const JWT_SECRET = 'vton-jwt-secret-rf-2026-very-secure-key';
const BASE_URL = 'https://seller-studio-ai.ru';

// Список юзеров из Firestore dry-run (tg = telegram_id, plan, credits)
// Берём только тех у кого АКТИВНЫЙ план и реальный telegram_id (числовой или известный)
const USERS_TO_RESTORE = [
  { tg: '130388073',  plan: 'base',  credits: 94  },   // Владелец (Denis)
  { tg: '1878016295', plan: 'base',  credits: 100 },   // OArHnvDcvTW6pvDUKlBPSCjkM2s2
  { tg: '640128457',  plan: 'pro',   credits: 960 },   // UsQe5TmgfVP1XWhGbKNbVPORNqJ3
  { tg: '8505788696', plan: 'base',  credits: 525 },   // a9pKVA33yUdzKMpadyXpQOBWlT63
  { tg: 'mery20333',  plan: 'trial', credits: 75  },   // mery20333
  { tg: 'Meet20333',  plan: 'trial', credits: 100 },   // Meet20333
  { tg: '@mery20333', plan: 'pro',   credits: 2000 },  // @mery20333
];

// Кредиты по плану (для POST запроса нужен только planId)
const PLAN_CREDITS = { trial: 25, base: 100, pro: 1000 };

async function restoreUser(user) {
  const { tg, plan, credits } = user;

  // Формируем JWT от имени этого юзера
  const token = jwt.sign(
    { uid: tg, telegram_id: tg },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  try {
    // Сначала GET — смотрим текущее состояние
    const getResp = await fetch(`${BASE_URL}/api/subscription`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const current = await getResp.json();
    console.log(`\n👤 tg=${tg} | текущий план: ${current.data?.plan || 'нет'} | кредиты: ${current.data?.credits || 0}`);

    // POST — устанавливаем план
    const postResp = await fetch(`${BASE_URL}/api/subscription`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ planId: plan })
    });
    const result = await postResp.json();

    if (result.ok) {
      // Если нужно скорректировать кредиты (отличаются от стандарта плана)
      const standardCredits = PLAN_CREDITS[plan];
      if (credits !== standardCredits && credits > 0) {
        console.log(`  ⚠️  Кредиты в Firestore: ${credits}, стандарт плана: ${standardCredits}`);
        console.log(`  ℹ️  Установлен стандарт: ${standardCredits}`);
      }
      console.log(`  ✅ План "${plan}" восстановлен (кредиты: ${result.data?.credits})`);
    } else {
      console.log(`  ❌ Ошибка: ${result.error}`);
    }
  } catch (err) {
    console.log(`  ❌ Сетевая ошибка: ${err.message}`);
  }
}

async function main() {
  console.log('🚀 Восстановление тарифов через /api/subscription');
  console.log(`📋 Юзеров для восстановления: ${USERS_TO_RESTORE.length}\n`);

  for (const user of USERS_TO_RESTORE) {
    await restoreUser(user);
    // Небольшая пауза между запросами
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n✅ Готово! Все тарифы восстановлены.');
}

main().catch(console.error);
