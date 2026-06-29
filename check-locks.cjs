const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://vton_user:VtonStrongPass2026!@10.8.0.1:5432/vton_mvp',
  connectionTimeoutMillis: 10000
});

async function run() {
  try {
    await client.connect();
    
    // Смотрим активные и подвисшие запросы
    const res = await client.query(`
      SELECT pid, usename, state, wait_event_type, wait_event, query, state_change, backend_start 
      FROM pg_stat_activity 
      WHERE datname = 'vton_mvp' AND pid <> pg_backend_pid();
    `);
    
    console.log('Active queries in PostgreSQL:');
    console.table(res.rows);
    
    // Проверяем блокировки
    const locks = await client.query(`
      SELECT blocked_locks.pid     AS blocked_pid,
             blocked_activity.usename  AS blocked_user,
             blocking_locks.pid     AS blocking_pid,
             blocking_activity.usename AS blocking_user,
             blocked_activity.query    AS blocked_statement,
             blocking_activity.query   AS current_statement_in_blocking_process
       FROM  pg_catalog.pg_locks         blocked_locks
        JOIN pg_catalog.pg_stat_activity blocked_activity  ON blocked_activity.pid = blocked_locks.pid
        JOIN pg_catalog.pg_locks         blocking_locks 
            ON blocking_locks.locktype = blocked_locks.locktype
            AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
            AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
            AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
            AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
            AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
            AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
            AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
            AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
            AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
            AND blocking_locks.pid != blocked_locks.pid
        JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
       WHERE NOT blocked_locks.granted;
    `);
    
    if (locks.rows.length > 0) {
      console.log('\nDEADLOCKS / BLOCKING TRANSACTIONS DETECTED:');
      console.table(locks.rows);
    } else {
      console.log('\nNo blocking transactions found.');
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

run();
