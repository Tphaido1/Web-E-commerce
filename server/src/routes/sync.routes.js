const express = require('express');
const { syncOfflineOrders, syncOfflineCart } = require('../controllers/sync.controller');
const { protect } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(protect);

router.post('/offline-orders', syncOfflineOrders);
router.post('/offline-cart', syncOfflineCart);

module.exports = router;
