/**
 * Start Express with Postgres via SSH tunnel (127.0.0.1:15432).
 * Run tunnel first: ssh -L 15432:10.8.0.1:5432 ...
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

const raw = process.env.DATABASE_URL;
if (!raw) {
  console.error('DATABASE_URL missing');
  process.exit(1);
}
const u = new URL(raw);
u.hostname = process.env.AUDIT_DB_HOST || '127.0.0.1';
u.port = process.env.AUDIT_DB_PORT || '15432';
process.env.DATABASE_URL = u.toString();
process.env.ADMIN_ACCESS_KEY =
  process.env.ADMIN_ACCESS_KEY || 'admin-seller-studio-2026';
process.env.PORT = process.env.PORT || '3001';

console.log(
  `[start-local-api] DB → ${u.hostname}:${u.port}  ADMIN_KEY set=${Boolean(process.env.ADMIN_ACCESS_KEY)}`
);

await import('../server.js');
