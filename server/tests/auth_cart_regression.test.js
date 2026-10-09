process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1/unused-test-placeholder';
process.env.JWT_SECRET = 'auth-cart-regression-access-test-only';
process.env.JWT_REFRESH_SECRET = 'auth-cart-regression-refresh-test-only';
process.env.SMTP_HOST = '';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';
process.env.VNP_HASH_SECRET = 'auth-cart-regression-vnpay-test-only';
process.env.VNP_TMN_CODE = 'TESTONLY';
const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MongoMemoryReplSet, MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const User = require('../src/models/User.model');
const Product = require('../src/models/Product.model');
const Inventory = require('../src/models/Inventory.model');
const Cart = require('../src/models/Cart.model');
const Order = require('../src/models/Order.model');
const Coupon = require('../src/models/Coupon.model');
const AuditLogService = require('../src/services/auditLog.service');
const { calculateVNPaySecureHash } = require('../src/controllers/payment.controller');
const env = require('../src/config/env');
const credentials = { email: 'regression@example.test', password: 'Regression123!' };
let mongo;
let product;
let otherProduct;
let account;
const login = async () => {
  const response = await request(app).post('/api/v1/auth/login').send(credentials);
  expect(response.status).toBe(200);
  return response.body.data;
};
const api = (method, url, token, body) => request(app)[method]('/api/v1' + url)
  .set('Authorization', 'Bearer ' + token).send(body);

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(mongo.getUri());
  account = await User.create(credentials);
  await Order.init();
  product = await Product.create({ name: 'Regression Shirt', price: 120000, stock: 5, variants: [{ sku: 'REG-SHIRT-M', color: 'Black', size: 'M', price: 100000, stock: 5 }] });
  otherProduct = await Product.create({ name: 'Other Product', price: 200000, stock: 5 });
  await Inventory.create({ product: product._id, sku: 'REG-SHIRT-M', variantId: product.variants[0]._id.toString(), stock: 5 });
  await Inventory.create({ product: otherProduct._id, sku: 'REG-OTHER', stock: 5 });
}, 120000);
afterAll(async () => { await mongoose.disconnect(); if (mongo) await mongo.stop(); });
afterEach(() => jest.restoreAllMocks());
beforeEach(async () => { await Cart.deleteMany({ user: account._id }); });

test('security sanitizers preserve exact password bytes through registration and login', async () => {
  const email = 'opaque-credential@example.test';
  const password = 'javascript:Secret<script>123</script>!';
  const registered = await request(app).post('/api/v1/auth/register').send({ email, password });
  expect(registered.status).toBe(201);
  const saved = await User.findOne({ email }).select('+password');
  expect(await bcrypt.compare(password, saved.password)).toBe(true);
  const altered = await request(app).post('/api/v1/auth/login').send({ email, password: 'Secret123!' });
  expect(altered.status).toBe(401);
  const exact = await request(app).post('/api/v1/auth/login').send({ email, password });
  expect(exact.status).toBe(200);
  const injected = await request(app).post('/api/v1/auth/login').send({ email, password: { $ne: '' } });
  expect(injected.status).toBe(400);
});

test('same-account login rotates distinct refresh token and rejects prior app token', async () => {
  const first = await login();
  const second = await login();
  expect(second.refreshToken).not.toBe(first.refreshToken);
  const revoked = await request(app).post('/api/v1/auth/refresh-token').send({ refreshToken: first.refreshToken });
  expect(revoked.status).toBe(401);
  const current = await request(app).post('/api/v1/auth/refresh-token').send({ refreshToken: second.refreshToken });
  expect(current.status).toBe(200);
  expect(current.body.data.refreshToken).not.toBe(second.refreshToken);
  const replay = await request(app).post('/api/v1/auth/refresh-token').send({ refreshToken: second.refreshToken });
  expect(replay.status).toBe(401);
});

test('concurrent refresh reuse has one winner and rejects the stale rotation', async () => {
  const session = await login();
  const responses = await Promise.all([0, 1].map(() => request(app).post('/api/v1/auth/refresh-token').send({ refreshToken: session.refreshToken })));
  expect(responses.map(r => r.status).sort()).toEqual([200, 401]);
  const winner = responses.find(r => r.status === 200).body.data;
  const next = await request(app).post('/api/v1/auth/refresh-token').send({ refreshToken: winner.refreshToken });
  expect(next.status).toBe(200);
});

test('logout during in-flight refresh cannot restore the revoked token', async () => {
  const session = await login();
  const realHash = bcrypt.hash.bind(bcrypt);
  let release;
  let entered;
  const blocked = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  jest.spyOn(bcrypt, 'hash').mockImplementationOnce(async (...args) => { entered(); await gate; return realHash(...args); });
  const refresh = request(app).post('/api/v1/auth/refresh-token').send({ refreshToken: session.refreshToken }).then(response => response);
  await blocked;
  const logout = await api('post', '/auth/logout', session.accessToken);
  expect(logout.status).toBe(200);
  release();
  const stale = await refresh;
  expect(stale.status).toBe(401);
  const saved = await User.findById(account._id).select('+refreshToken');
  expect(saved.refreshToken).toBeFalsy();
});

test('logout from either app revokes the current account refresh token but access remains valid until expiry', async () => {
  const oldApp = await login();
  const currentApp = await login();
  expect((await api('post', '/auth/logout', oldApp.accessToken)).status).toBe(200);
  expect((await request(app).post('/api/v1/auth/refresh-token').send({ refreshToken: currentApp.refreshToken })).status).toBe(401);
  expect((await api('get', '/cart', currentApp.accessToken)).status).toBe(200);
});

test.each([0, -1, 1.5, '2units', '', true])('cart add rejects invalid quantity %s without mutation', async quantity => {
  const session = await login();
  const response = await api('post', '/cart/items', session.accessToken, { productId: product._id, sku: 'REG-SHIRT-M', quantity });
  expect(response.status).toBe(400);
  expect(await Cart.countDocuments({ user: account._id })).toBe(0);
});

test('cart add refuses another product inventory SKU', async () => {
  const session = await login();
  const response = await api('post', '/cart/items', session.accessToken, { productId: product._id, sku: 'REG-OTHER', quantity: 1 });
  expect(response.status).toBe(400);
  expect(await Cart.countDocuments({ user: account._id })).toBe(0);
});

test('guest merge resolves canonical price/name/variant and refuses stock overflow atomically', async () => {
  const session = await login();
  const response = await api('post', '/sync/offline-cart', session.accessToken, { items: [{ productId: product._id, sku: ' reg-shirt-m ', quantity: 2, price: 1, name: 'Forged guest name', image: 'forged' }] });
  expect(response.status).toBe(200);
  expect(response.body.data.items[0]).toMatchObject({ sku: 'REG-SHIRT-M', quantity: 2, price: 100000, name: product.name, variantId: product.variants[0]._id.toString() });
  const overflow = await api('post', '/sync/offline-cart', session.accessToken, { items: [{ productId: product._id, sku: 'REG-SHIRT-M', quantity: 4 }] });
  expect(overflow.status).toBe(400);
  expect((await Cart.findOne({ user: account._id })).items[0].quantity).toBe(2);
});

test('cart update rejects missing inventory and malformed/fractional quantities', async () => {
  const session = await login();
  const added = await api('post', '/cart/items', session.accessToken, { productId: product._id, sku: 'REG-SHIRT-M', quantity: 1 });
  const id = added.body.data.items[0]._id;
  for (const quantity of [1.5, '2units', true]) expect((await api('put', '/cart/items/' + id, session.accessToken, { quantity })).status).toBe(400);
  await Inventory.deleteOne({ sku: 'REG-SHIRT-M' });
  try {
    expect((await api('put', '/cart/items/' + id, session.accessToken, { quantity: 2 })).status).toBe(400);
    expect((await Cart.findOne({ user: account._id })).items[0].quantity).toBe(1);
  } finally {
    await Inventory.create({ product: product._id, sku: 'REG-SHIRT-M', variantId: product.variants[0]._id.toString(), stock: 5 });
  }
});

test('checkout refuses cross-product SKU and fractional quantities before inventory changes', async () => {
  const session = await login();
  for (const item of [{ productId: product._id, sku: 'REG-OTHER', quantity: 1 }, { productId: product._id, sku: 'REG-SHIRT-M', quantity: 1.5 }]) {
    const response = await api('post', '/orders/checkout', session.accessToken, { items: [item], shippingAddress: { fullName: 'Regression', phone: '0900000000', address: 'Test address' } });
    expect(response.status).toBe(400);
  }
  expect((await Inventory.findOne({ sku: 'REG-OTHER' })).stock).toBe(5);
  expect(await Order.countDocuments({ user: account._id })).toBe(0);
});


test('admin-created variants have usable inventory; catalog edits preserve authoritative stock and variant identity', async () => {
  await User.updateOne({ _id: account._id }, { role: 'admin' });
  try {
    const session = await login();
    const created = await api('post', '/products', session.accessToken, { name: 'Inventory Regression', price: 50000, sku: 'REG-CREATED-BASE', stock: 8, variants: [{ sku: 'REG-CREATED-VARIANT', color: 'Blue', size: 'S', price: 55000, stock: 4 }] });
    expect(created.status).toBe(201);
    const saved = created.body.data;
    expect(saved.sku).toBe('REG-CREATED-BASE');
    expect((await Inventory.findOne({ sku: 'REG-CREATED-VARIANT' })).stock).toBe(4);
    const added = await api('post', '/cart/items', session.accessToken, { productId: saved._id, sku: 'REG-CREATED-VARIANT', quantity: 2 });
    expect(added.status).toBe(200);
    const updated = await api('put', '/products/' + saved._id, session.accessToken, { stock: 9, variants: [{ sku: 'REG-CREATED-VARIANT', color: 'Blue', size: 'S', price: 55000, stock: 1 }] });
    expect(updated.status).toBe(200);
    expect(updated.body.data.variants[0]._id).toBe(saved.variants[0]._id);
    expect((await Inventory.findOne({ sku: 'REG-CREATED-VARIANT' })).stock).toBe(4);
    expect(updated.body.data.variants[0].stock).toBe(4);
    expect((await api('post', '/cart/items', session.accessToken, { productId: saved._id, sku: 'REG-CREATED-VARIANT', quantity: 1 })).status).toBe(200);
    expect((await api('post', '/cart/items', session.accessToken, { productId: saved._id, sku: 'REG-CREATED-VARIANT', quantity: 2 })).status).toBe(400);
    const duplicate = await api('post', '/products', session.accessToken, { name: 'Duplicate SKU', price: 50000, sku: 'REG-CREATED-VARIANT', stock: 1 });
    expect(duplicate.status).toBe(409);
    expect(await Product.countDocuments({ name: 'Duplicate SKU' })).toBe(0);
  } finally {
    await User.updateOne({ _id: account._id }, { role: 'customer' });
  }
});


test('simultaneous checkout retries create one order and compensate duplicate stock deduction', async () => {
  const session = await login();
  const before = (await Inventory.findOne({ sku: 'REG-SHIRT-M' })).stock;
  const key = 'regression-double-checkout';
  const coupon = await Coupon.create({ code: 'REGRETRY', discountType: 'percentage', discountValue: 10, userLimit: 20, usageLimit: 50, endDate: new Date(Date.now() + 86400000) });
  const body = { items: [{ productId: product._id, sku: 'REG-SHIRT-M', quantity: 1 }], shippingAddress: { fullName: 'Regression', phone: '0900000000', address: 'Test address' }, idempotencyKey: key, couponCode: coupon.code };
  const responses = await Promise.all([0, 1].map(() => api('post', '/orders/checkout', session.accessToken, body)));
  expect(responses.map(response => response.status).sort()).toEqual([200, 201]);
  expect(responses[0].body.data._id).toBe(responses[1].body.data._id);
  expect(await Order.countDocuments({ idempotencyKey: key })).toBe(1);
  expect((await Inventory.findOne({ sku: 'REG-SHIRT-M' })).stock).toBe(before - 1);
  expect((await Product.findById(product._id)).stock).toBe(5);
  const savedCoupon = await Coupon.findById(coupon._id);
  expect(savedCoupon.usageCount).toBe(1);
  expect(savedCoupon.usedBy).toHaveLength(1);
  expect(String(savedCoupon.usedBy[0].orderId)).toBe(responses[0].body.data._id);
});

test('offline orders reject negative quantities and foreign SKU before changing inventory', async () => {
  const session = await login();
  const before = (await Inventory.findOne({ sku: 'REG-OTHER' })).stock;
  for (const [index, item] of [{ productId: product._id, sku: 'REG-OTHER', quantity: 1 }, { productId: product._id, sku: 'REG-SHIRT-M', quantity: -2 }].entries()) {
    const response = await api('post', '/sync/offline-orders', session.accessToken, { orders: [{ clientOrderId: 'reg-offline-invalid-' + index, items: [item], shippingAddress: { fullName: 'Regression', phone: '0900000000', address: 'Test address' } }] });
    expect(response.status).toBe(200);
    expect(response.body.data.failedCount).toBe(1);
    expect(response.body.data.syncedCount).toBe(0);
  }
  expect((await Inventory.findOne({ sku: 'REG-OTHER' })).stock).toBe(before);
});


test('concurrent checkouts with different keys enforce coupon per-user limit atomically', async () => {
  const session = await login();
  const coupon = await Coupon.create({ code: 'REGONCE', discountType: 'fixed', discountValue: 10000, usageLimit: 50, userLimit: 1, endDate: new Date(Date.now() + 86400000) });
  const before = (await Inventory.findOne({ sku: 'REG-SHIRT-M' })).stock;
  const responses = await Promise.all([0, 1].map(index => api('post', '/orders/checkout', session.accessToken, {
    items: [{ productId: product._id, sku: 'REG-SHIRT-M', quantity: 1 }], couponCode: coupon.code,
    shippingAddress: { fullName: 'Regression', phone: '0900000000', address: 'Test address' },
    idempotencyKey: 'reg-coupon-once-' + index,
  })));
  expect(responses.map(response => response.status).sort()).toEqual([201, 400]);
  expect(await Order.countDocuments({ 'coupon.couponId': coupon._id })).toBe(1);
  const saved = await Coupon.findById(coupon._id);
  expect(saved.usageCount).toBe(1);
  expect(saved.usedBy).toHaveLength(1);
  expect((await Inventory.findOne({ sku: 'REG-SHIRT-M' })).stock).toBe(before - 1);
});


test('offline checkout rejects expired coupon without deducting stock or consuming usage', async () => {
  const session = await login();
  const coupon = await Coupon.create({ code: 'REGEXPIRED', discountType: 'fixed', discountValue: 10000, userLimit: 1, endDate: new Date(Date.now() - 1000) });
  const before = (await Inventory.findOne({ sku: 'REG-SHIRT-M' })).stock;
  const response = await api('post', '/sync/offline-orders', session.accessToken, { orders: [{
    clientOrderId: 'reg-offline-expired-coupon', items: [{ productId: product._id, sku: 'REG-SHIRT-M', quantity: 1 }],
    couponCode: coupon.code, shippingAddress: { fullName: 'Regression', phone: '0900000000', address: 'Test address' },
  }] });
  expect(response.status).toBe(200);
  expect(response.body.data.failedCount).toBe(1);
  expect(response.body.data.syncedCount).toBe(0);
  expect((await Coupon.findById(coupon._id)).usageCount).toBe(0);
  expect((await Inventory.findOne({ sku: 'REG-SHIRT-M' })).stock).toBe(before);
});


test('cancelling inventory-backed checkout restores exact Inventory without inflating Product stock', async () => {
  const session = await login();
  const inventoryBefore = (await Inventory.findOne({ sku: 'REG-OTHER' })).stock;
  const productBefore = (await Product.findById(otherProduct._id)).stock;
  const created = await api('post', '/orders/checkout', session.accessToken, {
    items: [{ productId: otherProduct._id, sku: 'REG-OTHER', quantity: 1 }],
    shippingAddress: { fullName: 'Regression', phone: '0900000000', address: 'Test address' },
  });
  expect(created.status).toBe(201);
  expect(created.body.data.items[0].stockSource).toBe('inventory');
  await User.updateOne({ _id: account._id }, { role: 'admin' });
  try {
    const cancelled = await api('patch', '/orders/' + created.body.data._id + '/status', session.accessToken, { status: 'cancelled' });
    expect(cancelled.status).toBe(200);
    expect((await Inventory.findOne({ sku: 'REG-OTHER' })).stock).toBe(inventoryBefore);
    expect((await Product.findById(otherProduct._id)).stock).toBe(productBefore);
  } finally { await User.updateOne({ _id: account._id }, { role: 'customer' }); }
});


test('legacy product-stock fallback respects variant stock and cancellation restores its exact source', async () => {
  const session = await login();
  const oldInventory = await Inventory.findOneAndDelete({ sku: 'REG-SHIRT-M' });
  const before = await Product.findById(product._id);
  try {
    const created = await api('post', '/orders/checkout', session.accessToken, {
      items: [{ productId: product._id, sku: 'REG-SHIRT-M', quantity: 1 }],
      shippingAddress: { fullName: 'Regression', phone: '0900000000', address: 'Test address' },
    });
    expect(created.status).toBe(201);
    expect(created.body.data.items[0].stockSource).toBe('product');
    await User.updateOne({ _id: account._id }, { role: 'admin' });
    const cancelled = await api('patch', '/orders/' + created.body.data._id + '/status', session.accessToken, { status: 'cancelled' });
    expect(cancelled.status).toBe(200);
    const after = await Product.findById(product._id);
    expect(after.stock).toBe(before.stock);
    expect(after.variants[0].stock).toBe(before.variants[0].stock);
    expect(await Inventory.countDocuments({ sku: 'REG-SHIRT-M' })).toBe(0);
  } finally {
    await User.updateOne({ _id: account._id }, { role: 'customer' });
    await Inventory.create({ product: oldInventory.product, sku: oldInventory.sku, variantId: oldInventory.variantId, stock: oldInventory.stock });
  }
});

test('cross-variant SKU reassignment fails before partially persisting product or inventory', async () => {
  await User.updateOne({ _id: account._id }, { role: 'admin' });
  try {
    const session = await login();
    const created = await api('post', '/products', session.accessToken, {
      name: 'Swap SKU Regression', price: 50000, sku: 'REG-SWAP-BASE', stock: 5,
      variants: [{ sku: 'REG-SWAP-A', price: 50000, stock: 2 }, { sku: 'REG-SWAP-B', price: 60000, stock: 3 }],
    });
    expect(created.status).toBe(201);
    const saved = created.body.data;
    const response = await api('put', '/products/' + saved._id, session.accessToken, {
      variants: [{ ...saved.variants[0], sku: 'REG-SWAP-B' }, { ...saved.variants[1], sku: 'REG-SWAP-A' }],
    });
    expect(response.status).toBe(400);
    const unchanged = await Product.findById(saved._id);
    expect(unchanged.variants.map(variant => variant.sku)).toEqual(['REG-SWAP-A', 'REG-SWAP-B']);
    expect(unchanged.variants.map(variant => String(variant._id))).toEqual(saved.variants.map(variant => variant._id));
    expect((await Inventory.findOne({ sku: 'REG-SWAP-A' })).stock).toBe(2);
    expect((await Inventory.findOne({ sku: 'REG-SWAP-B' })).stock).toBe(3);
  } finally { await User.updateOne({ _id: account._id }, { role: 'customer' }); }
});


test('two cancellation requests from the same original snapshot refund stock and coupon exactly once', async () => {
  const session = await login();
  const coupon = await Coupon.create({ code: 'REGCANCEL', discountType: 'fixed', discountValue: 1000, userLimit: 10, endDate: new Date(Date.now() + 86400000) });
  const inventoryBefore = (await Inventory.findOne({ sku: 'REG-OTHER' })).stock;
  const productBefore = (await Product.findById(otherProduct._id)).stock;
  const created = await api('post', '/orders/checkout', session.accessToken, {
    items: [{ productId: otherProduct._id, sku: 'REG-OTHER', quantity: 1 }], couponCode: coupon.code,
    shippingAddress: { fullName: 'Regression', phone: '0900000000', address: 'Test address' },
  });
  expect(created.status).toBe(201);
  await User.updateOne({ _id: account._id }, { role: 'admin' });
  const realFind = Order.findById.bind(Order);
  let release;
  let reads = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const spy = jest.spyOn(Order, 'findById').mockImplementation(async (id, ...args) => {
    const found = await realFind(id, ...args);
    if (String(id) === created.body.data._id) {
      reads++;
      if (reads === 2) release();
      await gate;
    }
    return found;
  });
  try {
    const responses = await Promise.all([0, 1].map(() => api('patch', '/orders/' + created.body.data._id + '/status', session.accessToken, { status: 'cancelled' })));
    spy.mockRestore();
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    expect((await Inventory.findOne({ sku: 'REG-OTHER' })).stock).toBe(inventoryBefore);
    expect((await Product.findById(otherProduct._id)).stock).toBe(productBefore);
    const savedCoupon = await Coupon.findById(coupon._id);
    expect(savedCoupon.usageCount).toBe(0);
    expect(savedCoupon.usedBy).toHaveLength(0);
    const order = await Order.findById(created.body.data._id);
    expect(order.status).toBe('cancelled');
    expect(order.trackingHistory.filter(entry => entry.status === 'cancelled')).toHaveLength(1);
  } finally {
    release();
    spy.mockRestore();
    await User.updateOne({ _id: account._id }, { role: 'customer' });
  }
});

test.each(['online', 'offline'])('%s checkout preserves committed order/stock/coupon link when finalization writer is unavailable', async mode => {
  const session = await login();
  const coupon = await Coupon.create({ code: 'REGMETADATA' + mode.toUpperCase(), discountType: 'fixed', discountValue: 1000, userLimit: 10, endDate: new Date(Date.now() + 86400000) });
  const before = (await Inventory.findOne({ sku: 'REG-OTHER' })).stock;
  // The old implementation attempted this after Order.create, then incorrectly
  // compensated a persisted order. The claim now includes its orderId up front.
  jest.spyOn(Coupon, 'updateOne').mockRejectedValue(new Error('Injected metadata writer failure'));
  const payload = { items: [{ productId: otherProduct._id, sku: 'REG-OTHER', quantity: 1 }], couponCode: coupon.code,
    shippingAddress: { fullName: 'Regression', phone: '0900000000', address: 'Test address' } };
  const response = mode === 'online'
    ? await api('post', '/orders/checkout', session.accessToken, payload)
    : await api('post', '/sync/offline-orders', session.accessToken, { orders: [{ ...payload, clientOrderId: 'reg-metadata-offline' }] });
  expect(response.status).toBe(mode === 'online' ? 201 : 200);
  if (mode === 'offline') { expect(response.body.data.syncedCount).toBe(1); expect(response.body.data.failedCount).toBe(0); }
  const id = mode === 'online' ? response.body.data._id : response.body.data.syncedOrders[0].orderId;
  const order = await Order.findById(id);
  expect(order).not.toBeNull();
  expect((await Inventory.findOne({ sku: 'REG-OTHER' })).stock).toBe(before - 1);
  const saved = await Coupon.findById(coupon._id);
  expect(saved.usageCount).toBe(1);
  expect(saved.usedBy).toHaveLength(1);
  expect(String(saved.usedBy[0].orderId)).toBe(String(order._id));
});

test('product sale policy gives identical variant price in cart, guest merge, online and offline checkout', async () => {
  const session = await login();
  const before = await Product.findById(product._id);
  await Product.updateOne({ _id: product._id }, { salePrice: 80000 });
  try {
    const item = { productId: product._id, sku: 'REG-SHIRT-M', quantity: 1 };
    const cart = await api('post', '/cart/items', session.accessToken, item);
    expect(cart.status).toBe(200);
    expect(cart.body.data.items[0].price).toBe(80000);
    await api('delete', '/cart', session.accessToken);
    const merged = await api('post', '/sync/offline-cart', session.accessToken, { items: [{ ...item, price: 1 }] });
    expect(merged.status).toBe(200);
    expect(merged.body.data.items[0].price).toBe(80000);
    const payload = { items: [item], shippingAddress: { fullName: 'Regression', phone: '0900000000', address: 'Test address' } };
    const online = await api('post', '/orders/checkout', session.accessToken, payload);
    expect(online.status).toBe(201);
    expect(online.body.data.items[0].price).toBe(80000);
    expect(online.body.data.finalAmount).toBe(80000);
    const offline = await api('post', '/sync/offline-orders', session.accessToken, { orders: [{ ...payload, clientOrderId: 'reg-sale-policy-offline' }] });
    expect(offline.status).toBe(200);
    expect(offline.body.data.syncedCount).toBe(1);
    const saved = await Order.findById(offline.body.data.syncedOrders[0].orderId);
    expect(saved.items[0].price).toBe(80000);
    expect(saved.finalAmount).toBe(online.body.data.finalAmount);
  } finally { await Product.updateOne({ _id: product._id }, { salePrice: before.salePrice }); }
});

const createRefundFixture = async (suffix, paymentMethod = 'COD') => {
  const session = await login();
  const sku = 'REG-TX-' + suffix.toUpperCase();
  const freshProduct = await Product.create({ name: 'Refund transaction ' + suffix, price: 20000, stock: 10 });
  await Inventory.create({ product: freshProduct._id, sku, stock: 10 });
  const coupon = await Coupon.create({ code: sku, discountType: 'fixed', discountValue: 1000, userLimit: 10, endDate: new Date(Date.now() + 86400000) });
  const created = await api('post', '/orders/checkout', session.accessToken, {
    items: [{ productId: freshProduct._id, sku, quantity: 1 }], couponCode: coupon.code, paymentMethod,
    shippingAddress: { fullName: 'Regression', phone: '0900000000', address: 'Test address' },
  });
  expect(created.status).toBe(201);
  return { session, sku, coupon, order: created.body.data };
};

const signedPayment = (order, responseCode = '00') => {
  const params = { vnp_TmnCode: env.VNP_TMN_CODE, vnp_TxnRef: order.orderCode, vnp_Amount: String(Math.round(order.finalAmount * 100)),
    vnp_ResponseCode: responseCode, vnp_TransactionStatus: responseCode, vnp_TransactionNo: 'REG-TX-TEST', vnp_BankCode: 'TEST' };
  return { ...params, vnp_SecureHash: calculateVNPaySecureHash(params, env.VNP_HASH_SECRET) };
};

test.each(['inventory', 'coupon'])('cancellation transaction rolls back all writes after %s refund failure and can be retried', async target => {
  const fixture = await createRefundFixture('rollback-' + target);
  await User.updateOne({ _id: account._id }, { role: 'admin' });
  let spy;
  if (target === 'inventory') {
    const original = Inventory.compensateStock.bind(Inventory);
    spy = jest.spyOn(Inventory, 'compensateStock').mockImplementationOnce(async (...args) => {
      await original(...args);
      throw new Error('Injected failure after inventory refund write');
    });
  } else {
    const original = Coupon.updateOne.bind(Coupon);
    spy = jest.spyOn(Coupon, 'updateOne').mockImplementationOnce(async (...args) => {
      await original(...args);
      throw new Error('Injected failure after coupon refund write');
    });
  }
  try {
    const url = '/orders/' + fixture.order._id + '/status';
    const failed = await api('patch', url, fixture.session.accessToken, { status: 'cancelled' });
    expect(failed.status).toBe(500);
    spy.mockRestore();
    const unchanged = await Order.findById(fixture.order._id);
    expect(unchanged.status).toBe('pending');
    expect(unchanged.cancelledAt).toBeNull();
    expect(unchanged.trackingHistory.filter(entry => entry.status === 'cancelled')).toHaveLength(0);
    expect((await Inventory.findOne({ sku: fixture.sku })).stock).toBe(9);
    const retainedCoupon = await Coupon.findById(fixture.coupon._id);
    expect(retainedCoupon.usageCount).toBe(1);
    expect(retainedCoupon.usedBy).toHaveLength(1);
    expect(String(retainedCoupon.usedBy[0].orderId)).toBe(fixture.order._id);
    const retried = await api('patch', url, fixture.session.accessToken, { status: 'cancelled' });
    expect(retried.status).toBe(200);
    expect((await Inventory.findOne({ sku: fixture.sku })).stock).toBe(10);
    const releasedCoupon = await Coupon.findById(fixture.coupon._id);
    expect(releasedCoupon.usageCount).toBe(0);
    expect(releasedCoupon.usedBy).toHaveLength(0);
    const saved = await Order.findById(fixture.order._id);
    expect(saved.status).toBe('cancelled');
    expect(saved.trackingHistory.filter(entry => entry.status === 'cancelled')).toHaveLength(1);
    expect((await api('patch', url, fixture.session.accessToken, { status: 'cancelled' })).status).toBe(400);
    expect((await Inventory.findOne({ sku: fixture.sku })).stock).toBe(10);
  } finally {
    spy.mockRestore();
    await User.updateOne({ _id: account._id }, { role: 'customer' });
  }
});

test('standalone MongoDB rejects cancellation with 503 before order, stock or coupon writes', async () => {
  const standalone = await MongoMemoryServer.create();
  await mongoose.disconnect();
  try {
    await mongoose.connect(standalone.getUri());
    const standaloneCredentials = { email: 'standalone-regression@example.test', password: credentials.password };
    const user = await User.create({ ...standaloneCredentials, role: 'admin' });
    const loginResponse = await request(app).post('/api/v1/auth/login').send(standaloneCredentials);
    expect(loginResponse.status).toBe(200);
    const freshProduct = await Product.create({ name: 'Standalone refund fixture', price: 20000, stock: 10 });
    const inventory = await Inventory.create({ product: freshProduct._id, sku: 'REG-STANDALONE', stock: 9 });
    const orderId = new mongoose.Types.ObjectId();
    const coupon = await Coupon.create({ code: 'REGSTANDALONE', discountType: 'fixed', discountValue: 1000,
      endDate: new Date(Date.now() + 86400000), usageCount: 1, usedBy: [{ user: user._id, orderId }] });
    const order = await Order.create({ _id: orderId, orderCode: 'ORD-REG-STANDALONE', user: user._id,
      items: [{ product: freshProduct._id, sku: inventory.sku, name: freshProduct.name, price: 20000, quantity: 1, subtotal: 20000, stockSource: 'inventory' }],
      totalAmount: 20000, finalAmount: 19000, coupon: { couponId: coupon._id, code: coupon.code, discountAmount: 1000 },
      shippingAddress: { fullName: 'Regression', phone: '0900000000', address: 'Test address' }, trackingHistory: [{ status: 'pending' }] });
    const orderWriter = jest.spyOn(Order, 'findOneAndUpdate');
    const inventoryWriter = jest.spyOn(Inventory, 'compensateStock');
    const couponWriter = jest.spyOn(Coupon, 'updateOne');
    const response = await api('patch', '/orders/' + order._id + '/status', loginResponse.body.data.accessToken, { status: 'cancelled' });
    expect(response.status).toBe(503);
    expect(orderWriter).not.toHaveBeenCalled();
    expect(inventoryWriter).not.toHaveBeenCalled();
    expect(couponWriter).not.toHaveBeenCalled();
    const saved = await Order.findById(order._id);
    expect(saved.status).toBe('pending');
    expect(saved.cancelledAt).toBeNull();
    expect(saved.trackingHistory).toHaveLength(1);
    expect((await Inventory.findById(inventory._id)).stock).toBe(9);
    const savedCoupon = await Coupon.findById(coupon._id);
    expect(savedCoupon.usageCount).toBe(1);
    expect(savedCoupon.usedBy).toHaveLength(1);
    expect(String(savedCoupon.usedBy[0].orderId)).toBe(String(order._id));
  } finally {
    jest.restoreAllMocks();
    await mongoose.disconnect();
    await standalone.stop();
    await mongoose.connect(mongo.getUri());
  }
}, 120000);

test.each(['return', 'ipn'])('a delayed valid VNPay %s cannot overwrite committed cancellation or emit payment side effects', async callback => {
  const fixture = await createRefundFixture('payment-cancel-' + callback, 'VNPAY');
  await User.updateOne({ _id: account._id }, { role: 'admin' });
  const realFind = Order.findOne.bind(Order);
  let release;
  let entered;
  const blocked = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const reader = jest.spyOn(Order, 'findOne').mockImplementation(async (filter, ...args) => {
    const found = await realFind(filter, ...args);
    if (filter.orderCode === fixture.order.orderCode) { entered(); await gate; }
    return found;
  });
  const audit = jest.spyOn(AuditLogService, 'logPaymentTransaction');
  const requestPromise = request(app).get('/api/v1/payments/vnpay-' + callback).query(signedPayment(fixture.order)).then(response => response);
  try {
    await blocked;
    const cancelled = await api('patch', '/orders/' + fixture.order._id + '/status', fixture.session.accessToken, { status: 'cancelled' });
    expect(cancelled.status).toBe(200);
    release();
    const response = await requestPromise;
    reader.mockRestore();
    if (callback === 'return') {
      expect(response.status).toBe(200);
      expect(response.body.data.isSuccess).toBe(false);
    }
    else { expect(response.status).toBe(200); expect(response.body.RspCode).toBe('02'); }
    expect(audit).not.toHaveBeenCalled();
    const saved = await Order.findById(fixture.order._id);
    expect(saved.status).toBe('cancelled');
    expect(saved.paymentStatus).toBe('unpaid');
    expect(saved.trackingHistory.filter(entry => entry.status === 'processing')).toHaveLength(0);
    expect(saved.trackingHistory.filter(entry => entry.status === 'cancelled')).toHaveLength(1);
    expect((await Inventory.findOne({ sku: fixture.sku })).stock).toBe(10);
    expect((await Coupon.findById(fixture.coupon._id)).usageCount).toBe(0);
  } finally {
    release();
    reader.mockRestore();
    await requestPromise;
    await User.updateOne({ _id: account._id }, { role: 'customer' });
  }
});

test('simultaneous valid VNPay Return and IPN from one snapshot commit one payment transition and one audit effect', async () => {
  const fixture = await createRefundFixture('payment-duplicate', 'VNPAY');
  const realFind = Order.findOne.bind(Order);
  let reads = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const reader = jest.spyOn(Order, 'findOne').mockImplementation(async (filter, ...args) => {
    const found = await realFind(filter, ...args);
    if (filter.orderCode === fixture.order.orderCode) {
      reads++;
      if (reads === 2) release();
      await gate;
    }
    return found;
  });
  const audit = jest.spyOn(AuditLogService, 'logPaymentTransaction');
  try {
    const responses = await Promise.all(['return', 'ipn'].map(callback => request(app).get('/api/v1/payments/vnpay-' + callback).query(signedPayment(fixture.order))));
    reader.mockRestore();
    expect(responses.map(response => response.status)).toEqual([200, 200]);
    expect(responses[0].body.data.isSuccess).toBe(false);
    expect(responses[0].body.data.isPending).toBe(true);
    expect(['00', '02']).toContain(responses[1].body.RspCode);
    expect(audit).toHaveBeenCalledTimes(1);
    const saved = await Order.findById(fixture.order._id);
    expect(saved.status).toBe('processing');
    expect(saved.paymentStatus).toBe('paid');
    expect(saved.trackingHistory.filter(entry => entry.status === 'processing')).toHaveLength(1);
    expect((await Inventory.findOne({ sku: fixture.sku })).stock).toBe(9);
    expect((await Coupon.findById(fixture.coupon._id)).usageCount).toBe(1);
  } finally { release(); reader.mockRestore(); }
});

test('repeated failed VNPay IPN records one failure transition and one audit effect', async () => {
  const fixture = await createRefundFixture('payment-failed-duplicate', 'VNPAY');
  const audit = jest.spyOn(AuditLogService, 'logPaymentTransaction');
  const callback = () => request(app).get('/api/v1/payments/vnpay-ipn').query(signedPayment(fixture.order, '24'));
  const first = await callback();
  const repeated = await callback();
  expect(first.body.RspCode).toBe('00');
  expect(repeated.body.RspCode).toBe('02');
  expect(audit).toHaveBeenCalledTimes(1);
  const saved = await Order.findById(fixture.order._id);
  expect(saved.status).toBe('pending');
  expect(saved.paymentStatus).toBe('failed');
  expect(saved.trackingHistory.filter(entry => entry.note.includes('giao dịch thất bại'))).toHaveLength(1);
});
