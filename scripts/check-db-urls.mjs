import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  // 1. Список таблиц
  const tables = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
  console.log('=== TABLES ===');
  console.log(tables.rows.map(x => x.tablename).join(', '));

  // 2. Проверяем users_models (если есть)
  for (const tbl of tables.rows) {
    const name = tbl.tablename;
    if (name.includes('model') || name.includes('user') || name.includes('generation') || name.includes('history')) {
      const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='${name}' ORDER BY ordinal_position`);
      console.log(`\n--- ${name} columns: ${cols.rows.map(c => c.column_name).join(', ')}`);
      
      // Ищем колонки с URL
      const urlCols = cols.rows.filter(c => 
        c.column_name.includes('url') || c.column_name.includes('image') || 
        c.column_name.includes('photo') || c.column_name.includes('avatar') ||
        c.column_name.includes('data') || c.column_name.includes('result')
      );
      
      if (urlCols.length > 0) {
        const sample = await pool.query(`SELECT * FROM ${name} LIMIT 2`);
        for (const row of sample.rows) {
          for (const col of urlCols) {
            const val = row[col.column_name];
            if (val && typeof val === 'string' && val.length > 20) {
              console.log(`  ${col.column_name}: ${val.substring(0, 120)}...`);
            } else if (val && typeof val === 'object') {
              const str = JSON.stringify(val);
              console.log(`  ${col.column_name} (JSON): ${str.substring(0, 200)}...`);
            }
          }
        }
      }
    }
  }

  // 3. Ищем любые старые MinIO URL во всех текстовых колонках
  console.log('\n=== SEARCHING FOR OLD MINIO URLS ===');
  for (const tbl of tables.rows) {
    const name = tbl.tablename;
    const cols = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='${name}' AND (data_type='text' OR data_type='character varying' OR data_type='jsonb' OR data_type='json')`);
    for (const col of cols.rows) {
      try {
        let query;
        if (col.data_type === 'jsonb' || col.data_type === 'json') {
          query = `SELECT count(*) as cnt FROM ${name} WHERE ${col.column_name}::text LIKE '%localhost:9000%' OR ${col.column_name}::text LIKE '%minio%'`;
        } else {
          query = `SELECT count(*) as cnt FROM ${name} WHERE ${col.column_name} LIKE '%localhost:9000%' OR ${col.column_name} LIKE '%minio%'`;
        }
        const r = await pool.query(query);
        if (parseInt(r.rows[0].cnt) > 0) {
          console.log(`  ⚠️ ${name}.${col.column_name}: ${r.rows[0].cnt} rows with old MinIO URLs!`);
        }
      } catch (e) {
        // skip errors
      }
    }
  }
  console.log('=== CHECK COMPLETE ===');

  await pool.end();
}

check().catch(e => { console.error(e.message); process.exit(1); });
