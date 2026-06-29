const pg = require('pg');
const p = new pg.Pool({
  connectionString: 'postgresql://vton_user:VtonStrongPass2026!@10.8.0.1:5432/vton_mvp',
  ssl: false,
  connectionTimeoutMillis: 5000
});
const t = Date.now();
p.query('SELECT 1')
  .then(() => { console.log('OK in', Date.now() - t, 'ms'); process.exit(0); })
  .catch(e => { console.log('FAIL in', Date.now() - t, 'ms:', e.message); process.exit(1); });
