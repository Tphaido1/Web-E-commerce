const express = require('express');

const cartController = require('../controllers/cart.controller');
const catchAsync = require('../utils/catchAsync');
const { resolveCartOwner } = require('../middlewares/cart.middleware');

const router = express.Router();

router.use(resolveCartOwner);
router.get('/', catchAsync(cartController.getCart));
router.post('/items', catchAsync(cartController.addItem));
router.patch('/items/:productId', catchAsync(cartController.updateItem));
router.delete('/items/:productId', catchAsync(cartController.removeItem));
router.delete('/', catchAsync(cartController.clearCart));

module.exports = router;