const AuditLog = require('../src/models/AuditLog.model');
const AuditLogService = require('../src/services/auditLog.service');
const mongoose = require('mongoose');

jest.mock('../src/models/AuditLog.model');

describe('Audit Log Service Unit & Integration Tests (Week 5 - Member D)', () => {
  const mockUserId = new mongoose.Types.ObjectId();
  const mockOrderId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. logOrderChange', () => {
    test('Ghi log thành công khi trạng thái đơn hàng thay đổi với đầy đủ thông tin', async () => {
      const mockCreatedLog = {
        _id: new mongoose.Types.ObjectId(),
        entityType: 'Order',
        entityId: mockOrderId.toString(),
        action: 'ORDER_STATUS_UPDATED',
        performedBy: mockUserId,
        actorRole: 'admin',
        oldValue: 'pending',
        newValue: 'processing',
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        details: { reason: 'Admin confirmed payment' },
        createdAt: new Date(),
      };

      AuditLog.create.mockResolvedValue(mockCreatedLog);

      const req = {
        headers: {
          'x-forwarded-for': '192.168.1.100',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
      };

      const result = await AuditLogService.logOrderChange({
        orderId: mockOrderId,
        action: 'ORDER_STATUS_UPDATED',
        performedBy: mockUserId,
        actorRole: 'admin',
        oldValue: 'pending',
        newValue: 'processing',
        details: { reason: 'Admin confirmed payment' },
        req,
      });

      expect(AuditLog.create).toHaveBeenCalledWith({
        entityType: 'Order',
        entityId: mockOrderId.toString(),
        action: 'ORDER_STATUS_UPDATED',
        performedBy: mockUserId,
        actorRole: 'admin',
        oldValue: 'pending',
        newValue: 'processing',
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        details: { reason: 'Admin confirmed payment' },
      });

      expect(result).toEqual(mockCreatedLog);
    });

    test('Lấy IP từ req.socket.remoteAddress nếu không có x-forwarded-for', async () => {
      AuditLog.create.mockResolvedValue({});

      const req = {
        headers: {},
        socket: { remoteAddress: '127.0.0.1' },
      };

      await AuditLogService.logOrderChange({
        orderId: mockOrderId,
        action: 'ORDER_CREATED',
        req,
      });

      expect(AuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ipAddress: '127.0.0.1',
          userAgent: null,
          actorRole: 'system',
        })
      );
    });

    test('Fail-safe: Bắt lỗi và trả về null khi MongoDB create ném lỗi (không sập luồng chính)', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      AuditLog.create.mockRejectedValue(new Error('Database connection failed'));

      const result = await AuditLogService.logOrderChange({
        orderId: mockOrderId,
        action: 'STATUS_CHANGE',
      });

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[AuditLogService] Ghi nhận log đơn hàng thất bại:',
        'Database connection failed'
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('2. logPaymentTransaction', () => {
    test('Ghi nhận giao dịch thanh toán thành công (PAYMENT_SUCCESS)', async () => {
      const mockPaymentLog = {
        _id: new mongoose.Types.ObjectId(),
        entityType: 'Payment',
        entityId: mockOrderId.toString(),
        action: 'PAYMENT_SUCCESS',
        actorRole: 'system',
        ipAddress: '10.0.0.1',
        details: {
          transactionNo: 'VNP-12345678',
          amount: 500000,
          bankCode: 'NCB',
          responseCode: '00',
          provider: 'VNPAY',
        },
      };

      AuditLog.create.mockResolvedValue(mockPaymentLog);

      const req = {
        headers: { 'x-forwarded-for': '10.0.0.1' },
      };

      const result = await AuditLogService.logPaymentTransaction({
        orderId: mockOrderId,
        transactionNo: 'VNP-12345678',
        amount: 500000,
        bankCode: 'NCB',
        status: 'success',
        responseCode: '00',
        details: { provider: 'VNPAY' },
        req,
      });

      expect(AuditLog.create).toHaveBeenCalledWith({
        entityType: 'Payment',
        entityId: mockOrderId.toString(),
        action: 'PAYMENT_SUCCESS',
        actorRole: 'system',
        ipAddress: '10.0.0.1',
        details: {
          transactionNo: 'VNP-12345678',
          amount: 500000,
          bankCode: 'NCB',
          responseCode: '00',
          provider: 'VNPAY',
        },
      });

      expect(result).toEqual(mockPaymentLog);
    });

    test('Ghi nhận giao dịch thanh toán thất bại (PAYMENT_FAILED)', async () => {
      AuditLog.create.mockResolvedValue({});

      await AuditLogService.logPaymentTransaction({
        orderId: mockOrderId,
        transactionNo: 'VNP-FAIL-999',
        amount: 300000,
        bankCode: 'VCB',
        status: 'failed',
        responseCode: '24', // Người dùng hủy giao dịch
      });

      expect(AuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Payment',
          entityId: mockOrderId.toString(),
          action: 'PAYMENT_FAILED',
          details: expect.objectContaining({
            transactionNo: 'VNP-FAIL-999',
            amount: 300000,
            bankCode: 'VCB',
            responseCode: '24',
          }),
        })
      );
    });

    test('Fail-safe: Bắt lỗi khi ghi log thanh toán gặp sự cố DB', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      AuditLog.create.mockRejectedValue(new Error('Mongo timeout'));

      const result = await AuditLogService.logPaymentTransaction({
        orderId: mockOrderId,
        transactionNo: 'TXN-999',
        amount: 100000,
        status: 'failed',
      });

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[AuditLogService] Ghi nhận log thanh toán thất bại:',
        'Mongo timeout'
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('3. getOrderAuditLogs', () => {
    test('Truy vấn danh sách lịch sử log theo orderId và sắp xếp mới nhất', async () => {
      const mockLogs = [
        {
          _id: new mongoose.Types.ObjectId(),
          entityType: 'Payment',
          entityId: mockOrderId.toString(),
          action: 'PAYMENT_SUCCESS',
          createdAt: new Date('2026-10-02T10:05:00Z'),
        },
        {
          _id: new mongoose.Types.ObjectId(),
          entityType: 'Order',
          entityId: mockOrderId.toString(),
          action: 'ORDER_CREATED',
          createdAt: new Date('2026-10-02T10:00:00Z'),
        },
      ];

      const leanMock = jest.fn().mockResolvedValue(mockLogs);
      const sortMock = jest.fn().mockReturnValue({ lean: leanMock });
      const populateMock = jest.fn().mockReturnValue({ sort: sortMock });
      AuditLog.find.mockReturnValue({ populate: populateMock });

      const logs = await AuditLogService.getOrderAuditLogs(mockOrderId);

      expect(AuditLog.find).toHaveBeenCalledWith({
        $or: [
          { entityType: 'Order', entityId: mockOrderId.toString() },
          { entityType: 'Payment', entityId: mockOrderId.toString() },
        ],
      });
      expect(populateMock).toHaveBeenCalledWith('performedBy', 'email role');
      expect(sortMock).toHaveBeenCalledWith({ createdAt: -1 });
      expect(leanMock).toHaveBeenCalled();
      expect(logs).toEqual(mockLogs);
    });
  });
});
