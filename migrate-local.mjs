import pg from 'pg';
const { Client } = pg;

const client = new Client({
  host: '186.246.29.31',
  port: 5432,
  user: 'vton_user',
  password: 'VtonStrongPass2026!',
  database: 'vton_mvp',
  ssl: false,
  connectionTimeoutMillis: 15000,
});

const USERS = [
  { tg: '130388073',  email: 'tg_130388073@telegram.user',  plan: 'base',  credits: 1200, creditsTotal: 1200, status: 'active',   admin: true  },
  { tg: '1878016295', email: 'tg_1878016295@telegram.user', plan: 'base',  credits: 100,  creditsTotal: 100,  status: 'active',   admin: false },
  { tg: '640128457',  email: 'tg_640128457@telegram.user',  plan: 'pro',   credits: 960,  creditsTotal: 1000, status: 'active',   admin: false },
  { tg: '8505788696', email: 'tg_8505788696@telegram.user', plan: 'base',  credits: 525,  creditsTotal: 525,  status: 'active',   admin: true  },
  { tg: 'mery20333',  email: 'tg_mery20333@telegram.user',  plan: 'trial', credits: 75,   creditsTotal: 75,   status: 'active',   admin: true  },
  { tg: 'Meet20333',  email: 'tg_Meet20333@telegram.user',  plan: 'trial', credits: 100,  creditsTotal: 100,  status: 'active',   admin: true  },
  { tg: '@mery20333', email: 'tg_mery20333_2@telegram.user',plan: 'pro',   credits: 2000, creditsTotal: 2000, status: 'active',   admin: true  },
  { tg: 'LOciv6iqH0SbI5TZcWuX5ELS7992', email: 'tg_LOciv6@telegram.user', plan: 'base', credits: 86, creditsTotal: 100, status: 'inactive', admin: false },
  { tg: 'tCK8H3fRmXbkPkuZEpkBRJzlzVV2', email: 'tg_tCK8H3@telegram.user', plan: 'base', credits: 95, creditsTotal: 100, status: 'inactive', admin: false },
];

async function run() {
  console.log('Подключаюсь к PostgreSQL...');
  try {
    await client.connect();
    console.log('✅ Подключён!\n');
  } catch (err) {
    console.error('❌ Ошибка подключения:', err.message);
    process.exit(1);
  }

  let ok = 0, fail = 0;

  for (const u of USERS) {
    try {
      const { rows } = await client.query(
        `INSERT INTO users (telegram_id, email, role) VALUES ($1, $2, 'user')
         ON CONFLICT (telegram_id) DO UPDATE SET email = COALESCE(NULLIF($2,''), users.email)
         RETURNING id`,
        [u.tg, u.email]
      );
      const uid = rows[0].id;
      await client.query(
        `INSERT INTO subscriptions (user_id, plan_name, credits, credits_total, status, granted_by_admin)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (user_id) DO UPDATE SET
           plan_name=EXCLUDED.plan_name, credits=EXCLUDED.credits,
           credits_total=EXCLUDED.credits_total, status=EXCLUDED.status,
           granted_by_admin=EXCLUDED.granted_by_admin`,
        [uid, u.plan, u.credits, u.creditsTotal, u.status, u.admin]
      );
      console.log(`✅ tg=${u.tg} → plan=${u.plan} credits=${u.credits} (id=${uid})`);
      ok++;
    } catch (err) {
      console.error(`❌ tg=${u.tg}: ${err.message}`);
      fail++;
    }
  }

  console.log(`\n🎉 Итог: ${ok} восстановлено, ${fail} ошибок`);
  await client.end();
}

run();
