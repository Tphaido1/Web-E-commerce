const mongoose = require('mongoose');
const Cart = require('../src/models/Cart.model');
const Inventory = require('../src/models/Inventory.model');
const {
  mergeCartItems,
  calculateCartTotal,
  checkInventoryAvailability,
} = require('../src/utils/cartInventory.util');

describe('Cart & Inventory Logic Suite (Tuần 1 & 3 - Member D QA & Unit Tests)', () => {
  describe('PHẦN 1: Unit Test Thuật toán Gộp Giỏ Hàng (Merge Cart)', () => {
    test('1. Gộp 2 mảng rỗng trả về mảng rỗng', () => {
      const result = mergeCartItems([], []);
      expect(result).toEqual([]);
      expect(calculateCartTotal(result)).toBe(0);
    });

    test('2. Gộp khi giỏ hàng server trống: nhận toàn bộ món hàng từ local', () => {
      const localItems = [
        { sku: 'PROD-001', name: 'Áo Polo', price: 200000, quantity: 2 },
        { sku: 'PROD-002', name: 'Quần Kaki', price: 350000, quantity: 1 },
      ];

      const merged = mergeCartItems([], localItems);

      expect(merged).toHaveLength(2);
      expect(merged[0].sku).toBe('PROD-001');
      expect(merged[0].quantity).toBe(2);
      expect(merged[1].sku).toBe('PROD-002');
      expect(merged[1].quantity).toBe(1);
      expect(calculateCartTotal(merged)).toBe(200000 * 2 + 350000 * 1);
    });

    test('3. Gộp khi có sản phẩm trùng SKU: cộng dồn số lượng chính xác', () => {
      const serverItems = [
        { sku: 'PROD-001', name: 'Áo Polo', price: 200000, quantity: 3 },
      ];
      const localItems = [
        { sku: 'PROD-001', name: 'Áo Polo', price: 200000, quantity: 2 },
      ];

      const merged = mergeCartItems(serverItems, localItems);

      expect(merged).toHaveLength(1);
      expect(merged[0].sku).toBe('PROD-001');
      expect(merged[0].quantity).toBe(5); // 3 + 2 = 5
      expect(calculateCartTotal(merged)).toBe(1000000);
    });

    test('4. Gộp hỗn hợp: vừa có món trùng (cộng dồn), vừa có món mới (thêm vào)', () => {
      const serverItems = [
        { sku: 'SKU-A', name: 'Món A', price: 100000, quantity: 1 },
        { sku: 'SKU-B', name: 'Món B', price: 150000, quantity: 2 },
      ];
      const localItems = [
        { sku: 'SKU-B', name: 'Món B', price: 150000, quantity: 3 }, // trùng -> tổng 5
        { sku: 'SKU-C', name: 'Món C', price: 300000, quantity: 1 }, // mới -> thêm vào
      ];

      const merged = mergeCartItems(serverItems, localItems);

      expect(merged).toHaveLength(3);

      const itemA = merged.find((i) => i.sku === 'SKU-A');
      const itemB = merged.find((i) => i.sku === 'SKU-B');
      const itemC = merged.find((i) => i.sku === 'SKU-C');

      expect(itemA.quantity).toBe(1);
      expect(itemB.quantity).toBe(5);
      expect(itemC.quantity).toBe(1);

      // 1*100000 + 5*150000 + 1*300000 = 100k + 750k + 300k = 1150k
      expect(calculateCartTotal(merged)).toBe(1150000);
    });

    test('5. Chuẩn hóa không phân biệt chữ hoa/thường cho SKU (Case-insensitive)', () => {
      const serverItems = [{ sku: 'shoe-nike-42', name: 'Nike 42', price: 500000, quantity: 1 }];
      const localItems = [{ sku: 'SHOE-NIKE-42', name: 'Nike 42', price: 500000, quantity: 2 }];

      const merged = mergeCartItems(serverItems, localItems);

      expect(merged).toHaveLength(1);
      expect(merged[0].sku).toBe('SHOE-NIKE-42');
      expect(merged[0].quantity).toBe(3);
    });

    test('6. Xử lý an toàn khi số lượng âm hoặc rỗng: tối thiểu hóa về 1', () => {
      const serverItems = [{ sku: 'ITEM-X', price: 10000, quantity: -5 }];
      const localItems = [{ sku: 'ITEM-Y', price: 20000, quantity: 0 }];

      const merged = mergeCartItems(serverItems, localItems);

      expect(merged[0].quantity).toBe(1);
      expect(merged[1].quantity).toBe(1);
    });
  });

  describe('PHẦN 2: Unit Test Kiểm Tra Tồn Kho (Inventory Check)', () => {
    const mockInventoryList = [
      { sku: 'SKU-AVAILABLE', stock: 50 },
      { sku: 'SKU-LOW-STOCK', stock: 3 },
      { sku: 'SKU-OUT-OF-STOCK', stock: 0 },
    ];

    test('1. Đủ hàng cho tất cả sản phẩm -> isAvailable = true', async () => {
      const cartItems = [
        { sku: 'SKU-AVAILABLE', name: 'Hàng nhiều', quantity: 5 },
        { sku: 'SKU-LOW-STOCK', name: 'Hàng ít', quantity: 2 },
      ];

      const result = await checkInventoryAvailability(cartItems, mockInventoryList);

      expect(result.isAvailable).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.validatedItems.every((i) => i.isSufficient)).toBe(true);
    });

    test('2. Phát hiện sản phẩm hết hàng hoàn toàn (OUT_OF_STOCK)', async () => {
      const cartItems = [
        { sku: 'SKU-OUT-OF-STOCK', name: 'Hàng hết sạch', quantity: 1 },
      ];

      const result = await checkInventoryAvailability(cartItems, mockInventoryList);

      expect(result.isAvailable).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('OUT_OF_STOCK');
      expect(result.errors[0].message).toMatch(/đã hết hàng/);
    });

    test('3. Phát hiện không đủ số lượng (INSUFFICIENT_STOCK) & gợi ý số lượng còn lại', async () => {
      const cartItems = [
        { sku: 'SKU-LOW-STOCK', name: 'Hàng chỉ còn 3', quantity: 10 },
      ];

      const result = await checkInventoryAvailability(cartItems, mockInventoryList);

      expect(result.isAvailable).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('INSUFFICIENT_STOCK');
      expect(result.errors[0].requestedQuantity).toBe(10);
      expect(result.errors[0].availableStock).toBe(3);
      expect(result.validatedItems[0].suggestedQuantity).toBe(3);
    });

    test('4. Phát hiện sản phẩm không tồn tại trong kho (NOT_FOUND)', async () => {
      const cartItems = [
        { sku: 'SKU-DOES-NOT-EXIST', name: 'Hàng ma', quantity: 1 },
      ];

      const result = await checkInventoryAvailability(cartItems, mockInventoryList);

      expect(result.isAvailable).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('NOT_FOUND');
    });

    test('5. Hỗ trợ hàm truy vấn Async giả lập Mongoose findOne', async () => {
      const asyncInventoryFinder = jest.fn().mockImplementation(async (sku) => {
        if (sku === 'ASYNC-SKU') return { sku, stock: 20 };
        return null;
      });

      const cartItems = [{ sku: 'ASYNC-SKU', quantity: 5 }];
      const result = await checkInventoryAvailability(cartItems, asyncInventoryFinder);

      expect(result.isAvailable).toBe(true);
      expect(asyncInventoryFinder).toHaveBeenCalledWith('ASYNC-SKU');
    });
  });

  describe('PHẦN 3: Tích hợp với Cart Mongoose Model (Method & Hooks)', () => {
    test('Phương thức recalculateTotal trên Mongoose Cart Schema tự động tính đúng tổng tiền', () => {
      const cart = new Cart({
        user: new mongoose.Types.ObjectId(),
        items: [
          {
            product: new mongoose.Types.ObjectId(),
            sku: 'CART-MODEL-SKU-1',
            name: 'Món 1',
            price: 50000,
            quantity: 3,
          },
          {
            product: new mongoose.Types.ObjectId(),
            sku: 'CART-MODEL-SKU-2',
            name: 'Món 2',
            price: 120000,
            quantity: 2,
          },
        ],
      });

      const total = cart.recalculateTotal();
      // 50000*3 + 120000*2 = 150000 + 240000 = 390000
      expect(total).toBe(390000);
      expect(cart.totalAmount).toBe(390000);
    });
  });
});
