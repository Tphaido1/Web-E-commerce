const request = require('supertest');
const app = require('../src/app');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');
const mongoose = require('mongoose');

jest.mock('../src/models/Order.model', () => ({
  findOne: jest.fn().mockReturnValue({
    lean: jest.fn().mockResolvedValue(null),
  }),
}));

describe('E2E / Runtime API Integration Tests (Level 7 Verification Ladder)', () => {
  const fakeUserId = new mongoose.Types.ObjectId();
  const validAccessToken = jwt.sign(
    { sub: fakeUserId.toString(), role: 'customer', type: 'access' },
    env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  test('GET /api/v1/healthcheck: Endpoint hoạt động bình thường', async () => {
    const res = await request(app).get('/api/v1/healthcheck');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
  });

  test('POST /api/v1/orders/checkout: Từ chối 401 nếu không có Bearer token', async () => {
    const res = await request(app).post('/api/v1/orders/checkout').send({
      items: [{ sku: 'SKU-TEST', quantity: 1 }],
      shippingAddress: { fullName: 'A', phone: '090', address: 'HN' },
    });

    expect(res.status).toBe(401);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toMatch(/Vui lòng cung cấp Access Token/);
  });

  test('POST /api/v1/coupons/apply: Báo lỗi 400 nếu thiếu mã giảm giá', async () => {
    const res = await request(app).post('/api/v1/coupons/apply').send({
      orderTotal: 500000,
    });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toMatch(/cung cấp mã giảm giá/);
  });

  test('GET /api/v1/orders/track/ORD-NOT-FOUND: Trả về 404 nếu mã đơn không tồn tại', async () => {
    const res = await request(app).get('/api/v1/orders/track/ORD-99999999-NOTFOUND');

    expect(res.status).toBe(404);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toMatch(/Không tìm thấy thông tin đơn hàng/);
  });
});
