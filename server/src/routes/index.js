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
const cartRoutes = require('./cart.routes');
// TODO (Tuần 2+): const productRoutes = require('./product.routes');
// TODO (Tuần 2+): const orderRoutes = require('./order.routes');

const router = express.Router();

router.use('/healthcheck', healthcheckRoutes);
router.use('/auth', authRoutes);
router.use('/cart', cartRoutes);
// router.use('/products', productRoutes);
// router.use('/orders', orderRoutes);

module.exports = router;
