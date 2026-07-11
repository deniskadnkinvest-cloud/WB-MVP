/**
 * Local audit auth harness — creates/grants audit user and prints JWT session.
 * Usage: node scripts/audit-auth.mjs
 * Requires server on :3001 with ADMIN_ACCESS_KEY set.
 */
import 'dotenv/config';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: '.env.local', override: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const API = process.env.AUDIT_API || 'http://127.0.0.1:3001';
const ADMIN_KEY = process.env.ADMIN_ACCESS_KEY || 'admin-seller-studio-2026';
const JWT_SECRET = process.env.JWT_SECRET || 'vton-secret-2026';
const TELEGRAM_ID = process.env.AUDIT_TG_ID || '99001001';
const STABLE_UID = `tg_${TELEGRAM_ID}`;

async function admin(body) {
  const res = await fetch(`${API}/api/admin/user-control`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Key': ADMIN_KEY,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    throw new Error(`admin ${body.action}: ${res.status} ${JSON.stringify(json)}`);
  }
  return json;
}

async function main() {
  // Ensure user + plan
  const granted = await admin({
    action: 'set-plan',
    identifier: TELEGRAM_ID,
    plan: 'base',
    note: 'UX audit harness grant',
  });

  const dbUserId =
    granted.user?.profile?.id ||
    granted.user?.id ||
    granted.user?.profile?.dbUserId ||
    null;

  // Lookup for full profile
  const lookup = await admin({ action: 'lookup', identifier: TELEGRAM_ID });
  const profile = lookup.user?.profile || lookup.user || {};
  const sub = lookup.user?.subscription || {};
  const resolvedDbId = profile.id || dbUserId;

  const token = jwt.sign(
    {
      uid: STABLE_UID,
      telegramId: TELEGRAM_ID,
      dbUserId: resolvedDbId,
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );

  const user = {
    uid: STABLE_UID,
    telegramId: TELEGRAM_ID,
    id: TELEGRAM_ID,
    email: profile.email || `tg_${TELEGRAM_ID}@telegram.user`,
    displayName: 'UX Audit User',
    firstName: 'UX',
    lastName: 'Audit',
    photoURL: null,
    role: 'user',
  };

  const session = {
    token,
    user,
    subscription: sub,
    api: API,
    adminKeySet: Boolean(ADMIN_KEY),
    createdAt: new Date().toISOString(),
  };

  const outPath = path.join(ROOT, 'audit-shots', 'session.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(session, null, 2));
  console.log(JSON.stringify({
    ok: true,
    outPath,
    uid: STABLE_UID,
    dbUserId: resolvedDbId,
    plan: sub.plan,
    credits: sub.credits,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
