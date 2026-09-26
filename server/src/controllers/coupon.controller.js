const Coupon = require('../models/Coupon.model');
const ApiResponse = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');

/**
 * KIỂM TRA VÀ TÍNH TOÁN GIẢM GIÁ TỨC THÌ (PREVIEW APPLY)
 * POST /api/v1/coupons/apply
 */
const applyCoupon = catchAsync(async (req, res) => {
  const { code, orderTotal } = req.body;
  const userId = req.user ? req.user._id : null;

  if (!code || !code.trim()) {
    const error = new Error('Vui lòng cung cấp mã giảm giá');
    error.statusCode = 400;
    throw error;
  }

  const subtotal = Number(orderTotal);
  if (isNaN(subtotal) || subtotal <= 0) {
    const error = new Error('Giá trị đơn hàng không hợp lệ để tính giảm giá');
    error.statusCode = 400;
    throw error;
  }

  const cleanCode = code.toUpperCase().trim();
  const coupon = await Coupon.findOne({ code: cleanCode });

  if (!coupon) {
    const error = new Error(`Mã giảm giá "${cleanCode}" không tồn tại trong hệ thống`);
    error.statusCode = 404;
    throw error;
  }

  const validation = coupon.validateForOrder(userId, subtotal);
  if (!validation.isValid) {
    const error = new Error(validation.message);
    error.statusCode = 400;
    throw error;
  }

  const discountAmount = coupon.calculateDiscount(subtotal);
  const newTotal = Math.max(0, subtotal - discountAmount);

  return ApiResponse.success(res, 200, 'Áp dụng mã giảm giá thành công', {
    couponId: coupon._id,
    code: coupon.code,
    description: coupon.description,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    discountAmount,
    originalTotal: subtotal,
    newTotal,
  });
});

/**
 * TẠO MÃ GIẢM GIÁ MỚI (ADMIN ONLY)
 * POST /api/v1/coupons
 */
const createCoupon = catchAsync(async (req, res) => {
  const {
    code,
    description,
    discountType,
    discountValue,
    maxDiscountAmount,
    minOrderValue,
    startDate,
    endDate,
    usageLimit,
    userLimit,
  } = req.body;

  if (!code || !discountType || discountValue === undefined || !endDate) {
    const error = new Error('Thiếu các trường thông tin bắt buộc để tạo coupon');
    error.statusCode = 400;
    throw error;
  }

  const cleanCode = code.toUpperCase().trim();
  const existing = await Coupon.findOne({ code: cleanCode });
  if (existing) {
    const error = new Error(`Mã giảm giá "${cleanCode}" đã tồn tại`);
    error.statusCode = 409;
    throw error;
  }

  const newCoupon = await Coupon.create({
    code: cleanCode,
    description,
    discountType,
    discountValue,
    maxDiscountAmount,
    minOrderValue,
    startDate: startDate || new Date(),
    endDate,
    usageLimit,
    userLimit: userLimit || 1,
  });

  return ApiResponse.success(res, 201, 'Tạo mã giảm giá mới thành công', newCoupon);
});

/**
 * LẤY DANH SÁCH MÃ GIẢM GIÁ (ADMIN ONLY)
 * GET /api/v1/coupons
 */
const getAllCoupons = catchAsync(async (req, res) => {
  const coupons = await Coupon.find().sort({ createdAt: -1 }).lean();
  return ApiResponse.success(res, 200, 'Lấy danh sách mã giảm giá thành công', coupons);
});

module.exports = {
  applyCoupon,
  createCoupon,
  getAllCoupons,
};
