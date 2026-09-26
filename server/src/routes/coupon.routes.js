const express = require('express');
const { applyCoupon, createCoupon, getAllCoupons } = require('../controllers/coupon.controller');
const { protect, checkRole } = require('../middlewares/auth.middleware');

const router = express.Router();

// 1. Áp dụng mã giảm giá (Có thể dùng khi login hoặc vãng lai)
router.post('/apply', (req, res, next) => {
  // Cho phép cả user có token hoặc chưa có token gọi API apply
  if (req.headers.authorization) {
    return protect(req, res, next);
  }
  return next();
}, applyCoupon);

// 2. Quản lý coupon (Yêu cầu quyền Admin)
router.use(protect);
router.post('/', checkRole('admin'), createCoupon);
router.get('/', checkRole('admin'), getAllCoupons);

module.exports = router;
