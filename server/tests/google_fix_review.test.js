/** Kiểm tra bổ sung sau khi sửa lỗi Google (phần còn sót lại của GA-05 và đổi mật khẩu cho tài khoản Google). */
process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1/unused-test-placeholder';
process.env.JWT_SECRET = 'google-fix-review-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'google-fix-review-refresh-secret';

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const User = require('../src/models/User.model');
const { verifyGoogleIdToken } = require('../src/services/googleAuth.service');

jest.mock('../src/services/googleAuth.service');

describe('Rà soát sau khi sửa lỗi Google', () => {
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

  test('FR-01: Access token kẻ xấu đã lấy được lúc đăng ký trước đó KHÔNG còn dùng được sau khi nạn nhân đăng nhập Google', async () => {
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'victim@gmail.com', password: 'AttackerKnows1!', name: 'x' });
    const attackerAccess = reg.body.data.accessToken;
    const attackerRefresh = reg.body.data.refreshToken;

    verifyGoogleIdToken.mockResolvedValue({ googleId: 'sub-victim', email: 'victim@gmail.com', name: 'V', avatar: '', emailVerified: true });
    expect((await request(app).post('/api/v1/auth/google').send({ idToken: 'x.y.z' })).status).toBe(200);

    const refresh = await request(app).post('/api/v1/auth/refresh-token').send({ refreshToken: attackerRefresh });
    expect(refresh.status).toBe(401); // refresh token đã bị thu hồi

    const profile = await request(app).get('/api/v1/users/profile').set('Authorization', `Bearer ${attackerAccess}`);
    expect(profile.status).toBe(401); // access token cũ phải bị vô hiệu
  });

  test('FR-02: Tài khoản chỉ dùng Google đổi mật khẩu không gây lỗi 500', async () => {
    verifyGoogleIdToken.mockResolvedValue({ googleId: 'sub-g', email: 'g@gmail.com', name: 'G', avatar: '', emailVerified: true });
    const login = await request(app).post('/api/v1/auth/google').send({ idToken: 'x.y.z' });
    const res = await request(app)
      .put('/api/v1/users/change-password')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .send({ currentPassword: 'whatever', newPassword: 'NewPassword123!' });
    expect(res.status).toBeLessThan(500);
  });

  test('FR-03: Hai callback song song cho người dùng mới: cả hai refresh token đều còn dùng được', async () => {
    verifyGoogleIdToken.mockResolvedValue({ googleId: 'sub-r', email: 'r@gmail.com', name: 'R', avatar: '', emailVerified: true });
    const [a, b] = await Promise.all([1, 2].map(() => request(app).post('/api/v1/auth/google').send({ idToken: 'x.y.z' })));
    expect([a.status, b.status]).toEqual([200, 200]);
    const ra = await request(app).post('/api/v1/auth/refresh-token').send({ refreshToken: a.body.data.refreshToken });
    const rb = await request(app).post('/api/v1/auth/refresh-token').send({ refreshToken: b.body.data.refreshToken });
    expect([ra.status, rb.status]).toEqual([200, 200]);
  });
});

