import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import pg from 'pg';

dotenv.config();
const u = new URL(process.env.DATABASE_URL);
u.hostname = '127.0.0.1';
u.port = '15432';
const c = new pg.Client({ connectionString: u.toString() });
await c.connect();
const r = await c.query(
  'SELECT id, telegram_id, email FROM users WHERE telegram_id = $1',
  ['99001001']
);
console.log(r.rows[0]);
const row = r.rows[0];
if (!row) {
  console.error('user not found');
  process.exit(1);
}
const token = jwt.sign(
  { uid: 'tg_99001001', telegramId: '99001001', dbUserId: row.id },
  process.env.JWT_SECRET || 'vton-secret-2026',
  { expiresIn: '30d' }
);
const session = JSON.parse(fs.readFileSync('audit-shots/session.json', 'utf8'));
session.token = token;
session.user.dbUserId = row.id;
session.dbUserId = row.id;
fs.writeFileSync('audit-shots/session.json', JSON.stringify(session, null, 2));
await c.end();
console.log('session updated dbUserId', row.id);
