const Order = require('../src/models/Order.model');
const Product = require('../src/models/Product.model');
const Inventory = require('../src/models/Inventory.model');
const Cart = require('../src/models/Cart.model');
const Coupon = require('../src/models/Coupon.model');
const EmailService = require('../src/services/email.service');
const { syncOfflineOrders, syncOfflineCart } = require('../src/controllers/sync.controller');
const mongoose = require('mongoose');

jest.mock('../src/models/Order.model');
jest.mock('../src/models/Product.model');
jest.mock('../src/models/Inventory.model');
jest.mock('../src/models/Cart.model');
jest.mock('../src/models/Coupon.model');
jest.mock('../src/services/email.service');

describe('Offline Sync Queue Tests (Week 6 - Thành viên A & PWA Support)', () => {
  const mockUserId = new mongoose.Types.ObjectId();
  const mockProductId = new mongoose.Types.ObjectId();
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      user: { _id: mockUserId, email: 'sync@pwa.com' },
      body: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
    EmailService.sendOrderConfirmationEmail.mockResolvedValue({ success: true });
  });

  describe('syncOfflineOrders', () => {
    test('Đồng bộ thành công đơn hàng offline và nhận diện trùng lặp qua clientOrderId (Idempotent)', async () => {
      // 1 đơn mới, 1 đơn đã sync trước đó
      req.body = {
        orders: [
          {
            clientOrderId: 'offline-uuid-001',
            items: [{ productId: mockProductId, sku: 'OFFLINE-SKU', quantity: 1 }],
            shippingAddress: { fullName: 'Offline User', phone: '0901234567', address: 'HCM' },
          },
          {
            clientOrderId: 'offline-uuid-002-duplicate',
            items: [{ productId: mockProductId, sku: 'OFFLINE-SKU', quantity: 1 }],
            shippingAddress: { fullName: 'Offline User', phone: '0901234567', address: 'HCM' },
          },
        ],
      };

      // Đơn 1: Chưa có trong DB
      Order.findOne
        .mockResolvedValueOnce(null)
        // Đơn 2: Đã có trong DB
        .mockResolvedValueOnce({
          orderCode: 'ORD-ALREADY-SYNCED',
          status: 'pending',
          finalAmount: 150000,
        });

      Product.findById.mockResolvedValue({
        _id: mockProductId,
        name: 'Sản phẩm PWA',
        price: 150000,
        isActive: true,
        variants: [{ sku: 'OFFLINE-SKU', price: 150000 }],
      });

      Inventory.deductStock.mockResolvedValue({ sku: 'OFFLINE-SKU', stock: 9 });
      Order.create.mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        orderCode: 'ORD-NEWLY-SYNCED',
        finalAmount: 150000,
        status: 'pending',
      });

      await syncOfflineOrders(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const jsonResponse = res.json.mock.calls[0][0];
      expect(jsonResponse.status).toBe('success');
      expect(jsonResponse.data.totalRequested).toBe(2);
      expect(jsonResponse.data.syncedCount).toBe(2);
      expect(jsonResponse.data.failedCount).toBe(0);

      // Đơn 2 được đánh dấu là duplicate
      expect(jsonResponse.data.syncedOrders[1].isDuplicate).toBe(true);
      expect(jsonResponse.data.syncedOrders[1].orderCode).toBe('ORD-ALREADY-SYNCED');
    });

    test('Xử lý thất bại khi sản phẩm ngoại tuyến bị hết hàng trong kho online', async () => {
      req.body = {
        orders: [
          {
            clientOrderId: 'offline-uuid-out-of-stock',
            items: [{ productId: mockProductId, sku: 'OUT-OF-STOCK-SKU', quantity: 5 }],
            shippingAddress: { fullName: 'Offline User', phone: '0901234567', address: 'HCM' },
          },
        ],
      };

      Order.findOne.mockResolvedValue(null);
      Product.findById.mockResolvedValue({
        _id: mockProductId,
        name: 'Hàng hiếm',
        price: 200000,
        isActive: true,
        variants: [{ sku: 'OUT-OF-STOCK-SKU', price: 200000 }],
      });
      // Trừ kho thất bại
      Inventory.deductStock.mockResolvedValue(null);

      await syncOfflineOrders(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const jsonResponse = res.json.mock.calls[0][0];
      expect(jsonResponse.data.failedCount).toBe(1);
      expect(jsonResponse.data.failedOrders[0].clientOrderId).toBe('offline-uuid-out-of-stock');
      expect(jsonResponse.data.failedOrders[0].reason).toMatch(/không đủ số lượng/);
    });
  });

  describe('syncOfflineCart', () => {
    test('Hợp nhất giỏ hàng offline vào giỏ hàng online của User', async () => {
      req.body = {
        items: [
          { sku: 'EXISTING-ITEM', quantity: 2, price: 50000, name: 'Item 1' },
          { sku: 'NEW-ITEM', quantity: 1, price: 100000, name: 'Item 2' },
        ],
      };

      const mockCart = {
        user: mockUserId,
        items: [{ sku: 'EXISTING-ITEM', quantity: 1, price: 50000, name: 'Item 1' }],
        save: jest.fn().mockResolvedValue(true),
      };
      Cart.findOne.mockResolvedValue(mockCart);

      await syncOfflineCart(req, res, next);

      expect(mockCart.items.length).toBe(2);
      // Item 1 đã có: 1 + 2 = 3
      expect(mockCart.items[0].quantity).toBe(3);
      // Item 2 mới: được thêm vào giỏ
      expect(mockCart.items[1].sku).toBe('NEW-ITEM');
      expect(mockCart.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});
