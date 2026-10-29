const express = require('express');
const {
  createVNPayPaymentUrl,
  vnpayReturn,
  vnpayIpn,
  simulateSandboxPayment,
  getOrderAuditLogs,
} = require('../controllers/payment.controller');
const { protect, checkRole } = require('../middlewares/auth.middleware');

const router = express.Router();

// 1. Webhook và Return URL công khai từ cổng thanh toán VNPay
router.get('/vnpay-return', vnpayReturn);
router.get('/vnpay-ipn', vnpayIpn);

// 2. Yêu cầu đăng nhập để tạo URL thanh toán & mô phỏng Sandbox
router.post('/create-vnpay-url', protect, createVNPayPaymentUrl);
router.post('/simulate-sandbox-success', protect, simulateSandboxPayment);

// 3. Quản trị viên tra cứu Audit Log thanh toán
router.get('/audit-logs/:orderId', protect, checkRole('admin', 'vendor'), getOrderAuditLogs);

module.exports = router;
