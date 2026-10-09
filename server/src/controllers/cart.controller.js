const Cart = require('../models/Cart.model');
const Inventory = require('../models/Inventory.model');
const ApiResponse = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');
const { parseQuantity, resolveCartItem } = require('../utils/cartItem.util');

/**
 * Lấy giỏ hàng của người dùng hiện tại
 * GET /api/v1/cart
 */
const getCart = catchAsync(async (req, res) => {
  const userId = req.user._id;

  let cart = await Cart.findOne({ user: userId });
  if (!cart) {
    cart = await Cart.create({ user: userId, items: [] });
  }

  return ApiResponse.success(res, 200, 'Lấy giỏ hàng thành công', cart);
});

/**
 * Thêm sản phẩm vào giỏ hàng
 * POST /api/v1/cart/items
 */
const addToCart = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { item: resolvedItem, inventory } = await resolveCartItem(req.body);
  const targetSku = resolvedItem.sku;
  const requestedQty = resolvedItem.quantity;

  // 4. Cập nhật hoặc tạo giỏ hàng
  let cart = await Cart.findOne({ user: userId });
  if (!cart) {
    cart = new Cart({ user: userId, items: [] });
  }

  const existingItemIndex = cart.items.findIndex((item) => item.sku.toUpperCase() === targetSku);

  if (existingItemIndex > -1) {
    const newTotalQty = cart.items[existingItemIndex].quantity + requestedQty;
    if (inventory.stock < newTotalQty) {
      const error = new Error(`Tổng số lượng trong giỏ (${newTotalQty}) vượt quá tồn kho khả dụng (${inventory?.stock ?? 0})`);
      error.statusCode = 400;
      throw error;
    }
    Object.assign(cart.items[existingItemIndex], resolvedItem, { quantity: newTotalQty });
  } else {
    cart.items.push(resolvedItem);
  }

  await cart.save();

  return ApiResponse.success(res, 200, 'Đã thêm sản phẩm vào giỏ hàng', cart);
});

/**
 * Cập nhật số lượng sản phẩm trong giỏ hàng
 * PUT /api/v1/cart/items/:id
 */
const updateCartItemQuantity = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { id: itemId } = req.params;
  const { quantity } = req.body;

  const cart = await Cart.findOne({ user: userId });
  if (!cart) {
    const error = new Error('Không tìm thấy giỏ hàng');
    error.statusCode = 404;
    throw error;
  }

  const item = cart.items.id(itemId);
  if (!item) {
    const error = new Error('Không tìm thấy món hàng trong giỏ');
    error.statusCode = 404;
    throw error;
  }

  const newQty = parseQuantity(quantity, true);
  if (newQty <= 0) {
    cart.items.pull(itemId);
  } else {
    // Kiểm tra tồn kho
    const inventory = await Inventory.findOne({ sku: item.sku.toUpperCase() });
    if (!inventory || String(inventory.product) !== String(item.product) || inventory.stock < newQty) {
      const error = new Error(`Số lượng yêu cầu (${newQty}) vượt quá tồn kho còn lại (${inventory?.stock ?? 0})`);
      error.statusCode = 400;
      throw error;
    }
    item.quantity = newQty;
  }

  await cart.save();

  return ApiResponse.success(res, 200, 'Cập nhật số lượng thành công', cart);
});

/**
 * Xóa một sản phẩm khỏi giỏ hàng
 * DELETE /api/v1/cart/items/:id
 */
const removeCartItem = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { id: itemId } = req.params;

  const cart = await Cart.findOne({ user: userId });
  if (!cart) {
    const error = new Error('Không tìm thấy giỏ hàng');
    error.statusCode = 404;
    throw error;
  }

  cart.items.pull(itemId);
  await cart.save();

  return ApiResponse.success(res, 200, 'Đã xóa sản phẩm khỏi giỏ hàng', cart);
});

/**
 * Xóa toàn bộ giỏ hàng
 * DELETE /api/v1/cart
 */
const clearCart = catchAsync(async (req, res) => {
  const userId = req.user._id;

  const cart = await Cart.findOne({ user: userId });
  if (cart) {
    cart.items = [];
    await cart.save();
  }

  return ApiResponse.success(res, 200, 'Đã làm trống giỏ hàng', cart || { items: [], totalAmount: 0 });
});

module.exports = {
  getCart,
  addToCart,
  updateCartItemQuantity,
  removeCartItem,
  clearCart,
};
