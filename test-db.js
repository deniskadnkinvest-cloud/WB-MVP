import pg from 'pg';
const { Client } = pg;

async function testConn(name, sslConfig) {
  console.log(`\n--- Тестирую: ${name} ---`);
  const client = new Client({
    host: '186.246.29.31',
    port: 5432,
    user: 'vton_user',
    password: 'VtonStrongPass2026!',
    database: 'vton_mvp',
    ssl: sslConfig,
    connectionTimeoutMillis: 20000, // 20 секунд
  });

  const start = Date.now();
  try {
    console.log('Подключаюсь...');
    await client.connect();
    console.log(`✅ Успешно подключено за ${Date.now() - start}мс!`);
    const { rows } = await client.query('SELECT NOW()');
    console.log('Результат запроса NOW():', rows[0]);
    await client.end();
  } catch (err) {
    console.log(`❌ Ошибка (${Date.now() - start}мс):`, err.message);
  }
}

async function main() {
  await testConn('Без SSL', false);
  await testConn('SSL с отключенной валидацией', { rejectUnauthorized: false });
  await testConn('SSL обязательный', true);
}

main().catch(console.error);
