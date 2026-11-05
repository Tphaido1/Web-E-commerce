/**
 * Kiểm thử verifyGoogleIdToken THẬT (không mock service).
 * Tự tạo cặp khóa RSA, ký ID token giả như Google, và chặn bước tải chứng chỉ Google
 * để test chạy offline. Đặt tại: server/tests/google_token_verify.test.js
 */
process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1/unused-test-placeholder';
process.env.JWT_SECRET = 'google-verify-test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'google-verify-test-refresh-secret';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const rsa = () => crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const googleKeys = rsa(); // khóa "của Google"
const attackerKeys = rsa(); // khóa của kẻ giả mạo
const GOOGLE_CERTS = { k1: googleKeys.publicKey.export({ type: 'spki', format: 'pem' }) };

const MY_CLIENT_ID = 'my-shop.apps.googleusercontent.com';
const OTHER_APP_CLIENT_ID = 'someone-elses-app.apps.googleusercontent.com';
const now = () => Math.floor(Date.now() / 1000);

/** Nạp service với GOOGLE_CLIENT_ID cho trước, chặn việc tải chứng chỉ từ Google */
function loadService(clientId) {
  let service;
  jest.isolateModules(() => {
    process.env.GOOGLE_CLIENT_ID = clientId;
    const { OAuth2Client } = require('google-auth-library');
    jest.spyOn(OAuth2Client.prototype, 'getFederatedSignonCertsAsync').mockResolvedValue({ certs: GOOGLE_CERTS });
    service = require('../src/services/googleAuth.service');
  });
  return service;
}

function makeToken(claims = {}, { key = googleKeys.privateKey, kid = 'k1' } = {}) {
  const payload = {
    iss: 'https://accounts.google.com',
    aud: MY_CLIENT_ID,
    sub: '1234567890',
    email: 'Student@Gmail.com',
    email_verified: true,
    name: 'Nguyen Van A',
    picture: 'https://lh3.googleusercontent.com/a.jpg',
    iat: now() - 10,
    exp: now() + 3600,
    ...claims,
  };
  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
  return jwt.sign(payload, key, { algorithm: 'RS256', keyid: kid });
}

describe('verifyGoogleIdToken - kiểm tra token thật (Google OAuth + One Tap dùng chung ID token)', () => {
  let service;
  beforeAll(() => {
    service = loadService(MY_CLIENT_ID);
  });

  test('TV-01: Token hợp lệ -> trả về hồ sơ, email chuẩn hóa chữ thường', async () => {
    const profile = await service.verifyGoogleIdToken(makeToken());
    expect(profile).toEqual({
      googleId: '1234567890',
      email: 'student@gmail.com',
      name: 'Nguyen Van A',
      avatar: 'https://lh3.googleusercontent.com/a.jpg',
      emailVerified: true,
    });
  });

  test('TV-02: Thiếu hoặc rỗng token -> 400', async () => {
    await expect(service.verifyGoogleIdToken('')).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.verifyGoogleIdToken(undefined)).rejects.toMatchObject({ statusCode: 400 });
  });

  test('TV-03: Token cấp cho ỨNG DỤNG KHÁC (sai audience) -> 401', async () => {
    await expect(service.verifyGoogleIdToken(makeToken({ aud: OTHER_APP_CLIENT_ID }))).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  test('TV-04: Token hết hạn -> 401', async () => {
    const expired = makeToken({ iat: now() - 7200, exp: now() - 3600 });
    await expect(service.verifyGoogleIdToken(expired)).rejects.toMatchObject({ statusCode: 401 });
  });

  test('TV-05: Sai issuer (không phải Google) -> 401', async () => {
    await expect(service.verifyGoogleIdToken(makeToken({ iss: 'https://evil.example.com' }))).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  test('TV-06: Chữ ký giả (ký bằng khóa khác) -> 401', async () => {
    const forged = makeToken({}, { key: attackerKeys.privateKey });
    await expect(service.verifyGoogleIdToken(forged)).rejects.toMatchObject({ statusCode: 401 });
  });

  test('TV-07: Email Google chưa xác thực -> 401', async () => {
    await expect(service.verifyGoogleIdToken(makeToken({ email_verified: false }))).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  test('TV-08: Token không có email -> 401', async () => {
    await expect(service.verifyGoogleIdToken(makeToken({ email: undefined }))).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  test('TV-09: Chuỗi rác không phải JWT -> 401', async () => {
    await expect(service.verifyGoogleIdToken('not.a.jwt')).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe('Cấu hình thiếu GOOGLE_CLIENT_ID', () => {
  test('TV-10: Khi GOOGLE_CLIENT_ID để trống, token của ỨNG DỤNG KHÁC vẫn PHẢI bị từ chối', async () => {
    const service = loadService('');
    const tokenFromOtherApp = makeToken({ aud: OTHER_APP_CLIENT_ID, email: 'victim@gmail.com' });
    await expect(service.verifyGoogleIdToken(tokenFromOtherApp)).rejects.toBeDefined();
  });
});

