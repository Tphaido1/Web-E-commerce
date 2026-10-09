const {
  createVNPayPaymentUrl,
  vnpayReturn,
  vnpayIpn,
  calculateVNPaySecureHash,
} = require('../src/controllers/payment.controller');
const Order = require('../src/models/Order.model');
const AuditLogService = require('../src/services/auditLog.service');
const socketConfig = require('../src/config/socket');
const env = require('../src/config/env');
const mongoose = require('mongoose');

jest.mock('../src/models/Order.model');
jest.mock('../src/services/auditLog.service');
jest.mock('../src/config/socket');

describe('Duplicate Payment & Validation Bypass Integration Tests (Week 6 - Member D QA)', () => {
  const secretKey = env.VNP_HASH_SECRET || 'TEST_VNP_SECRET_KEY';
  const mockUserId = new mongoose.Types.ObjectId();
  const mockAttackerId = new mongoose.Types.ObjectId();
  const mockOrderId = new mongoose.Types.ObjectId();
  const orderCode = 'ORD-20261002-CONCUR01';

  const signParams = (params) => {
    const payload = {
      vnp_TmnCode: env.VNP_TMN_CODE,
      vnp_TransactionStatus: '00',
      ...params,
    };
    return {
      ...payload,
      vnp_SecureHash: calculateVNPaySecureHash(payload, secretKey),
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // PHẦN 1: KIỂM THỬ THANH TOÁN TRÙNG LẶP & ĐỒNG THỜI (CONCURRENT & IDEMPOTENT)
  // =========================================================================
  describe('1. Kịch bản Thanh toán trùng lặp & Idempotency (Duplicate Payment / Replay Webhook)', () => {
    test('Xử lý 2 Webhook IPN đồng thời: Chỉ 1 request cập nhật đơn thành công, request thứ hai trả về RspCode 02 (Order already confirmed)', async () => {
      let currentPaymentStatus = 'unpaid';
      let currentStatus = 'pending';
      let saveCount = 0;

      const mockOrder = {
        _id: mockOrderId,
        orderCode,
        user: mockUserId,
        finalAmount: 500000,
        paymentMethod: 'VNPAY',
        shippingAddress: { fullName: 'Khách Hàng Mẫu' },
        trackingHistory: [],
        get paymentStatus() {
          return currentPaymentStatus;
        },
        set paymentStatus(val) {
          currentPaymentStatus = val;
        },
        get status() {
          return currentStatus;
        },
        set status(val) {
          currentStatus = val;
        },
        save: jest.fn().mockImplementation(async () => {
          saveCount += 1;
          return true;
        }),
      };

      // Mock Order.findOne và Order.findOneAndUpdate trả về mockOrder với trạng thái động
      Order.findOne.mockImplementation(async () => mockOrder);
      Order.findOneAndUpdate.mockImplementation(async (filter, update) => {
        if (currentPaymentStatus === 'paid') return null;
        currentPaymentStatus = update.$set.paymentStatus;
        if (update.$set.status) currentStatus = update.$set.status;
        saveCount += 1;
        return mockOrder;
      });
      AuditLogService.logPaymentTransaction.mockResolvedValue({});

      // Tạo tham số hợp lệ cho IPN
      const validParams = {
        vnp_TxnRef: orderCode,
        vnp_Amount: '50000000', // 500.000 * 100
        vnp_ResponseCode: '00',
        vnp_TransactionNo: '14888999',
        vnp_BankCode: 'NCB',
        vnp_PayDate: '20261002210000',
      };
      const signedQuery = signParams(validParams);

      const makeIpnCall = () => {
        const req = { query: signedQuery };
        const res = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn().mockReturnThis(),
        };
        return vnpayIpn(req, res).then(() => res);
      };

      // Gửi request thứ nhất
      const res1 = await makeIpnCall();
      expect(res1.status).toHaveBeenCalledWith(200);
      expect(res1.json).toHaveBeenCalledWith({
        RspCode: '00',
        Message: 'Confirm Success',
      });
      expect(currentPaymentStatus).toBe('paid');
      expect(currentStatus).toBe('processing');
      expect(saveCount).toBe(1);

      // Gửi request thứ hai ngay sau đó (Replay / Duplicate Webhook)
      const res2 = await makeIpnCall();
      expect(res2.status).toHaveBeenCalledWith(200);
      expect(res2.json).toHaveBeenCalledWith({
        RspCode: '02',
        Message: 'Order already confirmed',
      });

      // Đảm bảo không bị lưu trùng lặp (Idempotent)
      expect(saveCount).toBe(1);
      expect(socketConfig.notifyAdmin).toHaveBeenCalledTimes(1);
    });

    test('Chặn tạo URL thanh toán mới khi đơn hàng đã ở trạng thái đã thanh toán (paid)', async () => {
      const paidOrder = {
        _id: mockOrderId,
        orderCode,
        user: mockUserId,
        finalAmount: 500000,
        paymentStatus: 'paid', // Đã thanh toán xong
        status: 'processing',
      };
      Order.findById.mockResolvedValue(paidOrder);

      const req = {
        user: { _id: mockUserId, role: 'customer' },
        body: { orderId: mockOrderId },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
      const next = jest.fn();

      await createVNPayPaymentUrl(req, res, next);

      expect(next).toHaveBeenCalled();
      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
      expect(err.message).toMatch(/đã được thanh toán/i);
    });
  });

  // =========================================================================
  // PHẦN 2: KIỂM THỬ CÁC KỊCH BẢN BYPASS VALIDATION (GIAN LẬN & PHÁ HOẠI)
  // =========================================================================
  describe('2. Kịch bản Bypass Validation: Can thiệp Chữ ký số (Checksum Tampering)', () => {
    test('Bypass bị chặn: Sửa đổi response code hoặc tham số mà không có secret key trên Return URL', async () => {
      const tamperedParams = {
        vnp_TxnRef: orderCode,
        vnp_Amount: '50000000',
        vnp_ResponseCode: '00', // Kẻ tấn công cố tình sửa mã thành công
        vnp_SecureHash: '9999999999999999999999999999999999999999999999999999999999999999', // Hash giả
      };

      const req = {
        query: tamperedParams,
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
      const next = jest.fn();

      await vnpayReturn(req, res, next);

      expect(next).toHaveBeenCalled();
      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
      expect(err.message).toMatch(/Chữ ký số không hợp lệ/i);
    });

    test('Bypass bị chặn: Giả mạo webhook IPN với checksum không khớp -> Trả về RspCode 97', async () => {
      const req = {
        query: {
          vnp_TxnRef: orderCode,
          vnp_Amount: '10000000',
          vnp_ResponseCode: '00',
          vnp_SecureHash: 'FORGED_INVALID_CHECKSUM_HASH',
        },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };

      await vnpayIpn(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        RspCode: '97',
        Message: 'Checksum failed',
      });
      // Đảm bảo không truy vấn hay sửa DB
      expect(Order.findOne).not.toHaveBeenCalled();
    });
  });

  describe('3. Kịch bản Bypass Validation: Can thiệp Số tiền thanh toán (Amount Manipulation)', () => {
    test('Bypass bị chặn: Kẻ gian thanh toán 10.000 VNĐ cho đơn hàng 1.000.000 VNĐ -> Trả về RspCode 04 (Invalid amount)', async () => {
      const mockOrder = {
        _id: mockOrderId,
        orderCode,
        user: mockUserId,
        finalAmount: 1000000, // Đơn hàng 1.000.000 VNĐ (cần 100.000.000 đơn vị)
        paymentStatus: 'unpaid',
      };
      Order.findOne.mockResolvedValue(mockOrder);

      const manipulatedParams = {
        vnp_TxnRef: orderCode,
        vnp_Amount: '1000000', // Kẻ gian chỉ gửi 10.000 VNĐ
        vnp_ResponseCode: '00',
        vnp_TransactionNo: 'HACKER_TXN_01',
      };

      const req = {
        query: signParams(manipulatedParams),
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };

      await vnpayIpn(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        RspCode: '04',
        Message: 'Invalid amount',
      });

      // Đảm bảo đơn hàng vẫn giữ nguyên trạng thái chưa thanh toán
      expect(mockOrder.paymentStatus).toBe('unpaid');
    });
  });

  describe('4. Kịch bản Bypass Validation: Đơn hàng không tồn tại hoặc đã hủy', () => {
    test('Bypass bị chặn: Gửi IPN webhook cho mã đơn không tồn tại trong hệ thống -> Trả về RspCode 01', async () => {
      Order.findOne.mockResolvedValue(null);

      const params = {
        vnp_TxnRef: 'NON_EXISTENT_ORDER_CODE',
        vnp_Amount: '20000000',
        vnp_ResponseCode: '00',
      };

      const req = { query: signParams(params) };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };

      await vnpayIpn(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        RspCode: '01',
        Message: 'Order not found',
      });
    });

    test('Bypass bị chặn: Cố tình thanh toán cho đơn hàng đã bị hủy (status: cancelled)', async () => {
      const cancelledOrder = {
        _id: mockOrderId,
        orderCode,
        user: mockUserId,
        finalAmount: 300000,
        paymentStatus: 'unpaid',
        status: 'cancelled', // Đã hủy
      };
      Order.findById.mockResolvedValue(cancelledOrder);

      const req = {
        user: { _id: mockUserId, role: 'customer' },
        body: { orderId: mockOrderId },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
      const next = jest.fn();

      await createVNPayPaymentUrl(req, res, next);

      expect(next).toHaveBeenCalled();
      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
      expect(err.message).toMatch(/đã bị hủy/i);
    });
  });

  describe('5. Kịch bản Bypass Validation: Xâm phạm Quyền sở hữu (IDOR & Unauthorized Access)', () => {
    test('Bypass bị chặn: Khách hàng B cố gắng tạo URL thanh toán cho đơn hàng của Khách hàng A -> Lỗi 403 Forbidden', async () => {
      const victimOrder = {
        _id: mockOrderId,
        orderCode,
        user: mockUserId, // Thuộc về Customer A
        finalAmount: 500000,
        paymentStatus: 'unpaid',
        status: 'pending',
      };
      Order.findById.mockResolvedValue(victimOrder);

      const req = {
        user: { _id: mockAttackerId, role: 'customer' }, // Attacker B
        body: { orderId: mockOrderId },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
      const next = jest.fn();

      await createVNPayPaymentUrl(req, res, next);

      expect(next).toHaveBeenCalled();
      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(403);
      expect(err.message).toMatch(/không có quyền/i);
    });
  });
});
