const express = require('express');
const {
  getProducts,
  getManagedProducts,
  getProductById,
  getCategories,
  createProduct,
  updateProduct,
  deleteProduct,
} = require('../controllers/product.controller');
const { protect, checkRole } = require('../middlewares/auth.middleware');

const router = express.Router();

// 1. Public routes: Xem danh sách, danh mục và chi tiết sản phẩm
router.get('/', getProducts);
router.get('/categories', getCategories);
router.get('/managed', protect, checkRole('admin', 'vendor'), getManagedProducts);
router.get('/:id', getProductById);

// 2. Protected routes: Quản trị sản phẩm (Admin / Vendor)
router.post('/', protect, checkRole('admin', 'vendor'), createProduct);
router.put('/:id', protect, checkRole('admin', 'vendor'), updateProduct);
router.delete('/:id', protect, checkRole('admin'), deleteProduct);

module.exports = router;
