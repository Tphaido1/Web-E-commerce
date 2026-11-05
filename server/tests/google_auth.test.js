process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1/unused-test-placeholder';
process.env.JWT_SECRET = 'google-auth-test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'google-auth-test-refresh-secret';

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const User = require('../src/models/User.model');
const { verifyGoogleIdToken } = require('../src/services/googleAuth.service');

// Mock verifyGoogleIdToken để kiểm thử không phụ thuộc Google API thật
jest.mock('../src/services/googleAuth.service');

describe('Google Authentication (Google OAuth 2.0 / GSI)', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await User.deleteMany({});
  });

  test('TC-BE-06: Báo lỗi 400 nếu thiếu hoặc idToken rỗng', async () => {
    const res1 = await request(app).post('/api/v1/auth/google').send({});
    expect(res1.status).toBe(400);
    expect(res1.body.message).toMatch(/Google ID token là bắt buộc/);

    const res2 = await request(app).post('/api/v1/auth/google').send({ idToken: '   ' });
    expect(res2.status).toBe(400);
  });

  test('TC-BE-05: Báo lỗi 401 nếu Google token không hợp lệ hoặc hết hạn', async () => {
    verifyGoogleIdToken.mockRejectedValue(
      Object.assign(new Error('Google ID token không hợp lệ hoặc đã hết hạn'), { statusCode: 401 })
    );

    const res = await request(app).post('/api/v1/auth/google').send({ idToken: 'invalid.token.here' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/Google ID token không hợp lệ/);
  });

  test('TC-BE-01: Đăng ký và đăng nhập thành công cho người dùng Google mới', async () => {
    verifyGoogleIdToken.mockResolvedValue({
      googleId: 'google-sub-123456',
      email: 'newuser@gmail.com',
      name: 'Nguyen Van A',
      avatar: 'https://lh3.googleusercontent.com/avatar.jpg',
      emailVerified: true,
    });

    const res = await request(app).post('/api/v1/auth/google').send({ idToken: 'valid.newuser.token' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.user.email).toBe('newuser@gmail.com');
    expect(res.body.data.user.name).toBe('Nguyen Van A');
    expect(res.body.data.user.role).toBe('customer');
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();

    // Kiểm tra DB
    const createdUser = await User.findOne({ email: 'newuser@gmail.com' });
    expect(createdUser).not.toBeNull();
    expect(createdUser.googleId).toBe('google-sub-123456');
    expect(createdUser.authProvider).toBe('google');
    expect(createdUser.avatar).toBe('https://lh3.googleusercontent.com/avatar.jpg');
  });

  test('TC-BE-02: Tự động liên kết googleId nếu email đã đăng ký bằng mật khẩu trước đó', async () => {
    // Tạo sẵn tài khoản local
    await User.create({
      email: 'existing@example.com',
      password: 'OldPassword123!',
      name: 'Old Name',
      role: 'customer',
      authProvider: 'local',
    });

    verifyGoogleIdToken.mockResolvedValue({
      googleId: 'google-sub-linked-789',
      email: 'existing@example.com',
      name: 'Existing Google Name',
      avatar: 'https://lh3.googleusercontent.com/new-avatar.jpg',
      emailVerified: true,
    });

    const res = await request(app).post('/api/v1/auth/google').send({ idToken: 'valid.existing.token' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('existing@example.com');
    expect(res.body.data.accessToken).toBeDefined();

    // Kiểm tra DB đã được liên kết
    const updatedUser = await User.findOne({ email: 'existing@example.com' }).select('+password');
    expect(updatedUser.googleId).toBe('google-sub-linked-789');
    // Mật khẩu cũ chưa xác thực được vô hiệu hóa để chống chiếm quyền (Pre-account takeover GA-05)
    expect(await updatedUser.comparePassword('OldPassword123!')).toBe(false);
  });

  test('TC-BE-04: Từ chối đăng nhập nếu tài khoản bị khóa (isActive = false)', async () => {
    await User.create({
      email: 'blocked@example.com',
      googleId: 'google-blocked-111',
      isActive: false,
      authProvider: 'google',
    });

    verifyGoogleIdToken.mockResolvedValue({
      googleId: 'google-blocked-111',
      email: 'blocked@example.com',
      name: 'Blocked User',
      avatar: '',
      emailVerified: true,
    });

    const res = await request(app).post('/api/v1/auth/google').send({ idToken: 'valid.blocked.token' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/khóa/);
  });

  test('TC-BE-Admin: Kiểm tra quyền quản trị khi đăng nhập từ Admin Dashboard', async () => {
    // 1. Tài khoản thường cố đăng nhập với requiredRole: 'admin'
    verifyGoogleIdToken.mockResolvedValue({
      googleId: 'google-customer-only',
      email: 'customer@example.com',
      name: 'Customer Only',
      avatar: '',
      emailVerified: true,
    });

    const resCustomer = await request(app).post('/api/v1/auth/google').send({
      idToken: 'token.customer',
      requiredRole: 'admin',
    });
    expect(resCustomer.status).toBe(403);
    expect(resCustomer.body.message).toMatch(/quản trị/);

    // 2. Tài khoản đã có quyền admin đăng nhập thành công
    await User.create({
      email: 'admin@company.com',
      role: 'admin',
      authProvider: 'local',
      password: 'AdminPassword123!',
    });

    verifyGoogleIdToken.mockResolvedValue({
      googleId: 'google-admin-sub',
      email: 'admin@company.com',
      name: 'Admin Boss',
      avatar: '',
      emailVerified: true,
    });

    const resAdmin = await request(app).post('/api/v1/auth/google').send({
      idToken: 'token.admin',
      requiredRole: 'admin',
    });
    expect(resAdmin.status).toBe(200);
    expect(resAdmin.body.data.user.role).toBe('admin');
  });
});

