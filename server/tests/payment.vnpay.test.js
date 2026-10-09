process.env.NODE_ENV = 'test';
process.env.VNP_TMN_CODE = '2QXUI4J4';
process.env.VNP_HASH_SECRET = 'payment-unit-test-only-secret';
process.env.MONGO_URI = 'mongodb://127.0.0.1/unused-payment-unit';
process.env.JWT_SECRET = 'payment-unit-access-secret';
process.env.JWT_REFRESH_SECRET = 'payment-unit-refresh-secret';
const {
  createVNPayPaymentUrl,
  vnpayReturn,
  vnpayIpn,
  sortObject,
  calculateVNPaySecureHash,
  verifyVNPaySecureHash,
} = require('../src/controllers/payment.controller');
const Order = require('../src/models/Order.model');
const AuditLogService = require('../src/services/auditLog.service');
const socketConfig = require('../src/config/socket');
const mongoose = require('mongoose');

jest.mock('../src/models/Order.model');
jest.mock('../src/services/auditLog.service');
jest.mock('../src/config/socket');

const signCallback = (params) => {
  const env = require('../src/config/env');
  const payload = { vnp_TmnCode: env.VNP_TMN_CODE, vnp_TransactionStatus: '00', ...params };
  return { ...payload, vnp_SecureHash: calculateVNPaySecureHash(payload, env.VNP_HASH_SECRET) };
};

const applyPaymentUpdate = (order) => {
  order.paymentMethod = order.paymentMethod || 'VNPAY';
  Order.findOneAndUpdate.mockImplementation(async (filter, update, options) => {
    expect(filter).toEqual({ _id: order._id, status: order.status, paymentStatus: order.paymentStatus, paymentMethod: 'VNPAY' });
    expect(options).toEqual({ new: true, runValidators: true });
    Object.assign(order, update.$set);
    order.trackingHistory.push(update.$push.trackingHistory);
    return order;
  });
};

describe('VNPay Payment Gateway & Security Checksum Tests (Week 5)', () => {
  const secretKey = 'TEST_VNP_SECRET_KEY_FOR_TESTING';
  const mockUserId = new mongoose.Types.ObjectId();
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      user: {
        _id: mockUserId,
        role: 'customer',
      },
      headers: {},
      body: {},
      query: {},
      params: {},
      socket: { remoteAddress: '127.0.0.1' },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  describe('1. Checksum & Security Signature Algorithm', () => {
    test('sortObject: Sắp xếp các tham số theo bảng chữ cái chuẩn xác', () => {
      const input = {
        vnp_Version: '2.1.0',
        vnp_Amount: 10000000,
        vnp_Command: 'pay',
        vnp_TxnRef: 'ORD-12345',
      };
      const sorted = sortObject(input);
      const keys = Object.keys(sorted);

      expect(keys).toEqual(['vnp_Amount', 'vnp_Command', 'vnp_TxnRef', 'vnp_Version']);
    });

    test('VNPay signature uses standard ampersand-delimited already encoded query', () => {
      const params = { vnp_TxnRef: 'ORD/1', vnp_OrderInfo: 'Thanh toan don hang ORD/1', vnp_Amount: 25000000 };
      const canonical = 'vnp_Amount=25000000&vnp_OrderInfo=Thanh+toan+don+hang+ORD%2F1&vnp_TxnRef=ORD%2F1';
      const expected = require('crypto').createHmac('sha512', secretKey).update(canonical).digest('hex');
      expect(calculateVNPaySecureHash(params, secretKey)).toBe(expected);
    });

    test('HMAC-SHA512: Tính toán chữ ký bảo mật và xác thực chữ ký chuẩn xác', () => {
      const params = {
        vnp_Amount: '10000000',
        vnp_Command: 'pay',
        vnp_TxnRef: 'ORD-99999',
        vnp_ResponseCode: '00',
      };
      const secureHash = calculateVNPaySecureHash(params, secretKey);

      expect(secureHash).toBeDefined();
      expect(typeof secureHash).toBe('string');
      expect(secureHash.length).toBe(128); // SHA-512 hex length = 128 characters

      // Kiểm tra xác thực chữ ký đúng
      const queryWithHash = { ...params, vnp_SecureHash: secureHash };
      expect(verifyVNPaySecureHash(queryWithHash, secretKey)).toBe(true);

      // Chữ ký giả mạo (tampering amount) -> Phải bị từ chối
      const tamperedQuery = { ...params, vnp_Amount: '50000', vnp_SecureHash: secureHash };
      expect(verifyVNPaySecureHash(tamperedQuery, secretKey)).toBe(false);

      // Chữ ký bị đổi hash -> Phải bị từ chối
      const corruptedQuery = { ...params, vnp_SecureHash: '1234567890abcdef' };
      expect(verifyVNPaySecureHash(corruptedQuery, secretKey)).toBe(false);
    });
  });

  describe('2. createVNPayPaymentUrl (Tạo URL thanh toán)', () => {
    test('Tạo URL thanh toán thành công với số tiền chuẩn xác (x100)', async () => {
      const orderId = new mongoose.Types.ObjectId();
      req.body = { orderId, bankCode: 'NCB' };

      const mockOrder = {
        _id: orderId,
        orderCode: 'ORD-20260926-VNP01',
        user: mockUserId,
        finalAmount: 250000, // 250.000 VND
        paymentStatus: 'unpaid', paymentMethod: 'VNPAY',
        status: 'pending',
      };
      Order.findById.mockResolvedValue(mockOrder);
      AuditLogService.logOrderChange.mockResolvedValue({});

      await createVNPayPaymentUrl(req, res, next);

      const paymentUrl = new URL(res.json.mock.calls[0][0].data.paymentUrl);
      expect(paymentUrl.searchParams.get('vnp_Amount')).toBe('25000000');
      expect(paymentUrl.searchParams.get('vnp_TxnRef')).toBe(mockOrder.orderCode);
      expect(paymentUrl.search).not.toContain('[object%20Object]');
      expect(Order.findById).toHaveBeenCalledWith(orderId);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          data: expect.objectContaining({
            orderCode: 'ORD-20260926-VNP01',
            amount: 250000,
            paymentUrl: expect.stringContaining('vnp_Amount=25000000'), // 250k * 100 = 25M
          }),
        })
      );
    });

    test('Từ chối tạo URL nếu đơn hàng đã thanh toán trước đó', async () => {
      const orderId = new mongoose.Types.ObjectId();
      req.body = { orderId };

      Order.findById.mockResolvedValue({
        _id: orderId,
        user: mockUserId,
        paymentStatus: 'paid', paymentMethod: 'VNPAY', // Đã thanh toán
      });

      await createVNPayPaymentUrl(req, res, next);

      expect(next).toHaveBeenCalled();
      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
      expect(err.message).toMatch(/đã được thanh toán/);
    });

    test('Từ chối nếu người dùng không phải chủ đơn hàng hoặc Admin', async () => {
      const orderId = new mongoose.Types.ObjectId();
      req.body = { orderId };
      req.user.role = 'customer';

      Order.findById.mockResolvedValue({
        _id: orderId,
        user: new mongoose.Types.ObjectId(), // User khác
        paymentStatus: 'unpaid', paymentMethod: 'VNPAY',
      });

      await createVNPayPaymentUrl(req, res, next);

      expect(next).toHaveBeenCalled();
      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(403);
      expect(err.message).toMatch(/không có quyền thanh toán/);
    });
  });

  describe('3. vnpayReturn (Xử lý giao diện Return URL)', () => {
    test('Signed browser return reports pending and never commits payment before IPN', async () => {
      const mockOrder = {
        _id: new mongoose.Types.ObjectId(),
        orderCode: 'ORD-RETURN-01',
        user: mockUserId,
        finalAmount: 500000,
        paymentStatus: 'unpaid', paymentMethod: 'VNPAY',
        status: 'pending',
        shippingAddress: { fullName: 'Trần Văn X' },
        trackingHistory: [],
        save: jest.fn().mockResolvedValue(true),
      };
      Order.findOne.mockResolvedValue(mockOrder);
      if (mockOrder.trackingHistory) applyPaymentUpdate(mockOrder);
      AuditLogService.logPaymentTransaction.mockResolvedValue({});

      // Tạo params chuẩn và ký
      const params = {
        vnp_Amount: '50000000',
        vnp_BankCode: 'NCB',
        vnp_OrderInfo: 'Thanh toan don hang ORD-RETURN-01',
        vnp_PayDate: '20260926200000',
        vnp_ResponseCode: '00',
        vnp_TmnCode: '2QXUI4J4',
        vnp_TransactionNo: '14567890',
        vnp_TxnRef: 'ORD-RETURN-01',
      };
      // Lấy secret từ env thực tế
      const env = require('../src/config/env');
      const hash = calculateVNPaySecureHash(params, env.VNP_HASH_SECRET);
      req.query = signCallback(params);

      await vnpayReturn(req, res, next);

      expect(mockOrder.paymentStatus).toBe('unpaid');
      expect(mockOrder.status).toBe('pending');
      expect(mockOrder.save).not.toHaveBeenCalled();
      expect(Order.findOneAndUpdate).not.toHaveBeenCalled();
      // Đảm bảo bắn sự kiện socket cho Admin và Customer
      expect(socketConfig.notifyAdmin).not.toHaveBeenCalled();
      expect(socketConfig.notifyUser).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          data: expect.objectContaining({
            isSuccess: false,
            isPending: true,
            orderCode: 'ORD-RETURN-01',
          }),
        })
      );
    });

    test.each([['wrong amount', 'pending', '100'], ['cancelled order', 'cancelled', '50000000']])('Validly signed return rejects %s without marking paid', async (label, status, amount) => {
      const mockOrder = { _id: new mongoose.Types.ObjectId(), orderCode: 'ORD-INVALID-RETURN', user: mockUserId, finalAmount: 500000, paymentStatus: 'unpaid', paymentMethod: 'VNPAY', status, save: jest.fn(), trackingHistory: [] };
      Order.findOne.mockResolvedValue(mockOrder);
      if (mockOrder.trackingHistory) applyPaymentUpdate(mockOrder);
      const env = require('../src/config/env');
      const params = { vnp_TxnRef: mockOrder.orderCode, vnp_ResponseCode: '00', vnp_Amount: amount };
      req.query = signCallback(params);
      await vnpayReturn(req, res, next);
      expect(next.mock.calls[0][0].statusCode).toBe(400);
      expect(mockOrder.paymentStatus).toBe('unpaid');
      expect(mockOrder.save).not.toHaveBeenCalled();
    });

    test('Báo lỗi 400 nếu chữ ký số của return URL bị sai lệch (Checksum Tampering)', async () => {
      req.query = {
        vnp_TxnRef: 'ORD-TAMPER-01',
        vnp_ResponseCode: '00',
        vnp_SecureHash: 'INVALID_SECURE_HASH',
      };

      await vnpayReturn(req, res, next);

      expect(next).toHaveBeenCalled();
      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
      expect(err.message).toMatch(/Chữ ký số không hợp lệ/);
    });
  });

  describe('4. vnpayIpn (Webhook Server-to-Server & Idempotent Verification)', () => {
    const env = require('../src/config/env');

    test('IPN Checksum Failed: Trả về RspCode 97', async () => {
      req.query = {
        vnp_TxnRef: 'ORD-IPN-01',
        vnp_SecureHash: 'INVALID_CHECKSUM',
      };

      await vnpayIpn(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        RspCode: '97',
        Message: 'Checksum failed',
      });
    });

    test('IPN Order Not Found: Trả về RspCode 01', async () => {
      const params = {
        vnp_TxnRef: 'ORD-NOT-FOUND',
        vnp_Amount: '10000000',
        vnp_ResponseCode: '00',
      };
      const hash = calculateVNPaySecureHash(params, env.VNP_HASH_SECRET);
      req.query = signCallback(params);

      Order.findOne.mockResolvedValue(null);

      await vnpayIpn(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        RspCode: '01',
        Message: 'Order not found',
      });
    });

    test('IPN Invalid Amount: Trả về RspCode 04 nếu số tiền không khớp với đơn hàng', async () => {
      const params = {
        vnp_TxnRef: 'ORD-WRONG-AMT',
        vnp_Amount: '99999999', // Sai số tiền
        vnp_ResponseCode: '00',
      };
      const hash = calculateVNPaySecureHash(params, env.VNP_HASH_SECRET);
      req.query = signCallback(params);

      Order.findOne.mockResolvedValue({
        orderCode: 'ORD-WRONG-AMT',
        finalAmount: 100000, // Đơn 100k (tương ứng 10000000 trong VNPay)
      });

      await vnpayIpn(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        RspCode: '04',
        Message: 'Invalid amount',
      });
    });

    test('IPN IDEMPOTENT TEST: Trả về RspCode 02 nếu đơn hàng đã được xác nhận thanh toán trước đó', async () => {
      const params = {
        vnp_TxnRef: 'ORD-ALREADY-PAID',
        vnp_Amount: '10000000',
        vnp_ResponseCode: '00',
      };
      const hash = calculateVNPaySecureHash(params, env.VNP_HASH_SECRET);
      req.query = signCallback(params);

      const mockAlreadyPaidOrder = {
        orderCode: 'ORD-ALREADY-PAID',
        finalAmount: 100000,
        paymentStatus: 'paid', paymentMethod: 'VNPAY', // Đã xác nhận trước đó
        save: jest.fn(),
      };
      Order.findOne.mockResolvedValue(mockAlreadyPaidOrder);

      await vnpayIpn(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        RspCode: '02',
        Message: 'Order already confirmed',
      });
      // Đảm bảo không gọi save lại (Idempotency)
      expect(mockAlreadyPaidOrder.save).not.toHaveBeenCalled();
    });

    test('IPN does not mark paid when supplied transaction status reports failure', async () => {
      const mockOrder = { _id: new mongoose.Types.ObjectId(), orderCode: 'ORD-IPN-FAILED-STATUS', user: mockUserId, finalAmount: 200000, paymentStatus: 'unpaid', paymentMethod: 'VNPAY', status: 'pending', trackingHistory: [], save: jest.fn().mockResolvedValue(true) };
      Order.findOne.mockResolvedValue(mockOrder);
      if (mockOrder.trackingHistory) applyPaymentUpdate(mockOrder);
      const params = { vnp_TxnRef: mockOrder.orderCode, vnp_Amount: '20000000', vnp_ResponseCode: '00', vnp_TransactionStatus: '02' };
      req.query = signCallback(params);
      await vnpayIpn(req, res);
      expect(mockOrder.paymentStatus).toBe('failed');
      expect(socketConfig.notifyUser).not.toHaveBeenCalled();
    });

    test('IPN Success: Cập nhật đơn hàng thành công và trả về RspCode 00', async () => {
      const mockOrder = {
        _id: new mongoose.Types.ObjectId(),
        orderCode: 'ORD-IPN-OK',
        user: mockUserId,
        finalAmount: 200000,
        paymentStatus: 'unpaid', paymentMethod: 'VNPAY',
        status: 'pending',
        shippingAddress: { fullName: 'Nguyễn Văn IPN' },
        trackingHistory: [],
        save: jest.fn().mockResolvedValue(true),
      };
      Order.findOne.mockResolvedValue(mockOrder);
      if (mockOrder.trackingHistory) applyPaymentUpdate(mockOrder);
      AuditLogService.logPaymentTransaction.mockResolvedValue({});

      const params = {
        vnp_TxnRef: 'ORD-IPN-OK',
        vnp_Amount: '20000000',
        vnp_ResponseCode: '00',
        vnp_TransactionNo: '987654321',
        vnp_BankCode: 'VCB',
      };
      const hash = calculateVNPaySecureHash(params, env.VNP_HASH_SECRET);
      req.query = signCallback(params);

      await vnpayIpn(req, res);

      expect(mockOrder.paymentStatus).toBe('paid');
      expect(mockOrder.status).toBe('processing');
      expect(mockOrder.save).not.toHaveBeenCalled();
      expect(Order.findOneAndUpdate).toHaveBeenCalledTimes(1);
      expect(socketConfig.notifyAdmin).toHaveBeenCalledWith('new_order', expect.anything());
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        RspCode: '00',
        Message: 'Confirm Success',
      });
    });
  });
});
