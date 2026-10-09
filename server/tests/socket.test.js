process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1/socket-unit-placeholder';
process.env.JWT_SECRET = 'socket-unit-access-test-only';
process.env.JWT_REFRESH_SECRET = 'socket-unit-refresh-test-only';
const {
  initializeSocket,
  authenticateSocket,
  getIo,
  notifyAdmin,
  notifyUser,
  notifyOrderUpdate,
} = require('../src/config/socket');
const http = require('http');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');
const mongoose = require('mongoose');
const User = require('../src/models/User.model');

describe('Socket.io Real-time Engine & Room Partitioning Tests (Week 5)', () => {
  let httpServer;
  let io;

  beforeAll((done) => {
    httpServer = http.createServer();
    io = initializeSocket(httpServer);
    httpServer.listen(0, () => {
      done();
    });
  });

  afterAll((done) => {
    try {
      if (io) {
        io.close();
      }
      if (httpServer && httpServer.listening) {
        httpServer.close(done);
      } else {
        done();
      }
    } catch {
      done();
    }
  });

  test('initializeSocket: Khởi tạo thành công Socket.io Server instance', () => {
    expect(io).toBeDefined();
    expect(getIo()).toBe(io);
  });

  test('notifyAdmin: Phát sự kiện tới đúng room "role_admin"', () => {
    const toSpy = jest.spyOn(io, 'to');
    const mockEmit = jest.fn();
    toSpy.mockReturnValue({ emit: mockEmit });

    notifyAdmin('new_order', { orderCode: 'ORD-TEST-001', finalAmount: 200000 });

    expect(toSpy).toHaveBeenCalledWith('role_admin');
    expect(mockEmit).toHaveBeenCalledWith('new_order', { orderCode: 'ORD-TEST-001', finalAmount: 200000 });

    toSpy.mockRestore();
  });

  test('notifyUser: Phát sự kiện tới đúng room cá nhân "user_{id}"', () => {
    const toSpy = jest.spyOn(io, 'to');
    const mockEmit = jest.fn();
    toSpy.mockReturnValue({ emit: mockEmit });

    notifyUser('user_12345', 'payment_success', { status: 'paid' });

    expect(toSpy).toHaveBeenCalledWith('user_user_12345');
    expect(mockEmit).toHaveBeenCalledWith('payment_success', { status: 'paid' });

    toSpy.mockRestore();
  });

  test('notifyOrderUpdate: Phát sự kiện tới đúng room đơn hàng "order_{id}"', () => {
    const toSpy = jest.spyOn(io, 'to');
    const mockEmit = jest.fn();
    toSpy.mockReturnValue({ emit: mockEmit });

    notifyOrderUpdate('order_9999', 'order_status_updated', { status: 'shipping' });

    expect(toSpy).toHaveBeenCalledWith('order_order_9999');
    expect(mockEmit).toHaveBeenCalledWith('order_status_updated', { status: 'shipping' });

    toSpy.mockRestore();
  });

  test('JWT Handshake Middleware: Giải mã token chính xác và cho phép xác thực', async () => {
    const fakeAdminId = new mongoose.Types.ObjectId().toString();
    const userLookup = jest.spyOn(User, 'findById').mockReturnValue({ select: jest.fn().mockResolvedValue({ _id: fakeAdminId, role: 'admin', isActive: true }) });
    const adminToken = jwt.sign({ sub: fakeAdminId, role: 'admin', type: 'access' }, env.JWT_SECRET);

    const mockSocket = {
      handshake: {
        auth: { token: adminToken },
      },
    };
    const nextFn = jest.fn();

    await authenticateSocket(mockSocket, nextFn);

    expect(nextFn).toHaveBeenCalledWith();
    expect(mockSocket.user).toBeDefined();
    expect(mockSocket.user.sub).toBe(fakeAdminId);
    expect(mockSocket.user.role).toBe('admin');
    userLookup.mockRestore();
  });
});
