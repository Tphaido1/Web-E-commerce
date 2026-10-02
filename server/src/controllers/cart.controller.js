const Cart = require('../models/Cart.model');
const Product = require('../models/Product.model');
const Inventory = require('../models/Inventory.model');
const ApiResponse = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');

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
  const { productId, sku, quantity = 1 } = req.body;

  if (!productId || !sku) {
    const error = new Error('Vui lòng cung cấp productId và sku');
    error.statusCode = 400;
    throw error;
  }

  const requestedQty = Math.max(1, parseInt(quantity, 10) || 1);

  // 1. Kiểm tra sản phẩm tồn tại
  const product = await Product.findById(productId);
  if (!product || !product.isActive) {
    const error = new Error('Sản phẩm không tồn tại hoặc đã ngừng kinh doanh');
    error.statusCode = 404;
    throw error;
  }

  // 2. Xác định biến thể và giá
  const targetSku = sku.toUpperCase().trim();
  let itemPrice = product.salePrice || product.price;
  let variantId = null;

  if (Array.isArray(product.variants) && product.variants.length > 0) {
    const matchedVariant = product.variants.find((v) => v.sku.toUpperCase() === targetSku);
    if (matchedVariant) {
      itemPrice = matchedVariant.price;
      variantId = matchedVariant._id;
    }
  }

  // 3. Kiểm tra tồn kho khả dụng
  const inventory = await Inventory.findOne({ sku: targetSku });
  if (!inventory || inventory.stock < requestedQty) {
    const available = inventory ? inventory.stock : 0;
    const error = new Error(`Sản phẩm không đủ tồn kho (chỉ còn ${available} sản phẩm khả dụng)`);
    error.statusCode = 400;
    throw error;
  }

  // 4. Cập nhật hoặc tạo giỏ hàng
  let cart = await Cart.findOne({ user: userId });
  if (!cart) {
    cart = new Cart({ user: userId, items: [] });
  }

  const existingItemIndex = cart.items.findIndex((item) => item.sku.toUpperCase() === targetSku);

  if (existingItemIndex > -1) {
    const newTotalQty = cart.items[existingItemIndex].quantity + requestedQty;
    if (inventory.stock < newTotalQty) {
      const error = new Error(`Tổng số lượng trong giỏ (${newTotalQty}) vượt quá tồn kho khả dụng (${inventory.stock})`);
      error.statusCode = 400;
      throw error;
    }
    cart.items[existingItemIndex].quantity = newTotalQty;
  } else {
    cart.items.push({
      product: product._id,
      sku: targetSku,
      variantId,
      name: product.name,
      price: itemPrice,
      quantity: requestedQty,
      image: product.images && product.images.length > 0 ? product.images[0] : null,
    });
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

  const newQty = parseInt(quantity, 10);
  if (newQty <= 0) {
    cart.items.pull(itemId);
  } else {
    // Kiểm tra tồn kho
    const inventory = await Inventory.findOne({ sku: item.sku.toUpperCase() });
    if (inventory && inventory.stock < newQty) {
      const error = new Error(`Số lượng yêu cầu (${newQty}) vượt quá tồn kho còn lại (${inventory.stock})`);
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
