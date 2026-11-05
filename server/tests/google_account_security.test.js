/**
 * Kiểm thử luồng POST /api/v1/auth/google với DB thật (mongodb-memory-server).
 * verifyGoogleIdToken được mock; các test này nhắm vào logic tạo/liên kết tài khoản.
 * Đặt tại: server/tests/google_account_security.test.js
 */
process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1/unused-test-placeholder';
process.env.JWT_SECRET = 'google-account-test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'google-account-test-refresh-secret';

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const User = require('../src/models/User.model');
const { verifyGoogleIdToken } = require('../src/services/googleAuth.service');

jest.mock('../src/services/googleAuth.service');

const profile = (over = {}) => ({
  googleId: 'sub-1',
  email: 'student@gmail.com',
  name: 'Student',
  avatar: '',
  emailVerified: true,
  ...over,
});
const google = (body = {}) => request(app).post('/api/v1/auth/google').send({ idToken: 'x.y.z', ...body });

describe('Đăng nhập Google - logic tài khoản', () => {
  let mongoServer;
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await User.init();
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });
  beforeEach(async () => {
    jest.clearAllMocks();
    await User.deleteMany({});
  });

  test('GA-01: Token Google đổi được access/refresh token dùng được thật (refresh + logout)', async () => {
    verifyGoogleIdToken.mockResolvedValue(profile());
    const res = await google();
    expect(res.status).toBe(200);
    const { accessToken, refreshToken } = res.body.data;

    const refreshed = await request(app).post('/api/v1/auth/refresh-token').send({ refreshToken });
    expect(refreshed.status).toBe(200);

    const logout = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${refreshed.body.data.accessToken || accessToken}`);
    expect(logout.status).toBe(200);
  });

  test('GA-02: Khách không thể tự nâng quyền bằng cách gửi requiredRole/role giả', async () => {
    verifyGoogleIdToken.mockResolvedValue(profile({ email: 'sneaky@gmail.com', googleId: 'sub-sneaky' }));
    const res = await google({ role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('customer');
    const asAdmin = await google({ requiredRole: 'admin' });
    expect(asAdmin.status).toBe(403);
  });

  test('GA-03: Tài khoản chỉ dùng Google (không mật khẩu) không đăng nhập được bằng mật khẩu, không lỗi 500', async () => {
    verifyGoogleIdToken.mockResolvedValue(profile());
    await google();
    for (const password of ['anything', 'undefined', 'null', ' ']) {
      const res = await request(app).post('/api/v1/auth/login').send({ email: 'student@gmail.com', password });
      expect(res.status).toBe(401);
    }
  });

  test('GA-04: Hai callback Google đến cùng lúc (One Tap + nút bấm) cho người dùng MỚI -> cả hai thành công, chỉ 1 tài khoản', async () => {
    verifyGoogleIdToken.mockResolvedValue(profile({ email: 'race@gmail.com', googleId: 'sub-race' }));
    const [a, b] = await Promise.all([google(), google()]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(await User.countDocuments({ email: 'race@gmail.com' })).toBe(1);
  });

  test('GA-05 (BẢO MẬT): Người khác đăng ký trước bằng email của nạn nhân; sau khi nạn nhân đăng nhập Google, mật khẩu của kẻ đó PHẢI hết hiệu lực', async () => {
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'victim@gmail.com', password: 'AttackerKnows1!', name: 'x' });
    expect(reg.status).toBe(201); // đăng ký không cần xác minh email

    verifyGoogleIdToken.mockResolvedValue(profile({ email: 'victim@gmail.com', googleId: 'sub-victim' }));
    expect((await google()).status).toBe(200); // nạn nhân đăng nhập bằng Google, tài khoản được liên kết

    const attacker = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'victim@gmail.com', password: 'AttackerKnows1!' });
    expect(attacker.status).toBe(401);
  });

  test('GA-06 (BẢO MẬT, mức thấp): Email trùng nhưng googleId khác với tài khoản đã liên kết -> PHẢI từ chối', async () => {
    await User.create({ email: 'shared@company.com', googleId: 'sub-original', authProvider: 'google' });
    verifyGoogleIdToken.mockResolvedValue(profile({ email: 'shared@company.com', googleId: 'sub-someone-else' }));
    const res = await google();
    expect([401, 403, 409]).toContain(res.status);
  });

  test('GA-07: Vendor đăng nhập trang quản trị bằng Google (admin UI cho phép role vendor)', async () => {
    await User.create({ email: 'vendor@shop.com', role: 'vendor', password: 'VendorPass123!', authProvider: 'local' });
    verifyGoogleIdToken.mockResolvedValue(profile({ email: 'vendor@shop.com', googleId: 'sub-vendor' }));
    const res = await google({ requiredRole: 'admin' });
    expect(res.status).toBe(200);
  });
});

