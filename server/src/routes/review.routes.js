const express = require('express');
const {
  createReview,
  getProductReviews,
  getAllReviews,
  moderateReviewStatus,
} = require('../controllers/review.controller');
const { protect, checkRole } = require('../middlewares/auth.middleware');

const router = express.Router();

// 1. Xem đánh giá sản phẩm công khai
router.get('/product/:productId', getProductReviews);

// 2. Người dùng đã đăng nhập gửi đánh giá (Verified Purchase check)
router.post('/', protect, createReview);

// 3. Quản trị viên duyệt và quản lý đánh giá
router.get('/', protect, checkRole('admin', 'vendor'), getAllReviews);
router.patch('/:id/status', protect, checkRole('admin'), moderateReviewStatus);

module.exports = router;
