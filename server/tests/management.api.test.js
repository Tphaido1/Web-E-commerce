process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1/management-test-placeholder';
process.env.JWT_SECRET = 'management-access-test-only';
process.env.JWT_REFRESH_SECRET = 'management-refresh-test-only';
process.env.SMTP_HOST = '';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
jest.mock('../src/services/email.service', () => ({
  sendOrderConfirmationEmail: jest.fn().mockResolvedValue({ success: false }),
  verifyTrackingToken: (...args) => jest.requireActual('../src/services/email.service').verifyTrackingToken(...args),
}));
const app = require('../src/app');
const env = require('../src/config/env');
const User = require('../src/models/User.model');
const Product = require('../src/models/Product.model');
const Inventory = require('../src/models/Inventory.model');
const Order = require('../src/models/Order.model');
const Review = require('../src/models/Review.model');
const { authenticateSocket } = require('../src/config/socket');
const { notifyOrderVendors } = require('../src/utils/vendorScope.util');
let mongo;
let admin, vendorA, vendorB, customer, productA, productB, stockA, stockB;
const token = (user, role = user.role) => jwt.sign({ sub: String(user._id), role, type: 'access' }, env.JWT_SECRET, { expiresIn: '1h' });
const api = (method, path, user, body) => request(app)[method]('/api/v1' + path).set('Authorization', 'Bearer ' + token(user)).send(body);
const shippingAddress = { fullName: 'Test Buyer', phone: '0900000000', address: 'Isolated test address' };
const orderItem = (product, price = 100) => ({ product: product._id, vendor: product.vendor, sku: product === productA ? 'OWN-A' : 'OWN-B', name: product.name, price, quantity: 1, subtotal: price });

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(mongo.getUri());
  [admin, vendorA, vendorB, customer] = await User.create([
    { email: 'admin@management.test', password: 'Admin123!', role: 'admin' },
    { email: 'vendor-a@management.test', password: 'Vendor123!', role: 'vendor' },
    { email: 'vendor-b@management.test', password: 'Vendor123!', role: 'vendor' },
    { email: 'customer@management.test', password: 'Customer123!' },
  ]);
  await Order.init();
  await Inventory.init();
}, 120000);
afterAll(async () => { await mongoose.disconnect(); if (mongo) await mongo.stop(); });
beforeEach(async () => {
  await Promise.all([Order.deleteMany({}), Inventory.deleteMany({}), Product.deleteMany({}), Review.deleteMany({})]);
  await User.updateOne({ _id: vendorA._id }, { $set: { role: 'vendor', isActive: true, refreshToken: null } });
  [productA, productB] = await Product.create([
    { name: 'Owned A', price: 100, vendor: vendorA._id, stock: 10 },
    { name: 'Owned B', price: 100, vendor: vendorB._id, stock: 10 },
  ]);
  [stockA, stockB] = await Inventory.create([
    { product: productA._id, sku: 'OWN-A', stock: 10, lowStockThreshold: 5 },
    { product: productB._id, sku: 'OWN-B', stock: 10 },
  ]);
  app.set('io', null);
});

test('management endpoints require authentication and reject Customer/Vendor user administration', async () => {
  for (const path of ['/inventory', '/users', '/analytics', '/products/managed']) {
    expect((await request(app).get('/api/v1' + path)).status).toBe(401);
    expect((await api('get', path, customer)).status).toBe(403);
  }
  expect((await api('get', '/users', vendorA)).status).toBe(403);
});

test.each([{ role: 'customer' }, { isActive: false }])('uppercase Admin ObjectId cannot bypass self-protection %j', async changes => {
  const response = await api('patch', '/users/' + String(admin._id).toUpperCase(), admin, changes);
  expect(response.status).toBe(409);
  const saved = await User.findById(admin._id);
  expect(saved.role).toBe('admin'); expect(saved.isActive).toBe(true);
});

test('public tracking cannot bypass mixed-Vendor privacy; a real HMAC link grants recipient details', async () => {
  const order = await Order.create({ orderCode: 'ORD-MIXED-PRIVATE-TRACKING', user: customer._id,
    items: [orderItem(productA), orderItem(productB)], shippingAddress,
    totalAmount: 200, finalAmount: 200, paymentMethod: 'VNPAY',
    trackingHistory: [{ status: 'pending', note: 'Private gateway reference', updatedBy: admin._id }],
  });
  for (const suffix of ['', '?token=invalid']) {
    const response = await request(app).get('/api/v1/orders/track/' + order.orderCode + suffix);
    expect(response.status).toBe(200);
    const data = response.body.data;
    expect(data.isVerifiedByHMAC).toBe(false);
    for (const key of ['finalAmount', 'itemCount', 'paymentMethod', 'paymentStatus', 'items', 'shippingAddress', 'qrCodeDataUrl']) expect(data).not.toHaveProperty(key);
    expect(data.trackingHistory).toEqual([{ status: 'pending', updatedAt: expect.any(String) }]);
  }
  const service = jest.requireActual('../src/services/email.service');
  const trackingToken = service.generateTrackingToken(order._id, order.createdAt);
  const verified = await request(app).get('/api/v1/orders/track/' + order.orderCode).query({ token: trackingToken });
  expect(verified.body.data).toMatchObject({ isVerifiedByHMAC: true, finalAmount: 200, itemCount: 2 });
  expect(verified.body.data.items).toHaveLength(2);
  expect(verified.body.data.trackingHistory[0].note).toBe('Private gateway reference');
});

test('Vendor inventory is scoped; forged restock and threshold writes cannot change other stock', async () => {
  const own = await api('get', '/inventory', vendorA);
  expect(own.status).toBe(200);
  expect(own.body.data.inventory.map((row) => row.sku)).toEqual(['OWN-A']);
  expect((await api('post', '/inventory/' + stockB._id + '/restock', vendorA, { quantity: 3 })).status).toBe(404);
  expect((await api('patch', '/inventory/' + stockB._id + '/threshold', vendorA, { lowStockThreshold: 20 })).status).toBe(404);
  expect((await Inventory.findById(stockB._id)).stock).toBe(10);
});

test('inventory low/out filters, SKU search and configurable threshold use authoritative live stock', async () => {
  expect((await api('patch', '/inventory/' + stockA._id + '/threshold', vendorA, { lowStockThreshold: 12 })).status).toBe(200);
  const low = await api('get', '/inventory?stockStatus=low&search=own-a', vendorA);
  expect(low.body.data.inventory[0]).toMatchObject({ stock: 10, lowStockThreshold: 12, status: 'low' });
  await Inventory.updateOne({ _id: stockA._id }, { $set: { stock: 0 } });
  expect((await api('get', '/inventory?stockStatus=out', vendorA)).body.data.inventory[0].status).toBe('out');
  expect((await api('get', '/inventory?stockStatus=low', vendorA)).body.data.inventory).toHaveLength(0);
});

test.each([0, -1, 1.5, true, 'bad'])('restock rejects invalid quantity %s without changing stock', async (quantity) => {
  expect((await api('post', '/inventory/' + stockA._id + '/restock', vendorA, { quantity })).status).toBe(400);
  expect((await Inventory.findById(stockA._id)).stock).toBe(10);
});

test('concurrent restocks, real checkouts and cancellations preserve stock exactly', async () => {
  const results = await Promise.all([
    ...Array.from({ length: 6 }, () => api('post', '/inventory/' + stockA._id + '/restock', vendorA, { quantity: 2 })),
    ...Array.from({ length: 6 }, () => api('post', '/orders/checkout', customer, { items: [{ productId: productA._id, sku: 'OWN-A', quantity: 1 }], shippingAddress })),
  ]);
  expect(results.map((response) => response.status).sort()).toEqual([200, 200, 200, 200, 200, 200, 201, 201, 201, 201, 201, 201]);
  expect((await Inventory.findById(stockA._id)).stock).toBe(16);
  const catalog = await request(app).get('/api/v1/products/' + productA._id);
  expect(catalog.body.data.stock).toBe(16);
  const orders = results.filter((response) => response.status === 201).map((response) => response.body.data);
  const cancellations = await Promise.all(orders.map((order) => api('patch', '/orders/' + order._id + '/status', admin, { status: 'cancelled' })));
  expect(cancellations.every((response) => response.status === 200)).toBe(true);
  expect((await Inventory.findById(stockA._id)).stock).toBe(22);
}, 30000);

test('Vendor catalog creation/updates are scoped; Admin can assign active Vendors and legacy data stays private', async () => {
  const otherWrite = await api('put', '/products/' + productB._id, vendorA, { name: 'Stolen' });
  expect(otherWrite.status).toBe(404);
  expect((await api('post', '/products', vendorA, { name: 'Forged', price: 100, sku: 'FORGED', vendor: String(vendorB._id) })).status).toBe(403);
  const created = await api('post', '/products', vendorA, { name: 'New Own', price: 100, sku: 'NEW-OWN', stock: 2 });
  expect(created.status).toBe(201);
  expect(created.body.data.vendor).toBe(String(vendorA._id));
  const legacy = await Product.create({ name: 'Legacy', price: 100 });
  const list = await api('get', '/products/managed', vendorA);
  expect(list.body.data.products.map((product) => product.name).sort()).toEqual(['New Own', 'Owned A']);
  expect((await api('put', '/products/' + legacy._id, vendorA, { name: 'Take Legacy' })).status).toBe(404);
  expect((await api('put', '/products/' + productB._id, admin, { vendor: String(vendorA._id) })).status).toBe(200);
  expect((await api('put', '/products/' + productB._id, admin, { vendor: String(customer._id) })).status).toBe(400);
});

test('user responses whitelist safe fields; updates reject secrets and self-lockout', async () => {
  const list = await api('get', '/users?role=vendor&active=true&search=vendor-', admin);
  expect(list.body.data.users).toHaveLength(2);
  const detail = await api('get', '/users/' + vendorA._id, admin);
  expect(Object.keys(detail.body.data).sort()).toEqual(['_id', 'createdAt', 'email', 'isActive', 'role', 'updatedAt']);
  expect((await api('patch', '/users/' + vendorA._id, admin, { password: 'Overwrite!' })).status).toBe(400);
  expect((await api('patch', '/users/' + admin._id, admin, { isActive: false })).status).toBe(409);
  expect((await api('patch', '/users/' + admin._id, admin, { role: 'customer' })).status).toBe(409);
});

test('a stale catalog editor cannot overwrite stock after restock/checkout, including existing variants', async () => {
  const created = await api('post', '/products', vendorA, { name: 'Variant Item', price: 100,
    sku: 'EDIT-BASE', stock: 3, variants: [{ sku: 'EDIT-M', price: 100, color: 'Blue', size: 'M', stock: 4 }] });
  expect(created.status).toBe(201);
  const snapshot = created.body.data;
  const [baseStock, variantStock] = await Promise.all([
    Inventory.findOne({ sku: 'EDIT-BASE' }), Inventory.findOne({ sku: 'EDIT-M' }),
  ]);
  expect((await api('post', '/inventory/' + baseStock._id + '/restock', vendorA, { quantity: 5 })).status).toBe(200);
  expect((await api('post', '/inventory/' + variantStock._id + '/restock', vendorA, { quantity: 6 })).status).toBe(200);
  expect((await api('post', '/orders/checkout', customer, { items: [{ productId: snapshot._id, sku: 'EDIT-M', quantity: 2 }], shippingAddress })).status).toBe(201);
  const edited = await api('put', '/products/' + snapshot._id, vendorA, { name: 'Updated Metadata', stock: snapshot.stock,
    variants: [...snapshot.variants, { sku: 'EDIT-L', color: 'Blue', size: 'L', price: 110, stock: 2 }] });
  expect(edited.status).toBe(200);
  expect(edited.body.data.stock).toBe(8);
  expect(edited.body.data.variants.find((variant) => variant.sku === 'EDIT-M').stock).toBe(8);
  expect(edited.body.data.variants.find((variant) => variant.sku === 'EDIT-L').stock).toBe(2);
  expect((await Inventory.findById(variantStock._id)).stock).toBe(8);
});

test('open-order SKUs cannot be renamed or removed before refund-safe cancellation', async () => {
  const checkout = await api('post', '/orders/checkout', customer, { items: [{ productId: productA._id, sku: 'OWN-A', quantity: 1 }], shippingAddress });
  expect(checkout.status).toBe(201);
  expect((await api('put', '/products/' + productA._id, vendorA, { sku: 'RENAMED' })).status).toBe(409);
  expect(await Inventory.findOne({ sku: 'OWN-A' })).toBeTruthy();
  expect((await api('patch', '/orders/' + checkout.body.data._id + '/status', vendorA, { status: 'cancelled' })).status).toBe(200);
  expect((await api('put', '/products/' + productA._id, vendorA, { sku: 'RENAMED' })).status).toBe(200);
});

test('deactivation blocks login, existing access, refresh and Socket privileges, and disconnects rooms', async () => {
  const login = await request(app).post('/api/v1/auth/login').send({ email: vendorA.email, password: 'Vendor123!' });
  expect(login.status).toBe(200);
  const disconnectSockets = jest.fn();
  const room = jest.fn(() => ({ disconnectSockets }));
  app.set('io', { in: room });
  expect((await api('patch', '/users/' + vendorA._id, admin, { isActive: false })).status).toBe(200);
  expect(room).toHaveBeenCalledWith('user_' + vendorA._id);
  expect(disconnectSockets).toHaveBeenCalledWith(true);
  expect((await api('get', '/inventory', vendorA)).status).toBe(401);
  expect((await request(app).post('/api/v1/auth/login').send({ email: vendorA.email, password: 'Vendor123!' })).status).toBe(401);
  expect((await request(app).post('/api/v1/auth/refresh-token').send({ refreshToken: login.body.data.refreshToken })).status).toBe(401);
  const socket = { handshake: { auth: { token: login.body.data.accessToken } } };
  await authenticateSocket(socket, jest.fn());
  expect(socket.user).toBeNull();
});

test('current DB role overrides stale signed Vendor claims for HTTP and Socket access', async () => {
  const stale = token(vendorA);
  expect((await api('patch', '/users/' + vendorA._id, admin, { role: 'customer' })).status).toBe(200);
  expect((await request(app).get('/api/v1/inventory').set('Authorization', 'Bearer ' + stale)).status).toBe(403);
  const socket = { handshake: { auth: { token: stale } } };
  await authenticateSocket(socket, jest.fn());
  expect(socket.user.role).toBe('customer');
});

test('mixed-Vendor checkout derives owners from catalog, emits isolated notifications, and restricts order writes', async () => {
  const events = [];
  app.set('io', { to: (room) => ({ emit: (event, data) => events.push({ room, event, data }) }) });
  const response = await api('post', '/orders/checkout', customer, { items: [
    { productId: productA._id, sku: 'OWN-A', quantity: 1, vendor: String(vendorB._id) },
    { productId: productB._id, sku: 'OWN-B', quantity: 2 },
  ], shippingAddress });
  expect(response.status).toBe(201);
  const order = response.body.data;
  expect(order.items[0].vendor).toBe(String(vendorA._id));
  const vendorEvents = events.filter((event) => event.room.startsWith('vendor_'));
  expect(vendorEvents).toHaveLength(2);
  expect(vendorEvents.find((event) => event.room === 'vendor_' + vendorA._id).data).toMatchObject({ finalAmount: 100, itemCount: 1 });
  expect(vendorEvents.find((event) => event.room === 'vendor_' + vendorB._id).data).toMatchObject({ finalAmount: 200, itemCount: 2 });
  expect(vendorEvents[0].data).not.toHaveProperty('items');
  expect(vendorEvents[0].data).not.toHaveProperty('shippingAddress');
  const detail = await api('get', '/orders/' + order._id, vendorA);
  expect(detail.body.data).toMatchObject({ finalAmount: 100, canUpdateStatus: false, vendorScopeOnly: true });
  expect(detail.body.data.items).toHaveLength(1);
  expect(detail.body.data).not.toHaveProperty('user');
  expect(detail.body.data).not.toHaveProperty('qrTrackingToken');
  expect((await api('patch', '/orders/' + order._id + '/status', vendorA, { status: 'shipping' })).status).toBe(409);
  const list = await api('get', '/orders', vendorA);
  expect(list.body.data.orders[0].items).toHaveLength(1);
  const unrelated = await Order.create({ orderCode: 'OTHER-ONLY', user: customer._id, items: [orderItem(productB)], shippingAddress, totalAmount: 100, finalAmount: 100 });
  expect((await api('get', '/orders/' + unrelated._id, vendorA)).status).toBe(403);
  expect((await api('patch', '/orders/' + unrelated._id + '/status', vendorA, { status: 'shipping' })).status).toBe(403);
});

test('Vendor paid notifications never include another Vendor amount or payment credentials', () => {
  const emits = [];
  const order = { _id: 'example', orderCode: 'EXAMPLE', status: 'pending', paymentStatus: 'paid', totalAmount: 200, discountAmount: 20, shippingFee: 50, finalAmount: 230, items: [orderItem(productA), orderItem(productB)] };
  notifyOrderVendors({ to: (room) => ({ emit: (event, data) => emits.push({ room, event, data }) }) }, order, 'payment_success');
  expect(emits).toHaveLength(2);
  expect(emits.every((event) => event.data.finalAmount === 90 && event.event === 'payment_success')).toBe(true);
  expect(emits[0].data).not.toHaveProperty('transactionNo');
});

test('offline order sync snapshots trusted ownership, notifies once, and preserves committed stock on notification failure', async () => {
  const events = [];
  app.set('io', { to: (room) => ({ emit: (event, data) => events.push({ room, event, data }) }) });
  const queued = { clientOrderId: 'OFFLINE-OWNERSHIP', items: [{ productId: productA._id, sku: 'OWN-A', quantity: 1, vendor: String(vendorB._id) }], shippingAddress };
  const first = await api('post', '/sync/offline-orders', customer, { orders: [queued] });
  expect(first.status).toBe(200);
  expect(first.body.data.syncedCount).toBe(1);
  const saved = await Order.findOne({ idempotencyKey: queued.clientOrderId });
  expect(String(saved.items[0].vendor)).toBe(String(vendorA._id));
  expect(events.filter((event) => event.room === 'vendor_' + vendorA._id)).toHaveLength(1);
  expect(events.some((event) => event.room === 'vendor_' + vendorB._id)).toBe(false);
  expect((await api('post', '/sync/offline-orders', customer, { orders: [queued] })).body.data.syncedCount).toBe(1);
  expect(events.filter((event) => event.room === 'vendor_' + vendorA._id)).toHaveLength(1);
  expect((await Inventory.findById(stockA._id)).stock).toBe(9);
  app.set('io', { to: () => { throw new Error('Test-only notification adapter unavailable'); } });
  const noNotify = await api('post', '/sync/offline-orders', customer, { orders: [{ ...queued, clientOrderId: 'OFFLINE-NOTIFICATION-FAIL' }] });
  expect(noNotify.body.data.syncedCount).toBe(1);
  expect(await Order.findOne({ idempotencyKey: 'OFFLINE-NOTIFICATION-FAIL' })).toBeTruthy();
  expect((await Inventory.findById(stockA._id)).stock).toBe(8);
});

test('Vendor review management only lists reviews of currently owned products', async () => {
  await Review.create([
    { product: productA._id, user: customer._id, rating: 4, comment: 'Own review' },
    { product: productB._id, user: customer._id, rating: 5, comment: 'Other review' },
  ]);
  const response = await api('get', '/reviews', vendorA);
  expect(response.status).toBe(200);
  expect(response.body.data.reviews.map((review) => review.comment)).toEqual(['Own review']);
});

test('analytics aggregates real orders, scoped merchandise discounts, COD and inclusive +07 dates', async () => {
  const makeOrder = (code, items, fields) => Order.create({ orderCode: code, user: customer._id, items, shippingAddress,
    totalAmount: items.reduce((sum, item) => sum + item.subtotal, 0), finalAmount: items.reduce((sum, item) => sum + item.subtotal, 0), ...fields });
  await makeOrder('MIXED-PAID', [orderItem(productA), orderItem(productB)], { paymentStatus: 'paid', paymentMethod: 'VNPAY', discountAmount: 20, shippingFee: 50, finalAmount: 230, createdAt: new Date('2026-10-01T17:00:00Z') });
  await makeOrder('COD-DELIVERED', [orderItem(productA, 60)], { status: 'delivered', paymentMethod: 'COD', paymentStatus: 'unpaid', createdAt: new Date('2026-10-01T00:00:00Z') });
  await makeOrder('CANCELLED', [orderItem(productA, 30)], { status: 'cancelled', paymentStatus: 'paid', createdAt: new Date('2026-10-01T00:00:00Z') });
  await makeOrder('UNPAID', [orderItem(productB, 400)], { paymentStatus: 'unpaid', paymentMethod: 'VNPAY', createdAt: new Date('2026-10-01T00:00:00Z') });
  await makeOrder('OUTSIDE', [orderItem(productA, 999)], { paymentStatus: 'paid', createdAt: new Date('2026-10-02T17:00:00Z') });
  const own = await api('get', '/analytics?from=2026-10-01&to=2026-10-02', vendorA);
  expect(own.status).toBe(200);
  expect(own.body.data.metrics).toMatchObject({ totalOrders: 3, revenue: 150, paidOrders: 2, cancelledOrders: 1, deliveredOrders: 1 });
  expect(own.body.data.revenueByDay).toEqual([{ date: '2026-10-01', revenue: 60, orders: 1 }, { date: '2026-10-02', revenue: 90, orders: 1 }]);
  const all = await api('get', '/analytics?from=2026-10-01&to=2026-10-02', admin);
  expect(all.body.data.metrics).toMatchObject({ totalOrders: 4, revenue: 240, paidOrders: 2 });
  const other = await api('get', '/analytics?from=2026-10-01&to=2026-10-02', vendorB);
  expect(other.body.data.metrics).toMatchObject({ totalOrders: 2, revenue: 90 });
});

test.each(['from=2026-02-30&to=2026-03-01', 'from=2026-10-02&to=2026-10-01', 'from=2024-01-01&to=2026-10-01', 'from=garbage'])('analytics rejects invalid date range %s', async (query) => {
  expect((await api('get', '/analytics?' + query, admin)).status).toBe(400);
});

test('empty analytics returns zero metrics and complete daily/status series', async () => {
  const response = await api('get', '/analytics?from=2026-10-01&to=2026-10-02', vendorA);
  expect(response.body.data.metrics).toMatchObject({ revenue: 0, totalOrders: 0 });
  expect(response.body.data.revenueByDay).toHaveLength(2);
  expect(response.body.data.orderStatuses).toHaveLength(5);
  expect(response.body.data.orderStatuses.every((row) => row.count === 0)).toBe(true);
});
