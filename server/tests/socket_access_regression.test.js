process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1/unused-test-placeholder';
process.env.JWT_SECRET = 'socket-access-regression-test-only';
process.env.JWT_REFRESH_SECRET = 'socket-refresh-regression-test-only';
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');
jest.mock('socket.io', () => ({ Server: jest.fn(() => ({ use: jest.fn(), on: jest.fn() })) }));
jest.mock('../src/models/Order.model', () => ({ findOne: jest.fn() }));
jest.mock('../src/models/User.model', () => ({ findById: jest.fn() }));
const Order = require('../src/models/Order.model');
const { initializeSocket, authenticateSocket } = require('../src/config/socket');
const owner = new mongoose.Types.ObjectId().toString();
const other = new mongoose.Types.ObjectId().toString();
const orderId = new mongoose.Types.ObjectId().toString();

beforeEach(() => {
  jest.clearAllMocks();
  Order.findOne.mockImplementation((filter) => ({ select: jest.fn().mockResolvedValue(
    (filter['items.vendor'] ? filter['items.vendor'] === owner : !filter.user || filter.user === owner)
      ? { _id: orderId, items: [{ vendor: owner }] } : null) }));
});

test.each([
  ['guest', null, false],
  ['unrelated customer', { sub: other, role: 'customer', type: 'access' }, false],
  ['owner', { sub: owner, role: 'customer', type: 'access' }, true],
  ['admin', { sub: other, role: 'admin', type: 'access' }, true],
  ['unrelated vendor', { sub: other, role: 'vendor', type: 'access' }, false],
  ['owning vendor', { sub: owner, role: 'vendor', type: 'access' }, true],
  ['expired owner', { sub: owner, role: 'customer', type: 'access', exp: 1 }, false],
])('%s private order subscription authorized=%s', async (label, user, allowed) => {
  const io = initializeSocket({});
  const connect = io.on.mock.calls.find(([event]) => event === 'connection')[1];
  const handlers = {};
  const socket = { id: 'regression', user, connected: true, join: jest.fn().mockResolvedValue(), on: jest.fn((event, fn) => { handlers[event] = fn; }) };
  connect(socket);
  socket.join.mockClear();
  const acknowledge = jest.fn();
  await handlers.join_order_room(orderId, acknowledge);
  expect(acknowledge).toHaveBeenCalledWith({ success: allowed });
  if (allowed) expect(socket.join).toHaveBeenCalledWith('order_' + orderId);
  else expect(socket.join).not.toHaveBeenCalled();
});

test('owning Vendor cannot subscribe to a mixed-Vendor full-order room', async () => {
  Order.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue({ _id: orderId, items: [{ vendor: owner }, { vendor: other }] }) });
  const io = initializeSocket({});
  const connect = io.on.mock.calls.find(([event]) => event === 'connection')[1];
  const handlers = {};
  const socket = { id: 'mixed', user: { sub: owner, role: 'vendor' }, connected: true, join: jest.fn(), on: jest.fn((event, fn) => { handlers[event] = fn; }) };
  connect(socket);
  socket.join.mockClear();
  const acknowledge = jest.fn();
  await handlers.join_order_room(orderId, acknowledge);
  expect(acknowledge).toHaveBeenCalledWith({ success: false });
  expect(socket.join).not.toHaveBeenCalled();
});

test('non-access token signed by access secret never grants admin socket identity', async () => {
  const socket = { handshake: { auth: { token: jwt.sign({ sub: owner, role: 'admin', type: 'refresh' }, env.JWT_SECRET) } } };
  await authenticateSocket(socket, jest.fn());
  expect(socket.user).toBeNull();
});
