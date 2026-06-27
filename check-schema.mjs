import { query } from './api/_db.js';

async function checkSchema() {
  try {
    const res = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    console.log('Tables in DB:');
    res.rows.forEach(r => console.log(' - ' + r.table_name));

    // Also check generations columns if it exists
    const genCols = await query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'generations';
    `);
    if (genCols.rows.length > 0) {
      console.log('\nColumns in generations:');
      genCols.rows.forEach(r => console.log(` - ${r.column_name} (${r.data_type})`));
    }
  } catch (err) {
    console.error('Error checking schema:', err.message);
  } finally {
    process.exit(0);
  }
}

checkSchema();
