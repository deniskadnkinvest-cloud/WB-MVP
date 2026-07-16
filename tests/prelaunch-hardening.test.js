import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

function walkCode(relativeDir) {
  const absoluteDir = path.join(root, relativeDir);
  return fs.readdirSync(absoluteDir, { withFileTypes: true }).flatMap(entry => {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) return walkCode(relativePath);
    return /\.(?:js|jsx)$/u.test(entry.name) ? [relativePath] : [];
  });
}

test('subscription mutation and legacy credit routes are not exposed', async () => {
  const server = read('server.js');
  assert.doesNotMatch(server, /app\.post\(['"]\/api\/subscription/u);
  assert.doesNotMatch(server, /\/api\/consume-credit/u);
  assert.equal(fs.existsSync(path.join(root, 'api', 'consume-credit.js')), false);

  process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test';
  process.env.JWT_SECRET ||= 'test-only-jwt-secret-at-least-32-characters';
  const { default: subscriptionHandler } = await import('../api/subscription.js');
  let statusCode = 200;
  let responseBody = null;
  const response = {
    setHeader() {},
    status(code) { statusCode = code; return this; },
    json(body) { responseBody = body; return body; },
    end() {},
  };
  await subscriptionHandler({ method: 'POST', headers: {}, body: { planId: 'pro' } }, response);
  assert.equal(statusCode, 405);
  assert.equal(responseBody?.ok, false);
});

test('production code contains no embedded secrets or unsafe secret fallbacks', () => {
  const files = [...walkCode('api'), ...walkCode('src'), 'server.js'];
  const forbidden = [
    /vton-secret-2026/u,
    /VtonStrongPass/u,
    /postgresql:\/\//u,
    /process\.env\.JWT_SECRET\s*\|\|/u,
    /YOOKASSA_SHOP_ID\s*\|\|/u,
  ];
  for (const relativePath of files) {
    const source = read(relativePath);
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${relativePath} matched ${pattern}`);
    }
  }
});

test('database retries never classify data-changing CTEs as read-only', () => {
  const dbSource = read('api/_db.js');
  assert.match(dbSource, /\^\\s\*\(SELECT\|SHOW\)\\b/u);
  assert.doesNotMatch(dbSource, /SELECT\|SHOW\|WITH/u);
});

test('generation prompts and user-facing source contain no mojibake', () => {
  const files = [...walkCode('api'), ...walkCode('src')];
  const mojibake = /(?:Р[Ђ-Џ]|С[Ђ-Џ]|в(?:Ђ|„|•|љ|‰)|�|[\u0080-\u009f])/u;
  for (const relativePath of files) {
    assert.doesNotMatch(read(relativePath), mojibake, relativePath);
  }

  const generator = read('api/generate-image.js');
  for (const key of [
    'Брюнетка', 'Блондинка', 'Чёрные', 'Бритая', 'Лёгкая улыбка',
    'Серьёзная', 'Минимализм', 'Рукав', 'Брюнет', 'Блондин', 'Бритый',
  ]) {
    assert.match(generator, new RegExp(`'${key}'`, 'u'));
  }
  assert.doesNotMatch(generator, /const SKIN_(?:REALISM|BEAUTY)_PROMPT\s*=/u);
});

test('billing reservations are persistent and trial allocation is atomic', () => {
  const reservations = read('api/_billing-reservations.js');
  const server = read('server.js');
  assert.match(reservations, /CREATE TABLE IF NOT EXISTS credit_reservations/u);
  assert.match(reservations, /COALESCE\(model_gens_used, 0\) < 1/u);
  assert.match(reservations, /expires_at IS NULL OR expires_at > NOW\(\) OR granted_by_admin IS TRUE/u);
  assert.match(reservations, /INSERT INTO credit_reservations/u);
  assert.match(reservations, /status = 'refunded'/u);
  assert.match(server, /recoverOrphanedCreditReservations/u);
  assert.match(server, /process\.once\('SIGTERM'/u);
});

test('trial reservation and refund execute as transactional database operations', async () => {
  process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:5432/test';
  const { pool } = await import('../api/_db.js');
  const billing = await import('../api/_billing-reservations.js');
  const originalConnect = pool.connect;
  const originalQuery = pool.query;
  const calls = [];
  let phase = 'reserve';

  const client = {
    async query(sql, params) {
      const text = String(sql);
      calls.push({ text, params });
      if (text.includes('UPDATE subscriptions') && text.includes('credits = credits -')) {
        return { rows: [{ credits: 9, plan_name: 'trial' }] };
      }
      if (text.includes('UPDATE subscriptions') && text.includes('model_gens_used') && phase === 'reserve') {
        return { rows: [{ model_gens_used: 1 }] };
      }
      if (text.includes('UPDATE credit_reservations')) {
        return { rows: [{ amount: 1, trial_model_reserved: true }] };
      }
      if (text.includes('UPDATE subscriptions') && text.includes('credits = credits +')) {
        return { rows: [{ credits: 10 }] };
      }
      return { rows: [] };
    },
    release() {},
  };

  pool.query = async sql => {
    calls.push({ text: String(sql), params: [] });
    return { rows: [], rowCount: 0 };
  };
  pool.connect = async () => client;

  try {
    const reservation = await billing.reserveGenerationBalance({
      user: { id: 42 },
      uid: 'tg_42',
      amount: 1,
      requestId: 'test-request',
      usesOwnModel: true,
    });
    assert.equal(reservation.planName, 'trial');
    assert.equal(reservation.trialModelReserved, true);
    assert.ok(calls.some(call => call.text === 'BEGIN'));
    assert.ok(calls.some(call => call.text.includes('INSERT INTO credit_reservations')));
    assert.ok(calls.some(call => call.text === 'COMMIT'));

    phase = 'refund';
    const refund = await billing.refundCreditReservationPersisted(reservation, 'test failure');
    assert.equal(refund.creditsRemaining, 10);
    assert.equal(reservation.refunded, true);
    assert.ok(calls.some(call => call.text.includes("SET status = 'refunded'")));
    assert.ok(calls.some(call => call.text.includes('credits = credits +')));
  } finally {
    pool.connect = originalConnect;
    pool.query = originalQuery;
  }
});

test('persona editing updates the existing model and preserves its description', () => {
  const app = read('src/App.jsx');
  const wizard = read('src/components/PersonaWizard.jsx');
  assert.match(app, /await updateModel\(user\.uid, existingModelId, payload\)/u);
  assert.match(app, /description,\s*\n\s*prompt: description/u);
  assert.match(app, /value\.startsWith\('data:'\)/u);
  assert.match(wizard, /await performSave\(saveName, true, editModel\.id\)/u);
  assert.match(wizard, />3 КРЕДИТА</u);
});

test('composite generation launches independent work in parallel with truthful prices', () => {
  const app = read('src/App.jsx');
  assert.match(app, /const detailRequest = authFetch/u);
  assert.match(app, /const sizeRequest = authFetch/u);
  assert.match(app, /const lifeRequest = authFetch/u);
  assert.match(app, /Promise\.allSettled\(slideRequests\.map/u);
  assert.match(app, /Promise\.allSettled\(\[\s*requestVariant\('A'/u);
  assert.equal((app.match(/triggerConfirm\('gallery', 4,/gu) || []).length, 2);
  assert.equal((app.match(/triggerConfirm\('ab', 4,/gu) || []).length, 2);
  assert.doesNotMatch(app, /\/api\/auto-catalog\/start/u);
});

test('prompt priorities no longer cancel explicit edits', () => {
  const prompts = read('api/_prompts.js');
  assert.match(prompts, /ABSOLUTE_MAXIMUM_FOR_BIOMETRIC_IDENTITY/u);
  assert.match(prompts, /MUST NOT cancel or weaken the requested edit/u);
  assert.doesNotMatch(prompts, /SKIN & FACE REALISM DIRECTIVE \(MANDATORY — HIGHEST PRIORITY\)/u);
  assert.doesNotMatch(prompts, /ИДЕНТИЧНОСТЬ ЖЁСТКО ЗАБЛОКИРОВАНА \(важнее всего, включая сам запрос\)/u);
});
