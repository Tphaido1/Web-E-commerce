const mongoose = require('mongoose');
const Product = require('../models/Product.model');
const Inventory = require('../models/Inventory.model');
const ApiResponse = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');
const { parseQuantity } = require('../utils/cartItem.util');
const { pagination, escapeRegex, httpError } = require('../utils/management.util');
const { isVendor, sameId } = require('../utils/vendorScope.util');

const inventoryView = (record) => {
  const doc = record.toObject ? record.toObject() : record;
  const variant = doc.product?.variants?.find((item) => String(item._id) === String(doc.variantId));
  return { ...doc, product: doc.product && { _id: doc.product._id, name: doc.product.name,
    images: doc.product.images, vendor: doc.product.vendor },
    variant: variant ? { color: variant.color, size: variant.size } : null,
    status: doc.stock === 0 ? 'out' : doc.stock <= doc.lowStockThreshold ? 'low' : 'in_stock' };
};
const getInventory = catchAsync(async (req, res) => {
  const { page, limit, skip } = pagination(req.query);
  const stockStatus = req.query.stockStatus || 'all';
  if (!['all', 'low', 'out'].includes(stockStatus)) throw httpError('Invalid stock status', 400);
  const products = await Product.find(isVendor(req.user) ? { vendor: req.user._id } : {}).select('_id name').lean();
  const filter = { product: { $in: products.map((product) => product._id) } };
  if (req.query.search?.trim()) {
    const search = new RegExp(escapeRegex(req.query.search), 'i');
    filter.$or = [{ sku: search }, { product: { $in: products.filter((product) => search.test(product.name)).map((product) => product._id) } }];
  }
  if (stockStatus === 'out') filter.stock = 0;
  if (stockStatus === 'low') {
    filter.stock = { $gt: 0 };
    filter.$expr = { $lte: ['$stock', '$lowStockThreshold'] };
  }
  const [records, total] = await Promise.all([
    Inventory.find(filter).populate('product', 'name images variants vendor').sort({ sku: 1 }).skip(skip).limit(limit).lean(),
    Inventory.countDocuments(filter),
  ]);
  return ApiResponse.success(res, 200, 'Inventory loaded', { inventory: records.map(inventoryView), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});
const getAuthorizedInventory = async (req) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw httpError('Invalid inventory ID', 400);
  const record = await Inventory.findById(req.params.id).populate('product', 'name images variants vendor');
  if (!record || !record.product || (isVendor(req.user) && !sameId(record.product.vendor, req.user._id))) {
    throw httpError('Inventory record not found', 404);
  }
  return record;
};
const restock = catchAsync(async (req, res) => {
  const quantity = parseQuantity(req.body.quantity);
  const record = await getAuthorizedInventory(req);
  // Inventory is authoritative for checkout/cancellation and catalog hydration.
  // Atomic increments compose with deductions/refunds; never write a read snapshot.
  const updated = await Inventory.findOneAndUpdate(
    { _id: record._id, product: record.product._id, stock: { $lte: Number.MAX_SAFE_INTEGER - quantity } },
    { $inc: { stock: quantity } }, { new: true, runValidators: true }
  ).populate('product', 'name images variants vendor');
  if (!updated) throw httpError('Stock changed or would exceed the supported maximum; reload inventory', 409);
  return ApiResponse.success(res, 200, 'Inventory restocked', inventoryView(updated));
});
const updateThreshold = catchAsync(async (req, res) => {
  const lowStockThreshold = parseQuantity(req.body.lowStockThreshold, true);
  const record = await getAuthorizedInventory(req);
  const updated = await Inventory.findOneAndUpdate({ _id: record._id, product: record.product._id },
    { $set: { lowStockThreshold } }, { new: true, runValidators: true }).populate('product', 'name images variants vendor');
  if (!updated) throw httpError('Inventory record changed; reload inventory', 409);
  return ApiResponse.success(res, 200, 'Stock threshold updated', inventoryView(updated));
});
module.exports = { getInventory, restock, updateThreshold };
