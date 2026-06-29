import { query } from './api/_db.js';

async function check() {
  const result = await query(`SELECT * FROM models ORDER BY created_at DESC LIMIT 5`);
  console.log(JSON.stringify(result.rows, null, 2));
  process.exit(0);
}
check();
