const mongoose = require('mongoose');
const Product = require('../models/Product.model');
const Inventory = require('../models/Inventory.model');

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });
const parseQuantity = (value, allowZero = false) => {
  if (!['string', 'number'].includes(typeof value) || (typeof value === 'string' && !value.trim())) {
    throw badRequest('Số lượng sản phẩm không hợp lệ');
  }
  const quantity = Number(value);
  if (!Number.isSafeInteger(quantity) || quantity < (allowZero ? 0 : 1)) {
    throw badRequest('Số lượng sản phẩm phải là số nguyên hợp lệ');
  }
  return quantity;
};

// Keep the established online checkout sale policy for every cart/order path.
const resolveItemPrice = (product, variant) => {
  const basePrice = variant ? variant.price : product.price;
  return product.salePrice && product.salePrice > 0 && product.salePrice < basePrice
    ? product.salePrice : basePrice;
};

// Resolve guest-controlled identity/price/name against the catalog before saving.
const resolveCartItem = async (rawItem) => {
  const productId = rawItem?.productId || rawItem?.product;
  if (!mongoose.isValidObjectId(productId) || typeof rawItem?.sku !== 'string' || !rawItem.sku.trim()) {
    throw badRequest('Vui lòng cung cấp productId và sku hợp lệ');
  }
  const quantity = parseQuantity(rawItem.quantity ?? 1);
  const sku = rawItem.sku.toUpperCase().trim();
  const product = await Product.findById(productId);
  if (!product || !product.isActive) {
    throw Object.assign(new Error('Sản phẩm không tồn tại hoặc đã ngừng kinh doanh'), { statusCode: 404 });
  }
  const inventory = await Inventory.findOne({ sku });
  if (!inventory || String(inventory.product) !== String(product._id)) {
    throw badRequest('SKU không thuộc sản phẩm hoặc không có trong tồn kho');
  }
  const variant = product.variants?.find((entry) => entry.sku.toUpperCase().trim() === sku);
  if ((rawItem.variantId && String(rawItem.variantId) !== String(variant?._id)) ||
      (inventory.variantId && String(inventory.variantId) !== String(variant?._id))) {
    throw badRequest('Biến thể không khớp SKU của sản phẩm');
  }
  if (quantity > inventory.stock) throw badRequest('Số lượng yêu cầu vượt quá tồn kho khả dụng');
  return {
    inventory,
    item: { product: product._id, sku, variantId: variant?._id || null, name: product.name,
      price: resolveItemPrice(product, variant), quantity,
      image: product.images?.[0] || null },
  };
};

module.exports = { parseQuantity, resolveCartItem, resolveItemPrice, badRequest };
