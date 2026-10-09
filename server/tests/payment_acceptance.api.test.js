// Local signed callbacks and disposable MongoDB, not merchant sandbox transactions.
process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1/unused-payment-acceptance';
process.env.JWT_SECRET = 'payment-acceptance-access-only';
process.env.JWT_REFRESH_SECRET = 'payment-acceptance-refresh-only';
process.env.VNP_TMN_CODE = 'TESTONLY';
process.env.VNP_HASH_SECRET = 'payment-acceptance-signing-only';
process.env.SMTP_HOST = '';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const app = require('../src/app');
const env = require('../src/config/env');
const Order = require('../src/models/Order.model');
const User = require('../src/models/User.model');
const AuditLog = require('../src/models/AuditLog.model');
const { calculateVNPaySecureHash, formatVNPayDate } = require('../src/controllers/payment.controller');
let mongo, owner, vendor, other, sequence = 0;
const token = user => jwt.sign({ sub: String(user._id), type: 'access' }, env.JWT_SECRET, { expiresIn: '1h' });
const fixture = overrides => Order.create({
  orderCode: 'ORD-PAYMENT-ACCEPTANCE-' + (++sequence), user: owner._id,
  items: [{ product: new mongoose.Types.ObjectId(), vendor: vendor._id, sku: 'PAYMENT-TEST-SKU',
    name: 'Payment test item', price: 50000, quantity: 2, subtotal: 100000 }],
  shippingAddress: { fullName: 'Test Customer', phone: '0900000000', address: 'Isolated test address' },
  totalAmount: 100000, finalAmount: 100000, paymentMethod: 'VNPAY', ...overrides,
});
const signed = (order, overrides = {}) => {
  const params = { vnp_TmnCode: env.VNP_TMN_CODE, vnp_TxnRef: order.orderCode,
    vnp_Amount: String(Math.round(order.finalAmount * 100)), vnp_ResponseCode: '00',
    vnp_TransactionStatus: '00', vnp_TransactionNo: '123456789', vnp_BankCode: 'TEST', ...overrides };
  return { ...params, vnp_SecureHash: calculateVNPaySecureHash(params, env.VNP_HASH_SECRET) };
};
const callback = (kind, query) => request(app).get('/api/v1/payments/vnpay-' + kind).query(query);
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(mongo.getUri());
  [owner, vendor, other] = await User.create([
    { email: 'owner@payment.example.test', password: 'Acceptance123!' },
    { email: 'vendor@payment.example.test', password: 'Acceptance123!', role: 'vendor' },
    { email: 'other@payment.example.test', password: 'Acceptance123!' },
  ]);
  await Order.init();
}, 120000);
afterAll(async () => { await mongoose.disconnect(); if (mongo) await mongo.stop(); });

test('VNPay timestamps use Vietnam time independently of the host timezone', () => {
  expect(formatVNPayDate(new Date('2026-10-08T17:02:03Z'))).toBe('20261009000203');
});

test('signed browser return cannot mark paid; IPN commits and return subsequently reflects DB status', async () => {
  const order = await fixture();
  const before = await callback('return', signed(order));
  expect(before.status).toBe(200);
  expect(before.body.data).toMatchObject({ isSuccess: false, isPending: true, paymentStatus: 'unpaid' });
  expect((await Order.findById(order._id)).paymentStatus).toBe('unpaid');
  expect(await AuditLog.countDocuments({ entityId: String(order._id), entityType: 'Payment' })).toBe(0);
  expect((await callback('ipn', signed(order))).body.RspCode).toBe('00');
  expect((await callback('return', signed(order))).body.data.isSuccess).toBe(true);
  const saved = await Order.findById(order._id);
  expect(saved).toMatchObject({ paymentStatus: 'paid', status: 'processing' });
  expect(saved.trackingHistory.filter(entry => entry.status === 'processing')).toHaveLength(1);
});

test('concurrent duplicate IPNs commit exactly one payment transition and audit', async () => {
  const order = await fixture();
  const responses = await Promise.all([0, 1, 2].map(() => callback('ipn', signed(order))));
  expect(responses.map(r => r.body.RspCode).sort()).toEqual(['00', '02', '02']);
  expect((await Order.findById(order._id)).trackingHistory).toHaveLength(1);
  expect(await AuditLog.countDocuments({ entityId: String(order._id), action: 'PAYMENT_SUCCESS' })).toBe(1);
});

test.each(['24', '51'])('failed/canceled gateway result %s is recorded once and can later be paid', async code => {
  const order = await fixture();
  const query = signed(order, { vnp_ResponseCode: code, vnp_TransactionStatus: '02' });
  expect((await callback('ipn', query)).body.RspCode).toBe('00');
  expect((await callback('ipn', query)).body.RspCode).toBe('02');
  expect((await Order.findById(order._id)).paymentStatus).toBe('failed');
  expect((await callback('ipn', signed(order))).body.RspCode).toBe('00');
  expect((await Order.findById(order._id)).paymentStatus).toBe('paid');
});

test.each([
  ['wrong merchant', { vnp_TmnCode: 'OTHER-MERCHANT' }, '97'],
  ['missing transaction status', { vnp_TransactionStatus: '' }, '97'],
  ['wrong amount', { vnp_Amount: '1' }, '04'],
  ['wrong currency', { vnp_CurrCode: 'USD' }, '97'],
])('signed %s is rejected without changing the order', async (label, override, code) => {
  const order = await fixture();
  expect((await callback('ipn', signed(order, override))).body.RspCode).toBe(code);
  expect((await Order.findById(order._id)).paymentStatus).toBe('unpaid');
});

test('signature tampering and repeated query parameters are rejected without writes', async () => {
  const order = await fixture();
  const query = signed(order);
  expect((await callback('ipn', { ...query, vnp_Amount: '1' })).body.RspCode).toBe('97');
  expect((await callback('ipn', { ...query, vnp_Amount: [query.vnp_Amount, '1'] })).body.RspCode).toBe('97');
  expect((await Order.findById(order._id)).paymentStatus).toBe('unpaid');
});

test.each([{ status: 'cancelled' }, { paymentMethod: 'COD' }, { paymentStatus: 'refunded' }])('IPN rejects a nonpayable order %j', async overrides => {
  const order = await fixture(overrides);
  expect((await callback('ipn', signed(order))).body.RspCode).toBe('02');
  expect((await Order.findById(order._id)).paymentStatus).toBe(overrides.paymentStatus || 'unpaid');
});

test('Vendor and other customer cannot generate a payment URL for someone else\'s order', async () => {
  const order = await fixture();
  for (const user of [vendor, other]) {
    const response = await request(app).post('/api/v1/payments/create-vnpay-url')
      .set('Authorization', 'Bearer ' + token(user)).send({ orderId: order._id });
    expect(response.status).toBe(403);
  }
  const own = await request(app).post('/api/v1/payments/create-vnpay-url')
    .set('Authorization', 'Bearer ' + token(owner)).send({ orderId: order._id });
  expect(own.status).toBe(200);
  const params = Object.fromEntries(new URL(own.body.data.paymentUrl).searchParams);
  expect(params.vnp_Amount).toBe('10000000');
  expect(params.vnp_TmnCode).toBe(env.VNP_TMN_CODE);
});
