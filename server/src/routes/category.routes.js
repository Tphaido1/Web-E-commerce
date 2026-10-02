const express = require('express');
const {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
} = require('../controllers/category.controller');
const { protect, checkRole } = require('../middlewares/auth.middleware');

const router = express.Router();

// 1. Public routes
router.get('/', getAllCategories);
router.get('/:id', getCategoryById);

// 2. Protected routes (Admin only)
router.use(protect);
router.post('/', checkRole('admin'), createCategory);
router.put('/:id', checkRole('admin'), updateCategory);
router.delete('/:id', checkRole('admin'), deleteCategory);

module.exports = router;
