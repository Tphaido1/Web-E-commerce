const Coupon = require('../src/models/Coupon.model');
const mongoose = require('mongoose');

describe('Coupon Engine Unit Tests (Level 4 Verification Ladder)', () => {
  const userId = new mongoose.Types.ObjectId();
  const otherUserId = new mongoose.Types.ObjectId();

  test('Phần trăm giảm giá: Tính đúng và áp dụng trần giới hạn tối đa (maxDiscountAmount)', () => {
    const couponWithCap = new Coupon({
      code: 'GIAM10_CAP50K',
      discountType: 'percentage',
      discountValue: 10, // 10%
      maxDiscountAmount: 50000, // Tối đa 50k
      minOrderValue: 100000,
      endDate: new Date(Date.now() + 86400000),
    });

    // Đơn 200k -> 10% là 20k (chưa chạm cap 50k)
    expect(couponWithCap.calculateDiscount(200000)).toBe(20000);

    // Đơn 1 triệu -> 10% là 100k -> phải bị khống chế ở trần 50k
    expect(couponWithCap.calculateDiscount(1000000)).toBe(50000);
  });

  test('Giảm giá tiền mặt cố định (fixed): Không vượt quá giá trị đơn hàng', () => {
    const fixedCoupon = new Coupon({
      code: 'GIAM50K',
      discountType: 'fixed',
      discountValue: 50000,
      endDate: new Date(Date.now() + 86400000),
    });

    expect(fixedCoupon.calculateDiscount(300000)).toBe(50000);
    // Nếu đơn hàng 30k mà coupon 50k -> giảm tối đa 30k (không âm tiền)
    expect(fixedCoupon.calculateDiscount(30000)).toBe(30000);
  });

  test('Từ chối coupon nếu đã hết hạn sử dụng', () => {
    const expiredCoupon = new Coupon({
      code: 'EXPIRED_CODE',
      discountType: 'percentage',
      discountValue: 10,
      startDate: new Date(Date.now() - 172800000), // 2 ngày trước
      endDate: new Date(Date.now() - 86400000), // Hôm qua
    });

    const result = expiredCoupon.validateForOrder(userId, 500000);
    expect(result.isValid).toBe(false);
    expect(result.message).toMatch(/hết hạn/);
  });

  test('Từ chối coupon nếu chưa đến ngày áp dụng', () => {
    const futureCoupon = new Coupon({
      code: 'FUTURE_CODE',
      discountType: 'percentage',
      discountValue: 10,
      startDate: new Date(Date.now() + 86400000), // Ngày mai
      endDate: new Date(Date.now() + 172800000),
    });

    const result = futureCoupon.validateForOrder(userId, 500000);
    expect(result.isValid).toBe(false);
    expect(result.message).toMatch(/chưa đến ngày/);
  });

  test('Từ chối coupon nếu bị vô hiệu hóa (isActive = false)', () => {
    const disabledCoupon = new Coupon({
      code: 'DISABLED_CODE',
      discountType: 'fixed',
      discountValue: 20000,
      endDate: new Date(Date.now() + 86400000),
      isActive: false,
    });

    const result = disabledCoupon.validateForOrder(userId, 500000);
    expect(result.isValid).toBe(false);
    expect(result.message).toMatch(/vô hiệu hóa/);
  });

  test('Từ chối coupon nếu đơn hàng không đạt giá trị tối thiểu (minOrderValue)', () => {
    const minOrderCoupon = new Coupon({
      code: 'MIN_300K',
      discountType: 'fixed',
      discountValue: 30000,
      minOrderValue: 300000,
      endDate: new Date(Date.now() + 86400000),
    });

    const failResult = minOrderCoupon.validateForOrder(userId, 250000);
    expect(failResult.isValid).toBe(false);
    expect(failResult.message).toMatch(/tối thiểu/);

    const passResult = minOrderCoupon.validateForOrder(userId, 350000);
    expect(passResult.isValid).toBe(true);
  });

  test('Từ chối coupon khi đã hết lượt dùng toàn hệ thống (usageLimit)', () => {
    const limitedCoupon = new Coupon({
      code: 'LIMITED_10',
      discountType: 'percentage',
      discountValue: 10,
      usageLimit: 5,
      usageCount: 5, // Đã dùng hết 5 lượt
      endDate: new Date(Date.now() + 86400000),
    });

    const result = limitedCoupon.validateForOrder(userId, 200000);
    expect(result.isValid).toBe(false);
    expect(result.message).toMatch(/hết lượt sử dụng/);
  });

  test('Từ chối coupon khi user đã dùng hết số lượt cá nhân (userLimit = 1)', () => {
    const userLimitCoupon = new Coupon({
      code: 'ONE_TIME_PER_USER',
      discountType: 'percentage',
      discountValue: 15,
      userLimit: 1,
      endDate: new Date(Date.now() + 86400000),
      usedBy: [
        {
          user: userId,
          usedAt: new Date(),
        },
      ],
    });

    // userId này đã dùng -> reject
    const userResult = userLimitCoupon.validateForOrder(userId, 200000);
    expect(userResult.isValid).toBe(false);
    expect(userResult.message).toMatch(/hết số lượt/);

    // otherUserId chưa dùng -> pass
    const otherResult = userLimitCoupon.validateForOrder(otherUserId, 200000);
    expect(otherResult.isValid).toBe(true);
  });
});
