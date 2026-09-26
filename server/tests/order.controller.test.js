const Order = require('../src/models/Order.model');
const Product = require('../src/models/Product.model');
const Inventory = require('../src/models/Inventory.model');
const Cart = require('../src/models/Cart.model');
const Coupon = require('../src/models/Coupon.model');
const EmailService = require('../src/services/email.service');
const {
  checkout,
  getMyOrders,
  getOrderById,
  trackOrderByCode,
  updateOrderStatus,
} = require('../src/controllers/order.controller');
const mongoose = require('mongoose');

// Mock các Model và EmailService để cô lập unit/integration test không phụ thuộc network hay DB thật
jest.mock('../src/models/Order.model');
jest.mock('../src/models/Product.model');
jest.mock('../src/models/Inventory.model');
jest.mock('../src/models/Cart.model');
jest.mock('../src/models/Coupon.model');
jest.mock('../src/services/email.service');

describe('Order Controller & Checkout Fail-Safe Engine (Level 4/5 Verification Ladder)', () => {
  let req, res, next;
  const mockUserId = new mongoose.Types.ObjectId();
  const mockProductId1 = new mongoose.Types.ObjectId();
  const mockProductId2 = new mongoose.Types.ObjectId();

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      user: {
        _id: mockUserId,
        email: 'customer@top1.com',
        role: 'customer',
      },
      headers: {},
      body: {},
      params: {},
      query: {},
      app: {
        get: jest.fn().mockReturnValue(null), // Mock Socket.io
      },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  describe('1. Validation & Idempotency', () => {
    test('Idempotency Key: Trả về đơn hàng cũ ngay lập tức nếu trùng key, chống double-click', async () => {
      req.headers['idempotency-key'] = 'IDEMPOTENT-UUID-12345';
      const mockExistingOrder = {
        _id: 'order_123',
        orderCode: 'ORD-20260926-EXIST',
        finalAmount: 300000,
        status: 'pending',
      };
      Order.findOne.mockResolvedValue(mockExistingOrder);

      await checkout(req, res, next);

      expect(Order.findOne).toHaveBeenCalledWith({ idempotencyKey: 'IDEMPOTENT-UUID-12345' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          message: 'Đơn hàng đã được tạo trước đó',
          data: mockExistingOrder,
        })
      );
      // Đảm bảo không gọi tạo đơn mới
      expect(Order.create).not.toHaveBeenCalled();
    });

    test('Báo lỗi 400 nếu thiếu thông tin giao hàng', async () => {
      Order.findOne.mockResolvedValue(null);
      req.body = {
        shippingAddress: { fullName: 'Nguyễn Văn A' }, // Thiếu phone và address
        items: [{ productId: mockProductId1, sku: 'SKU-1', quantity: 1 }],
      };

      await checkout(req, res, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error.statusCode).toBe(400);
      expect(error.message).toMatch(/đầy đủ họ tên, số điện thoại và địa chỉ giao hàng/);
    });

    test('Báo lỗi 400 nếu giỏ hàng trống khi không truyền items cụ thể', async () => {
      Order.findOne.mockResolvedValue(null);
      req.body = {
        shippingAddress: { fullName: 'Nguyễn Văn A', phone: '0901234567', address: '123 Phố Huế' },
      };
      Cart.findOne.mockResolvedValue({ items: [] });

      await checkout(req, res, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error.statusCode).toBe(400);
      expect(error.message).toMatch(/Giỏ hàng của bạn đang trống/);
    });
  });

  describe('2. Fail-Safe Atomic Inventory Compensation (Rollback)', () => {
    test('CƠ CHẾ BỒI HOÀN: Nếu món thứ 2 hết hàng, tự động hoàn trả tồn kho của món thứ 1 đã trừ', async () => {
      Order.findOne.mockResolvedValue(null);
      req.body = {
        shippingAddress: { fullName: 'Lê Văn B', phone: '0909999999', address: '456 Lý Tự Trọng' },
        items: [
          { productId: mockProductId1, sku: 'SKU-PHONE', quantity: 1 },
          { productId: mockProductId2, sku: 'SKU-CASE', quantity: 2 },
        ],
      };

      // Giả lập sản phẩm tồn tại
      Product.findById
        .mockResolvedValueOnce({
          _id: mockProductId1,
          name: 'Điện thoại XYZ',
          price: 10000000,
          isActive: true,
          variants: [{ sku: 'SKU-PHONE', price: 10000000 }],
        })
        .mockResolvedValueOnce({
          _id: mockProductId2,
          name: 'Ốp lưng điện thoại',
          price: 150000,
          isActive: true,
          variants: [{ sku: 'SKU-CASE', price: 150000 }],
        });

      // Món 1: trừ kho thành công
      Inventory.deductStock.mockResolvedValueOnce({ sku: 'SKU-PHONE', stock: 9 });
      // Món 2: trừ kho thất bại (hết hàng)
      Inventory.deductStock.mockResolvedValueOnce(null);
      Inventory.findOne.mockResolvedValueOnce({ sku: 'SKU-CASE', stock: 0 }); // Kho chỉ còn 0 cái
      Inventory.compensateStock.mockResolvedValue({ sku: 'SKU-PHONE', stock: 10 });
      Product.updateOne.mockResolvedValue({});

      await checkout(req, res, next);

      // Xác nhận món 1 đã bị trừ kho
      expect(Inventory.deductStock).toHaveBeenCalledWith('SKU-PHONE', 1);
      // Xác nhận món 2 được kiểm tra
      expect(Inventory.deductStock).toHaveBeenCalledWith('SKU-CASE', 2);

      // XÁC NHẬN CƠ CHẾ BỒI HOÀN (COMPENSATION) ĐÃ ĐƯỢC KÍCH HOẠT CHO MÓN 1!
      expect(Inventory.compensateStock).toHaveBeenCalledWith('SKU-PHONE', 1);

      // Xác nhận request bị reject với mã lỗi 400
      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error.statusCode).toBe(400);
      expect(error.message).toMatch(/không đủ số lượng/);

      // Xác nhận không tạo đơn hàng
      expect(Order.create).not.toHaveBeenCalled();
    });
  });

  describe('3. Coupon Integration & Final Order Creation', () => {
    test('Đặt hàng thành công với Coupon: Tính đúng giảm giá, trừ kho, xóa giỏ hàng và sinh QR', async () => {
      Order.findOne.mockResolvedValue(null);
      req.body = {
        shippingAddress: { fullName: 'Phạm Thị C', phone: '0988776655', address: '789 Trần Hưng Đạo' },
        items: [{ productId: mockProductId1, sku: 'SKU-SHIRT', quantity: 2 }],
        couponCode: 'SALE20',
        shippingFee: 30000,
      };

      // Mock Product
      Product.findById.mockResolvedValue({
        _id: mockProductId1,
        name: 'Áo Sơ Mi Oxford',
        price: 300000,
        isActive: true,
        variants: [{ sku: 'SKU-SHIRT', price: 300000 }],
      });

      // Mock Coupon
      const mockCouponDoc = {
        _id: new mongoose.Types.ObjectId(),
        code: 'SALE20',
        validateForOrder: jest.fn().mockReturnValue({ isValid: true }),
        calculateDiscount: jest.fn().mockReturnValue(120000), // 20% của 600k = 120k
        usageLimit: 100,
        usageCount: 10,
      };
      Coupon.findOne.mockResolvedValue(mockCouponDoc);
      Coupon.findOneAndUpdate.mockResolvedValue(mockCouponDoc);
      Coupon.updateOne.mockResolvedValue({});

      // Mock Inventory deduct
      Inventory.deductStock.mockResolvedValue({ sku: 'SKU-SHIRT', stock: 8 });

      // Mock Order creation
      const mockCreatedOrder = {
        _id: new mongoose.Types.ObjectId(),
        orderCode: 'ORD-20260926-TESTOK',
        user: mockUserId,
        items: [{ sku: 'SKU-SHIRT', quantity: 2, price: 300000, subtotal: 600000 }],
        totalAmount: 600000,
        discountAmount: 120000,
        shippingFee: 30000,
        finalAmount: 510000, // 600k - 120k + 30k
        status: 'pending',
        shippingAddress: req.body.shippingAddress,
        createdAt: new Date(),
        save: jest.fn().mockResolvedValue(true),
      };
      Order.create.mockResolvedValue(mockCreatedOrder);

      // Mock Cart cleanup
      Cart.findOneAndUpdate.mockResolvedValue({});

      // Mock Email Service
      EmailService.sendOrderConfirmationEmail.mockResolvedValue({
        success: true,
        trackingToken: 'mock_hmac_sha256_token_valid',
        qrCodeDataUrl: 'data:image/png;base64,mockqr',
      });

      await checkout(req, res, next);

      // 1. Kiểm tra Coupon được validate
      expect(mockCouponDoc.validateForOrder).toHaveBeenCalledWith(mockUserId, 600000);
      expect(mockCouponDoc.calculateDiscount).toHaveBeenCalledWith(600000);

      // 2. Kiểm tra kho bị trừ
      expect(Inventory.deductStock).toHaveBeenCalledWith('SKU-SHIRT', 2);

      // 3. Kiểm tra Order được tạo với đúng số tiền
      expect(Order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          totalAmount: 600000,
          discountAmount: 120000,
          shippingFee: 30000,
          finalAmount: 510000,
          paymentStatus: 'unpaid',
          status: 'pending',
        })
      );

      // 4. Kiểm tra Cart bị dọn dẹp
      expect(Cart.findOneAndUpdate).toHaveBeenCalledWith(
        { user: mockUserId },
        { $pull: { items: { sku: { $in: ['SKU-SHIRT'] } } } }
      );

      // 5. Kiểm tra Email/QR Service được trigger
      expect(EmailService.sendOrderConfirmationEmail).toHaveBeenCalledWith(mockCreatedOrder, 'customer@top1.com');

      // 6. Kiểm tra Response 201
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          message: 'Đặt hàng thành công',
        })
      );
    });
  });

  describe('4. Order Tracking & Cancellation Auto-Restock', () => {
    test('trackOrderByCode: Tra cứu công khai thành công, xác thực token HMAC', async () => {
      req.params.orderCode = 'ORD-20260926-TESTOK';
      req.query.token = 'valid_hmac_token';

      const mockOrder = {
        _id: new mongoose.Types.ObjectId(),
        orderCode: 'ORD-20260926-TESTOK',
        status: 'pending',
        paymentMethod: 'COD',
        paymentStatus: 'unpaid',
        finalAmount: 510000,
        createdAt: new Date(),
        items: [{ name: 'Áo', sku: 'SKU-SHIRT', quantity: 2, price: 300000, subtotal: 600000 }],
        shippingAddress: { fullName: 'Phạm Thị C', city: 'Hà Nội', address: '123 Cầu Giấy' },
        trackingHistory: [],
        qrCodeDataUrl: 'data:image/png;base64,mockqr',
      };
      Order.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockOrder),
      });
      EmailService.verifyTrackingToken.mockReturnValue(true);

      await trackOrderByCode(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          data: expect.objectContaining({
            orderCode: 'ORD-20260926-TESTOK',
            isVerifiedByHMAC: true,
          }),
        })
      );
    });

    test('updateOrderStatus sang "cancelled": Tự động bồi hoàn tồn kho cho tất cả sản phẩm', async () => {
      req.params.id = 'order_999';
      req.body = { status: 'cancelled', cancelledReason: 'Khách đổi ý' };
      req.user.role = 'admin';

      const mockOrder = {
        _id: 'order_999',
        status: 'pending',
        items: [
          { product: mockProductId1, sku: 'SKU-A', quantity: 2 },
          { product: mockProductId2, sku: 'SKU-B', quantity: 3 },
        ],
        coupon: { couponId: new mongoose.Types.ObjectId() },
        trackingHistory: [],
        save: jest.fn().mockResolvedValue(true),
      };
      Order.findById.mockResolvedValue(mockOrder);
      Inventory.compensateStock.mockResolvedValue({});
      Product.updateOne.mockResolvedValue({});
      Coupon.updateOne.mockResolvedValue({});

      await updateOrderStatus(req, res, next);

      expect(mockOrder.status).toBe('cancelled');
      expect(mockOrder.cancelledReason).toBe('Khách đổi ý');
      // Đảm bảo kho được hoàn trả tự động cho cả 2 sản phẩm!
      expect(Inventory.compensateStock).toHaveBeenCalledWith('SKU-A', 2);
      expect(Inventory.compensateStock).toHaveBeenCalledWith('SKU-B', 3);
      // Đảm bảo lượt dùng coupon được hoàn lại
      expect(Coupon.updateOne).toHaveBeenCalledWith(
        { _id: mockOrder.coupon.couponId },
        { $inc: { usageCount: -1 }, $pull: { usedBy: { orderId: mockOrder._id } } }
      );
      expect(mockOrder.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});
