/**
 * index.js (Root Router)
 * ------------------------------------------------------------
 * Gom toàn bộ các route con lại một chỗ, gắn tiền tố (prefix) cho từng nhóm.
 * app.js chỉ cần import duy nhất file này.
 * Khi thêm module mới (products, orders, cart...), chỉ cần require + use tại đây.
 * ------------------------------------------------------------
 */

const express = require('express');

const healthcheckRoutes = require('./healthcheck.routes');
const authRoutes = require('./auth.routes');
const orderRoutes = require('./order.routes');
const couponRoutes = require('./coupon.routes');
const paymentRoutes = require('./payment.routes');
const reviewRoutes = require('./review.routes');
const syncRoutes = require('./sync.routes');

const router = express.Router();

router.use('/healthcheck', healthcheckRoutes);
router.use('/auth', authRoutes);
router.use('/orders', orderRoutes);
router.use('/coupons', couponRoutes);
router.use('/payments', paymentRoutes);
router.use('/reviews', reviewRoutes);
router.use('/sync', syncRoutes);

module.exports = router;
