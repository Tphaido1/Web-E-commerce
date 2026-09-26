const Order = require('../src/models/Order.model');
const Product = require('../src/models/Product.model');
const Inventory = require('../src/models/Inventory.model');
const Cart = require('../src/models/Cart.model');
const Coupon = require('../src/models/Coupon.model');
const EmailService = require('../src/services/email.service');
const { checkout } = require('../src/controllers/order.controller');
const mongoose = require('mongoose');

jest.mock('../src/models/Order.model');
jest.mock('../src/models/Product.model');
jest.mock('../src/models/Inventory.model');
jest.mock('../src/models/Cart.model');
jest.mock('../src/models/Coupon.model');
jest.mock('../src/services/email.service');

describe('High Concurrency & Flash Sale Race-Condition Tests (Level 5 Verification Ladder)', () => {
  const flashSaleProductId = new mongoose.Types.ObjectId();
  const flashSaleSku = 'FLASH-SALE-ITEM';

  beforeEach(() => {
    jest.clearAllMocks();
    EmailService.sendOrderConfirmationEmail.mockResolvedValue({
      success: true,
      trackingToken: 'token',
      qrCodeDataUrl: 'qr',
    });
    Cart.findOneAndUpdate.mockResolvedValue({});
  });

  test('FLASH SALE RACE CONDITION: 50 requests đồng thời mua 10 món hàng -> Đúng 10 đơn thành công, 40 đơn bị từ chối, kho về 0', async () => {
    let mockStockInDb = 10; // Kho chỉ có 10 cái
    const totalConcurrentRequests = 50;

    // Mock hàm trừ kho nguyên tử: mô phỏng chính xác hành vi của MongoDB findOneAndUpdate với {$gte: qty, $inc: -qty}
    Inventory.deductStock.mockImplementation(async (sku, quantity) => {
      if (sku === flashSaleSku && mockStockInDb >= quantity) {
        mockStockInDb -= quantity;
        return { sku, stock: mockStockInDb };
      }
      return null; // Không đủ tồn kho
    });

    Inventory.findOne.mockImplementation(async () => {
      return { sku: flashSaleSku, stock: mockStockInDb };
    });

    // Mock Product
    Product.findById.mockResolvedValue({
      _id: flashSaleProductId,
      name: 'Tai nghe Bluetooth Flash Sale',
      price: 99000,
      isActive: true,
      variants: [{ sku: flashSaleSku, price: 99000 }],
    });

    // Mock Order.create
    Order.create.mockImplementation(async (orderData) => {
      return {
        _id: new mongoose.Types.ObjectId(),
        orderCode: orderData.orderCode,
        finalAmount: orderData.finalAmount,
        status: 'pending',
        shippingAddress: orderData.shippingAddress,
        createdAt: new Date(),
        save: jest.fn().mockResolvedValue(true),
      };
    });

    // Giả lập 50 requests đồng thời chạy qua Promise.all
    const requestPromises = Array.from({ length: totalConcurrentRequests }, (_, index) => {
      const customerId = new mongoose.Types.ObjectId();
      const req = {
        user: { _id: customerId, email: `user${index}@sale.com`, role: 'customer' },
        headers: { 'idempotency-key': `req-key-${index}` },
        body: {
          items: [{ productId: flashSaleProductId, sku: flashSaleSku, quantity: 1 }],
          shippingAddress: {
            fullName: `Customer ${index}`,
            phone: `09000000${index}`,
            address: `Số ${index} Phố Flash Sale`,
          },
          paymentMethod: 'COD',
        },
        params: {},
        query: {},
        app: { get: jest.fn().mockReturnValue(null) },
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };
      const next = jest.fn();

      return checkout(req, res, next).then(() => {
        return { res, next };
      });
    });

    const results = await Promise.all(requestPromises);

    // Thu thập kết quả
    let successCount = 0;
    let rejectedCount = 0;

    results.forEach(({ res, next }) => {
      if (res.status.mock.calls.some((call) => call[0] === 201)) {
        successCount++;
      }
      if (next.mock.calls.length > 0 && next.mock.calls[0][0]?.statusCode === 400) {
        rejectedCount++;
      }
    });

    // XÁC MINH CÁC TIÊU CHÍ KỸ THUẬT:
    // 1. Đúng 10 đơn hàng được tạo thành công
    expect(successCount).toBe(10);
    // 2. 40 đơn hàng bị từ chối
    expect(rejectedCount).toBe(40);
    // 3. Tồn kho trong Database bằng CHÍNH XÁC 0 (KHÔNG ÂM!)
    expect(mockStockInDb).toBe(0);
  });

  test('ANTI-PRICE TAMPERING: Ngăn chặn sửa giá tiền trên payload body (Lấy giá chuẩn từ Database)', async () => {
    Order.findOne.mockResolvedValue(null);
    Inventory.deductStock.mockResolvedValue({ sku: 'EXPENSIVE-ITEM', stock: 5 });

    // Trong Database, sản phẩm có giá gốc 1.500.000₫
    Product.findById.mockResolvedValue({
      _id: flashSaleProductId,
      name: 'Giày Da Hàng Hiệu',
      price: 1500000,
      isActive: true,
      variants: [{ sku: 'EXPENSIVE-ITEM', price: 1500000 }],
    });

    const mockOrderCreated = {
      _id: new mongoose.Types.ObjectId(),
      save: jest.fn().mockResolvedValue(true),
    };
    Order.create.mockResolvedValue(mockOrderCreated);

    // Kẻ xấu cố tình gửi payload với price = 1000 đồng
    const req = {
      user: { _id: new mongoose.Types.ObjectId(), email: 'hacker@test.com', role: 'customer' },
      headers: {},
      body: {
        items: [{ productId: flashSaleProductId, sku: 'EXPENSIVE-ITEM', quantity: 2, price: 1000 }],
        shippingAddress: { fullName: 'Hacker', phone: '0901111111', address: 'Unknown' },
        paymentMethod: 'COD',
      },
      params: {},
      query: {},
      app: { get: jest.fn().mockReturnValue(null) },
    };

    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    const next = jest.fn();

    await checkout(req, res, next);

    // Đảm bảo đơn hàng được tạo với giá 1.500.000 x 2 = 3.000.000₫ chứ KHÔNG PHẢI 2.000₫
    expect(Order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        totalAmount: 3000000,
        finalAmount: 3000000,
      })
    );
  });

  test('CONCURRENT COUPON SPAM: 2 tabs gửi đồng thời mã giảm giá 1 lần (userLimit=1) -> Chỉ 1 tab thành công', async () => {
    const singleUserId = new mongoose.Types.ObjectId();
    let couponUsed = false;

    Product.findById.mockResolvedValue({
      _id: flashSaleProductId,
      name: 'Áo Khoác',
      price: 500000,
      isActive: true,
      variants: [{ sku: 'JACKET-01', price: 500000 }],
    });
    Inventory.deductStock.mockResolvedValue({ sku: 'JACKET-01', stock: 10 });

    const mockCoupon = {
      _id: new mongoose.Types.ObjectId(),
      code: 'ONCE_PER_USER',
      validateForOrder: jest.fn().mockReturnValue({ isValid: true }),
      calculateDiscount: jest.fn().mockReturnValue(50000),
      usageLimit: 100,
    };
    Coupon.findOne.mockResolvedValue(mockCoupon);

    // Mô phỏng cập nhật nguyên tử có điều kiện của Coupon
    Coupon.findOneAndUpdate.mockImplementation(async () => {
      if (!couponUsed) {
        couponUsed = true;
        return { ...mockCoupon, usageCount: 1 };
      }
      return null; // Tab 2 đến sau khi coupon đã bị khóa/hết lượt
    });

    Order.create.mockResolvedValue({
      _id: new mongoose.Types.ObjectId(),
      save: jest.fn().mockResolvedValue(true),
    });

    const createTabRequest = (tabIndex) => {
      const req = {
        user: { _id: singleUserId, email: 'user@test.com', role: 'customer' },
        headers: { 'idempotency-key': `tab-${tabIndex}-${Date.now()}` },
        body: {
          items: [{ productId: flashSaleProductId, sku: 'JACKET-01', quantity: 1 }],
          shippingAddress: { fullName: 'User A', phone: '0901234567', address: 'HN' },
          couponCode: 'ONCE_PER_USER',
        },
        params: {},
        query: {},
        app: { get: jest.fn().mockReturnValue(null) },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
      const next = jest.fn();
      return checkout(req, res, next).then(() => ({ res, next }));
    };

    // Gửi 2 request song song từ 2 tab
    const [tab1Result, tab2Result] = await Promise.all([createTabRequest(1), createTabRequest(2)]);

    const oneSucceeded =
      tab1Result.res.status.mock.calls.some((c) => c[0] === 201) ||
      tab2Result.res.status.mock.calls.some((c) => c[0] === 201);
    const oneFailed =
      (tab1Result.next.mock.calls[0] && tab1Result.next.mock.calls[0][0]?.statusCode === 400) ||
      (tab2Result.next.mock.calls[0] && tab2Result.next.mock.calls[0][0]?.statusCode === 400);

    // Đảm bảo chỉ 1 tab được áp mã thành công, tab còn lại bị từ chối nguyên tử
    expect(oneSucceeded).toBe(true);
    expect(oneFailed).toBe(true);
  });
});
