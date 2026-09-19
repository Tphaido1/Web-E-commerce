const mongoose = require('mongoose');

const Cart = require('../models/Cart.model');
const ApiResponse = require('../utils/apiResponse');

const createError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const getOwnerFilter = (owner) => (owner.userId ? { userId: owner.userId } : { guestId: owner.guestId });

const normalizeVariantId = (variantId) => (variantId === undefined || variantId === '' ? null : variantId);

const validateItemInput = ({ productId, quantity, price }) => {
  if (!mongoose.isValidObjectId(productId)) throw createError(400, 'productId không hợp lệ');
  if (!Number.isInteger(quantity) || quantity < 1) throw createError(400, 'quantity phải là số nguyên lớn hơn 0');
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) {
    throw createError(400, 'price phải là số không âm');
  }
};

const serializeCart = (cart, owner) => {
  const items = cart?.items || [];
  return {
    id: cart?._id || null,
    userId: cart?.userId || owner.userId || null,
    guestId: cart?.guestId || owner.guestId || null,
    items,
    itemCount: items.reduce((total, item) => total + item.quantity, 0),
    totalAmount: items.reduce((total, item) => total + item.quantity * item.price, 0),
  };
};

const sendCart = (res, statusCode, message, cart, owner) =>
  ApiResponse.success(res, statusCode, message, { cart: serializeCart(cart, owner) });

const findCart = (owner) => Cart.findOne(getOwnerFilter(owner));

exports.getCart = async (req, res) => {
  const cart = await findCart(req.cartOwner);
  return sendCart(res, 200, 'Lấy giỏ hàng thành công', cart, req.cartOwner);
};

exports.addItem = async (req, res) => {
  const { productId, variantId, quantity, price } = req.body || {};
  validateItemInput({ productId, quantity, price });
  const normalizedVariantId = normalizeVariantId(variantId);
  const ownerFilter = getOwnerFilter(req.cartOwner);
  const itemFilter = { ...ownerFilter, items: { $elemMatch: { productId, variantId: normalizedVariantId } } };

  // $inc giúp các lần bấm thêm liên tiếp không ghi đè quantity của nhau.
  let cart = await Cart.findOneAndUpdate(
    itemFilter,
    { $inc: { 'items.$.quantity': quantity } },
    { new: true }
  );

  if (!cart) {
    cart = await Cart.findOneAndUpdate(
      ownerFilter,
      { $push: { items: { productId, variantId: normalizedVariantId, quantity, price } } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  }

  return sendCart(res, 200, 'Đã thêm sản phẩm vào giỏ hàng', cart, req.cartOwner);
};

exports.updateItem = async (req, res) => {
  const { productId } = req.params;
  const { variantId, quantity } = req.body || {};
  if (!mongoose.isValidObjectId(productId) || !Number.isInteger(quantity) || quantity < 1) {
    throw createError(400, 'productId hoặc quantity không hợp lệ');
  }

  const ownerFilter = getOwnerFilter(req.cartOwner);
  const normalizedVariantId = normalizeVariantId(variantId);
  let cart = await findCart(req.cartOwner);
  if (!cart) throw createError(404, 'Không tìm thấy giỏ hàng');

  // Đổi quantity thành delta rồi dùng $inc để update vẫn atomic khi UI gửi liên tiếp.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const item = cart.items.find(
      (entry) => entry.productId.toString() === productId && entry.variantId === normalizedVariantId
    );
    if (!item) throw createError(404, 'Không tìm thấy sản phẩm trong giỏ hàng');

    const delta = quantity - item.quantity;
    if (delta === 0) return sendCart(res, 200, 'Đã cập nhật giỏ hàng', cart, req.cartOwner);

    cart = await Cart.findOneAndUpdate(
      { ...ownerFilter, items: { $elemMatch: { productId, variantId: normalizedVariantId, quantity: item.quantity } } },
      { $inc: { 'items.$.quantity': delta } },
      { new: true }
    );
    if (cart) return sendCart(res, 200, 'Đã cập nhật giỏ hàng', cart, req.cartOwner);
    cart = await findCart(req.cartOwner);
  }

  throw createError(409, 'Giỏ hàng vừa thay đổi, vui lòng thử lại');
};

exports.removeItem = async (req, res) => {
  const { productId } = req.params;
  const { variantId } = req.body || {};
  if (!mongoose.isValidObjectId(productId)) throw createError(400, 'productId không hợp lệ');

  const cart = await Cart.findOneAndUpdate(
    getOwnerFilter(req.cartOwner),
    { $pull: { items: { productId, variantId: normalizeVariantId(variantId) } } },
    { new: true }
  );

  return sendCart(res, 200, 'Đã xóa sản phẩm khỏi giỏ hàng', cart, req.cartOwner);
};

exports.clearCart = async (req, res) => {
  const cart = await Cart.findOneAndUpdate(getOwnerFilter(req.cartOwner), { $set: { items: [] } }, { new: true });
  return sendCart(res, 200, 'Đã xóa toàn bộ giỏ hàng', cart, req.cartOwner);
};

exports.mergeGuestCart = async (userId, guestId) => {
  if (!guestId) return null;

  const guestCart = await Cart.findOne({ guestId });
  if (!guestCart) return Cart.findOne({ userId });

  // Gộp từng item bằng $inc để sản phẩm trùng variant được cộng quantity an toàn.
  for (const item of guestCart.items) {
    const itemFilter = { userId, items: { $elemMatch: { productId: item.productId, variantId: item.variantId } } };
    let userCart = await Cart.findOneAndUpdate(
      itemFilter,
      { $inc: { 'items.$.quantity': item.quantity } },
      { new: true }
    );

    if (!userCart) {
      userCart = await Cart.findOneAndUpdate(
        { userId },
        { $push: { items: item } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
    }
  }

  await Cart.deleteOne({ guestId });
  return Cart.findOne({ userId });
};