const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://vton_user:VtonStrongPass2026!@10.8.0.1:5432/vton_mvp',
  connectionTimeoutMillis: 10000,
  query_timeout: 10000,
  statement_timeout: 10000
});

async function run() {
  try {
    console.log('Connecting to PostgreSQL at 10.8.0.1...');
    await client.connect();
    console.log('Connected! Executing SELECT 1...');
    const res = await client.query('SELECT 1 as num');
    console.log('Result:', res.rows);
  } catch (err) {
    console.error('Error details:');
    console.error('  Message:', err.message);
    console.error('  Code:', err.code);
  } finally {
    await client.end().catch(()=>{});
  }
}

run();
