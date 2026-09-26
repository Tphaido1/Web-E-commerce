const express = require('express');
const {
  checkout,
  getMyOrders,
  getOrderById,
  trackOrderByCode,
  getAllOrders,
  updateOrderStatus,
} = require('../controllers/order.controller');
const { protect, checkRole } = require('../middlewares/auth.middleware');

const router = express.Router();

// 1. Tra cứu đơn hàng công khai qua mã đơn (hỗ trợ quét mã QR HMAC)
router.get('/track/:orderCode', trackOrderByCode);

// 2. Các routes yêu cầu đăng nhập người dùng (Customer)
router.use(protect);

router.post('/checkout', checkout);
router.get('/my-orders', getMyOrders);
router.get('/:id', getOrderById);

// 3. Các routes dành riêng cho Quản trị viên (Admin / Vendor)
router.get('/', checkRole('admin', 'vendor'), getAllOrders);
router.patch('/:id/status', checkRole('admin', 'vendor'), updateOrderStatus);

module.exports = router;
