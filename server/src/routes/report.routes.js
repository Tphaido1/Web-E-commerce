const express = require('express');
const { exportOrdersExcel, exportOrderInvoicePdf } = require('../controllers/report.controller');
const { protect, checkRole } = require('../middlewares/auth.middleware');

const router = express.Router();

// Xuất báo cáo danh sách đơn hàng Excel (.xlsx) cho Chủ shop
router.get('/orders/excel', protect, checkRole('admin'), exportOrdersExcel);

// Xuất hóa đơn bán lẻ PDF kèm mã QR tra cứu (Admin & Khách hàng sở hữu đơn)
router.get('/orders/:id/invoice-pdf', protect, exportOrderInvoicePdf);

module.exports = router;
