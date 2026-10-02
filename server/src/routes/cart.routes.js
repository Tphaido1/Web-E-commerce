const express = require('express');
const {
  getCart,
  addToCart,
  updateCartItemQuantity,
  removeCartItem,
  clearCart,
} = require('../controllers/cart.controller');
const { protect } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(protect);

router.get('/', getCart);
router.post('/items', addToCart);
router.put('/items/:id', updateCartItemQuantity);
router.delete('/items/:id', removeCartItem);
router.delete('/', clearCart);

module.exports = router;
