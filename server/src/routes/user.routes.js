const router = require('express').Router();
const { protect, optionalProtect, checkRole } = require('../middlewares/auth.middleware');
const {
  getProfile,
  updateProfile,
  changePassword,
  getWishlist,
  toggleWishlist,
  getRecommendations,
  getWishlistAnalytics,
  getUsers,
  getUserById,
  updateUser,
} = require('../controllers/user.controller');

// Profile & Password routes
router.get('/profile', protect, getProfile);
router.put('/profile', protect, updateProfile);
router.put('/change-password', protect, changePassword);

// Wishlist & Recommendation routes
router.get('/wishlist', protect, getWishlist);
router.post('/wishlist/:productId', protect, toggleWishlist);
router.delete('/wishlist/:productId', protect, toggleWishlist);
router.get('/recommendations', optionalProtect, getRecommendations);

// Admin-only Wishlist Analytics route
router.get('/wishlist-analytics', protect, checkRole('admin'), getWishlistAnalytics);

// Admin-only User management routes
router.get('/', protect, checkRole('admin'), getUsers);
router.get('/:id', protect, checkRole('admin'), getUserById);
router.patch('/:id', protect, checkRole('admin'), updateUser);

module.exports = router;
