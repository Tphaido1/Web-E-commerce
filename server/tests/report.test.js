const request = require('supertest');
const app = require('../src/app');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');
const mongoose = require('mongoose');

const Order = require('../src/models/Order.model');
const User = require('../src/models/User.model');

jest.mock('../src/models/Order.model');
jest.mock('../src/models/User.model');

describe('Report & Invoicing API Integration Tests (Tuần 7 & 8)', () => {
  const sampleOrderId = new mongoose.Types.ObjectId();
  const mockAdminId = new mongoose.Types.ObjectId();
  const mockCustomerId = new mongoose.Types.ObjectId();

  const mockOrderData = {
    _id: sampleOrderId,
    orderCode: 'ORD-TEST-123456',
    user: mockCustomerId,
    items: [
      {
        name: 'Áo Thun Cotton Basic',
        sku: 'CLOTH-TS-001-W-M',
        price: 220000,
        quantity: 2,
        subtotal: 440000,
      },
    ],
    shippingAddress: {
      fullName: 'Nguyễn Văn A',
      phone: '0901234567',
      address: '123 Đường Thời Trang',
      ward: 'Phường 1',
      district: 'Quận 1',
      city: 'Hồ Chí Minh',
    },
    paymentMethod: 'COD',
    paymentStatus: 'paid',
    status: 'delivered',
    totalAmount: 440000,
    discountAmount: 40000,
    shippingFee: 30000,
    finalAmount: 430000,
    createdAt: new Date(),
  };

  beforeEach(() => {
    User.findById.mockImplementation((id) => Promise.resolve({
      _id: id,
      role: String(id) === String(mockAdminId) ? 'admin' : 'customer',
      isActive: true,
    }));

    Order.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([mockOrderData]),
    });
    Order.findById.mockImplementation((id) => ({
      lean: jest.fn().mockResolvedValue(
        String(id) === String(sampleOrderId) ? mockOrderData : null
      ),
    }));
  });

  const adminToken = jwt.sign(
    { sub: mockAdminId.toString(), role: 'admin', type: 'access' },
    env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  const customerToken = jwt.sign(
    { sub: mockCustomerId.toString(), role: 'customer', type: 'access' },
    env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  test('GET /api/v1/reports/orders/excel: Chặn 401 nếu thiếu Bearer token', async () => {
    const res = await request(app).get('/api/v1/reports/orders/excel');
    expect(res.status).toBe(401);
  });

  test('GET /api/v1/reports/orders/excel: Chặn 403 nếu tài khoản không phải Admin', async () => {
    const res = await request(app)
      .get('/api/v1/reports/orders/excel')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(403);
  });

  test('GET /api/v1/reports/orders/excel: Thành công xuất file Excel cho Admin', async () => {
    const res = await request(app)
      .get('/api/v1/reports/orders/excel')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/spreadsheetml\.sheet/);
  });

  test('GET /api/v1/reports/orders/:id/invoice-pdf: Chặn 401 nếu thiếu token', async () => {
    const res = await request(app).get(`/api/v1/reports/orders/${sampleOrderId}/invoice-pdf`);
    expect(res.status).toBe(401);
  });

  test('GET /api/v1/reports/orders/:id/invoice-pdf: Báo 404 nếu không tìm thấy đơn hàng', async () => {
    const nonExistentId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .get(`/api/v1/reports/orders/${nonExistentId}/invoice-pdf`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  test('GET /api/v1/reports/orders/:id/invoice-pdf: Xuất hóa đơn PDF kèm mã QR thành công', async () => {
    const res = await request(app)
      .get(`/api/v1/reports/orders/${sampleOrderId}/invoice-pdf`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
  });
});
