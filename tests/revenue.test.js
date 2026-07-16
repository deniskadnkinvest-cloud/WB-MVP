import test from 'node:test';
import assert from 'node:assert';
import jwt from 'jsonwebtoken';
import { pool } from '../api/_db.js';
import createPaymentHandler from '../api/create-payment.js';
import webhookHandler from '../api/payment-webhook-yookassa.js';
import cancelSubscriptionHandler from '../api/cancel-subscription.js';

// Mock environment variables for testing
process.env.YOOKASSA_SHOP_ID = '1373290';
process.env.YOOKASSA_SECRET_KEY = 'test_secret_key_mock';
process.env.JWT_SECRET ||= 'test-only-jwt-secret-at-least-32-characters';
const JWT_SECRET = process.env.JWT_SECRET;

// -------------------------------------------------------------
// 1. MOCKING DB POOL & CLIENT
// -------------------------------------------------------------
let dbQueries = [];
let dbClientQueries = [];
let mockUserRows = [{ id: 42 }];
let mockExistingPayments = [];
let mockSubscriptions = [];
let activeQueryMock = null;

const mockClient = {
  query: async (text, params) => {
    dbClientQueries.push({ text, params });
    if (activeQueryMock) {
      return activeQueryMock(text, params);
    }
    if (text.includes('INSERT INTO users')) {
      return { rows: mockUserRows };
    }
    if (text.includes('SELECT id FROM payments WHERE yookassa_payment_id')) {
      return { rows: mockExistingPayments };
    }
    if (text.includes('SELECT id FROM subscriptions WHERE user_id')) {
      return { rows: mockSubscriptions };
    }
    return { rows: [] };
  },
  release: () => {},
};

// Override pool methods to avoid real network/db connection
pool.connect = async () => mockClient;
pool.query = async (text, params) => {
  dbQueries.push({ text, params });
  if (activeQueryMock) {
    return activeQueryMock(text, params);
  }
  return mockClient.query(text, params);
};

// Mock global fetch to intercept YooKassa payments and Telegram alerts creation API calls
let lastFetchCall = null;
const originalFetch = global.fetch;

global.fetch = async (url, options) => {
  const urlStr = String(url);
  if (urlStr.includes('api.yookassa.ru')) {
    lastFetchCall = { url: urlStr, options, body: JSON.parse(options.body || '{}') };
    return {
      status: 200,
      json: async () => ({
        id: 'pay_mock12345',
        status: 'pending',
        confirmation: {
          confirmation_url: 'https://confirmation-link.yookassa.ru/xyz',
        },
      }),
    };
  }
  if (urlStr.includes('api.telegram.org')) {
    return {
      status: 200,
      json: async () => ({ ok: true }),
    };
  }
  return originalFetch(url, options);
};

// -------------------------------------------------------------
// 2. HELPER TO CREATE RES/REQ OBJECTS
// -------------------------------------------------------------
function createMockReqRes({ method = 'POST', headers = {}, body = {} } = {}) {
  const req = {
    method,
    headers,
    body,
  };
  
  const res = {
    headers: {},
    statusCode: 200,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.jsonData = data;
      return this;
    },
    end() {
      return this;
    },
  };
  
  return { req, res };
}

// -------------------------------------------------------------
// 3. TESTS FOR /api/create-payment
// -------------------------------------------------------------
test('create-payment: should require authentication token', async () => {
  const { req, res } = createMockReqRes({
    body: { planId: 'topup_10', uid: 'tg_12345' },
  });
  
  await createPaymentHandler(req, res);
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.jsonData.ok, false);
  assert.match(res.jsonData.error, /token is required/);
});

test('create-payment: should require planId and uid', async () => {
  const token = jwt.sign({ uid: 'tg_12345' }, JWT_SECRET);
  const { req, res } = createMockReqRes({
    headers: { authorization: `Bearer ${token}` },
    body: { planId: '', uid: '' },
  });
  
  await createPaymentHandler(req, res);
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.jsonData.ok, false);
});

test('create-payment: should set save_payment_method = false for topup_10 (one-time)', async () => {
  const token = jwt.sign({ uid: 'tg_12345' }, JWT_SECRET);
  const { req, res } = createMockReqRes({
    headers: { authorization: `Bearer ${token}` },
    body: { planId: 'topup_10', uid: 'tg_12345' },
  });

  lastFetchCall = null;
  await createPaymentHandler(req, res);
  
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.jsonData.ok, true);
  assert.ok(lastFetchCall);
  assert.strictEqual(lastFetchCall.body.save_payment_method, false);
});

test('create-payment: should set save_payment_method = false for trial (one-time)', async () => {
  const token = jwt.sign({ uid: 'tg_12345' }, JWT_SECRET);
  const { req, res } = createMockReqRes({
    headers: { authorization: `Bearer ${token}` },
    body: { planId: 'trial', uid: 'tg_12345' },
  });

  lastFetchCall = null;
  await createPaymentHandler(req, res);
  
  assert.strictEqual(res.statusCode, 200);
  assert.ok(lastFetchCall);
  assert.strictEqual(lastFetchCall.body.save_payment_method, false);
});

test('create-payment: should set save_payment_method = true for monthly subscriptions (base)', async () => {
  const token = jwt.sign({ uid: 'tg_12345' }, JWT_SECRET);
  const { req, res } = createMockReqRes({
    headers: { authorization: `Bearer ${token}` },
    body: { planId: 'base', uid: 'tg_12345' },
  });

  lastFetchCall = null;
  await createPaymentHandler(req, res);
  
  assert.strictEqual(res.statusCode, 200);
  assert.ok(lastFetchCall);
  assert.strictEqual(lastFetchCall.body.save_payment_method, true);
});

test('create-payment: should set save_payment_method = true for monthly subscriptions (pro)', async () => {
  const token = jwt.sign({ uid: 'tg_12345' }, JWT_SECRET);
  const { req, res } = createMockReqRes({
    headers: { authorization: `Bearer ${token}` },
    body: { planId: 'pro', uid: 'tg_12345' },
  });

  lastFetchCall = null;
  await createPaymentHandler(req, res);
  
  assert.strictEqual(res.statusCode, 200);
  assert.ok(lastFetchCall);
  assert.strictEqual(lastFetchCall.body.save_payment_method, true);
});

// -------------------------------------------------------------
// 4. TESTS FOR /api/payment-webhook-yookassa
// -------------------------------------------------------------
test('webhook: should reject non-whitelisted IP addresses', async () => {
  const { req, res } = createMockReqRes({
    headers: { 'x-forwarded-for': '8.8.8.8' },
    body: { event: 'ping' },
  });

  await webhookHandler(req, res);
  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(res.jsonData.ok, false);
});

test('webhook: should accept webhook ping request from whitelisted IP', async () => {
  const { req, res } = createMockReqRes({
    headers: { 'x-forwarded-for': '185.71.76.5' },
    body: { event: 'ping' },
  });

  await webhookHandler(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.jsonData.ok, true);
});

test('webhook: should process succeeded payment for topup_10 (increments credits)', async () => {
  const { req, res } = createMockReqRes({
    headers: { 'x-forwarded-for': '185.71.77.20' },
    body: {
      event: 'payment.succeeded',
      object: {
        id: 'pay_99999',
        status: 'succeeded',
        amount: { value: '390.00', currency: 'RUB' },
        metadata: { uid: 'tg_12345', planId: 'topup_10' },
      },
    },
  });

  // Reset database mock states
  dbClientQueries = [];
  mockExistingPayments = [];
  mockSubscriptions = [{ id: 8 }]; // User already has a subscription row

  await webhookHandler(req, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.jsonData.ok, true);

  // Assert transaction queries were executed
  const beginQuery = dbClientQueries.find(q => q.text === 'BEGIN');
  const commitQuery = dbClientQueries.find(q => q.text === 'COMMIT');
  assert.ok(beginQuery);
  assert.ok(commitQuery);

  // Assert credits were incremented in update query
  const updateSubQuery = dbClientQueries.find(q => q.text.includes('UPDATE subscriptions'));
  assert.ok(updateSubQuery);
  assert.strictEqual(updateSubQuery.params[0], 10); // +10 credits

  // Assert payment record was inserted
  const insertPaymentQuery = dbClientQueries.find(q => q.text.includes('INSERT INTO payments'));
  assert.ok(insertPaymentQuery);
  assert.strictEqual(insertPaymentQuery.params[1], 'topup_10'); // planId
  assert.strictEqual(insertPaymentQuery.params[2], 'pay_99999'); // yookassa_payment_id
  assert.strictEqual(insertPaymentQuery.params[3], 390.00); // amount
});

test('webhook: should process succeeded payment for base subscription (updates plan details)', async () => {
  const { req, res } = createMockReqRes({
    headers: { 'x-forwarded-for': '77.75.153.4' },
    body: {
      event: 'payment.succeeded',
      object: {
        id: 'pay_88888',
        status: 'succeeded',
        amount: { value: '5000.00', currency: 'RUB' },
        metadata: { uid: 'tg_12345', planId: 'base' },
        payment_method: { saved: true, id: 'pm_card_999' },
      },
    },
  });

  // Reset database mock states
  dbClientQueries = [];
  mockExistingPayments = [];

  await webhookHandler(req, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.jsonData.ok, true);

  // Assert subscription was inserted with ON CONFLICT DO UPDATE
  const insertSubQuery = dbClientQueries.find(q => q.text.includes('INSERT INTO subscriptions') && q.text.includes('ON CONFLICT'));
  assert.ok(insertSubQuery);
  assert.strictEqual(insertSubQuery.params[1], 'base'); // planId
  assert.strictEqual(insertSubQuery.params[2], 100); // credits
  assert.strictEqual(insertSubQuery.params[3], 100); // credits_total
  assert.ok(insertSubQuery.params[4] instanceof Date); // expires_at
  assert.strictEqual(insertSubQuery.params[5], true); // auto_renew
  assert.strictEqual(insertSubQuery.params[6], 'pm_card_999'); // payment_method_id
});

// -------------------------------------------------------------
// 5. TESTS FOR /api/cancel-subscription
// -------------------------------------------------------------
test('cancel-subscription: should successfully disable auto_renew and clear payment method ID for valid tg_uid', async () => {
  const token = jwt.sign({ uid: 'tg_12345' }, JWT_SECRET);
  const { req, res } = createMockReqRes({
    headers: { authorization: `Bearer ${token}` },
    body: { uid: 'tg_12345' },
  });

  // Mock database response for users table: resolved ID should be 12345
  dbQueries = [];
  activeQueryMock = (text, params) => {
    if (text.includes('SELECT id FROM users WHERE telegram_id')) {
      // Check that the query strips the 'tg_' prefix!
      assert.strictEqual(params[0], '12345');
      return { rows: [{ id: 42 }] };
    }
    if (text.includes('UPDATE subscriptions')) {
      assert.strictEqual(params[0], 42); // userId
      return { rows: [{ id: 100 }] };
    }
    return { rows: [] };
  };

  await cancelSubscriptionHandler(req, res);

  activeQueryMock = null;

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.jsonData.ok, true);
});
