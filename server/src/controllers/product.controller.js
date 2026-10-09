const Product = require('../models/Product.model');
const Inventory = require('../models/Inventory.model');
const mongoose = require('mongoose');
const User = require('../models/User.model');
const Order = require('../models/Order.model');
const ApiResponse = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');
const { parseQuantity, badRequest } = require('../utils/cartItem.util');
const { isVendor, sameId } = require('../utils/vendorScope.util');
const { escapeRegex, httpError } = require('../utils/management.util');

const resolveVendor = async (req, current = null) => {
  if (isVendor(req.user)) {
    if (current && !sameId(current.vendor, req.user._id)) throw httpError('Product not found in your catalog', 404);
    if (req.body.vendor && !sameId(req.body.vendor, req.user._id)) throw httpError('Cannot assign another Vendor', 403);
    return req.user._id;
  }
  if (req.body.vendor === undefined) return current?.vendor || null;
  if (req.body.vendor === null || req.body.vendor === '') return null;
  if (!mongoose.isValidObjectId(req.body.vendor)) throw badRequest('Invalid Vendor ID');
  const vendor = await User.findOne({ _id: req.body.vendor, role: 'vendor', isActive: { $ne: false } });
  if (!vendor) throw badRequest('Vendor must be an active Vendor account');
  return vendor._id;
};

const normalizeSku = (sku) => typeof sku === 'string' ? sku.toUpperCase().trim() : '';
const checkSkuAvailability = async (skus, productId) => {
  if (skus.some((sku) => !sku) || new Set(skus).size !== skus.length) {
    throw badRequest('SKU sản phẩm và biến thể phải hợp lệ và không trùng lặp');
  }
  const conflict = await Inventory.findOne({ sku: { $in: skus }, ...(productId && { product: { $ne: productId } }) });
  if (conflict) throw Object.assign(new Error('SKU đã được sử dụng cho sản phẩm khác'), { statusCode: 409 });
};
const withInventory = async (products) => {
  const inventories = await Inventory.find({ product: { $in: products.map((product) => product._id) } }).lean();
  return products.map((product) => {
    const doc = product.toJSON ? product.toJSON() : product;
    const records = inventories.filter((entry) => String(entry.product) === String(doc._id));
    const variantSkus = new Set((doc.variants || []).map((variant) => variant.sku));
    const base = records.find((entry) => !variantSkus.has(entry.sku));
    return { ...doc, ...(base && { sku: base.sku, stock: base.stock }), variants: (doc.variants || []).map((variant) => {
      const record = records.find((entry) => entry.sku === variant.sku);
      return record ? { ...variant, stock: record.stock } : variant;
    }), image: doc.images?.[0] || null };
  });
};

/**
 * Lấy danh sách sản phẩm (hỗ trợ phân trang, lọc theo danh mục, khoảng giá, tìm kiếm và sắp xếp)
 * GET /api/v1/products
 */
const getProducts = catchAsync(async (req, res) => {
  const {
    category,
    minPrice,
    maxPrice,
    search,
    sort,
    page = 1,
    limit = 12,
  } = req.query;

  const query = { isActive: true, ...(req.managedCatalog && isVendor(req.user) && { vendor: req.user._id }) };

  // 1. Lọc theo danh mục
  if (category && category.trim()) {
    query.category = { $regex: new RegExp(`^${escapeRegex(category)}$`, 'i') };
  }

  // 2. Tìm kiếm theo tên hoặc mô tả
  if (search && search.trim()) {
    query.$or = [
      { name: { $regex: escapeRegex(search), $options: 'i' } },
      { description: { $regex: escapeRegex(search), $options: 'i' } },
    ];
  }

  // 3. Lọc theo khoảng giá
  if (minPrice !== undefined && minPrice !== '' || maxPrice !== undefined && maxPrice !== '') {
    query.price = {};
    if (minPrice !== undefined && minPrice !== '') {
      query.price.$gte = Number(minPrice);
    }
    if (maxPrice !== undefined && maxPrice !== '') {
      query.price.$lte = Number(maxPrice);
    }
  }

  // 4. Sắp xếp
  let sortOption = { createdAt: -1 };
  if (sort === 'price_asc' || sort === 'price-asc') {
    sortOption = { price: 1 };
  } else if (sort === 'price_desc' || sort === 'price-desc') {
    sortOption = { price: -1 };
  } else if (sort === 'rating') {
    sortOption = { ratingAverage: -1 };
  }

  // 5. Phân trang
  const currentPage = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 12));
  const skip = (currentPage - 1) * pageSize;

  const [totalProducts, rawProducts] = await Promise.all([
    Product.countDocuments(query),
    Product.find(query).sort(sortOption).skip(skip).limit(pageSize),
  ]);

  const totalPages = Math.ceil(totalProducts / pageSize) || 1;

  const products = await withInventory(rawProducts);

  return ApiResponse.success(res, 200, 'Lấy danh sách sản phẩm thành công', {
    products,
    pagination: {
      page: currentPage,
      limit: pageSize,
      totalProducts,
      totalPages,
    },
  });
});

const getManagedProducts = (req, res, next) => {
  req.managedCatalog = true;
  return getProducts(req, res, next);
};

/**
 * Lấy chi tiết một sản phẩm theo ID hoặc slug
 * GET /api/v1/products/:id
 */
const getProductById = catchAsync(async (req, res) => {
  const { id } = req.params;

  let product = null;
  if (id.match(/^[0-9a-fA-F]{24}$/)) {
    product = await Product.findById(id);
  }

  if (!product) {
    product = await Product.findOne({ slug: id });
  }

  if (!product) {
    const error = new Error('Không tìm thấy sản phẩm');
    error.statusCode = 404;
    throw error;
  }

  const [productData] = await withInventory([product]);

  return ApiResponse.success(res, 200, 'Lấy thông tin sản phẩm thành công', productData);
});

/**
 * Lấy danh sách danh mục sản phẩm duy nhất
 * GET /api/v1/products/categories
 */
const getCategories = catchAsync(async (req, res) => {
  const categories = await Product.distinct('category', { isActive: true });
  return ApiResponse.success(res, 200, 'Lấy danh sách danh mục thành công', categories);
});

/**
 * Tạo sản phẩm mới (Admin/Vendor)
 * POST /api/v1/products
 */
const createProduct = catchAsync(async (req, res) => {
  const vendor = await resolveVendor(req);
  const {
    name,
    description,
    category,
    price,
    salePrice,
    images = [],
    sku,
    stock = 0,
    variants = [],
  } = req.body;

  if (!name || !price) {
    const error = new Error('Tên sản phẩm và giá là bắt buộc');
    error.statusCode = 400;
    throw error;
  }

  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

  const productSku = normalizeSku(sku || ('SKU-' + Date.now()));
  if (!Array.isArray(variants)) throw badRequest('Danh sách biến thể không hợp lệ');
  const normalizedVariants = variants.map((variant) => ({ ...variant, sku: normalizeSku(variant.sku), stock: parseQuantity(variant.stock ?? 0, true) }));
  const productStock = parseQuantity(stock, true);
  await checkSkuAvailability([productSku, ...normalizedVariants.map((variant) => variant.sku)]);
  const product = await Product.create({
    vendor,
    name,
    slug,
    description,
    category: category || 'Chung',
    price,
    salePrice: salePrice || null,
    images,
    stock: productStock,
    variants: normalizedVariants,
  });

  // Tự động tạo bản ghi tồn kho tương ứng nếu có SKU
  await Inventory.create({
    product: product._id,
    sku: productSku,
    stock: productStock,
    reservedStock: 0,
    lowStockThreshold: 5,
  });

  for (const variant of product.variants) {
    await Inventory.create({ product: product._id, sku: variant.sku, variantId: String(variant._id), stock: variant.stock });
  }
  const [productData] = await withInventory([product]);
  return ApiResponse.success(res, 201, 'Tạo sản phẩm thành công', productData);
});

/**
 * Cập nhật sản phẩm (Admin/Vendor)
 * PUT /api/v1/products/:id
 */
const updateProduct = catchAsync(async (req, res) => {
  const { id } = req.params;

  const current = await Product.findById(id);
  if (!current) throw Object.assign(new Error('Không tìm thấy sản phẩm để cập nhật'), { statusCode: 404 });
  const vendor = await resolveVendor(req, current);
  const existingInventories = await Inventory.find({ product: current._id });
  const oldVariantSkus = new Set(current.variants.map((variant) => variant.sku));
  const baseInventory = existingInventories.find((entry) => !oldVariantSkus.has(entry.sku));
  const baseSku = normalizeSku(req.body.sku || baseInventory?.sku || ('SKU-' + id));
  const occupiedBase = existingInventories.find((entry) => entry.sku === baseSku);
  if (occupiedBase && String(occupiedBase._id) !== String(baseInventory?._id)) {
    throw badRequest('SKU đã thuộc một biến thể khác; vui lòng dùng SKU mới');
  }
  const fields = ['name', 'description', 'category', 'price', 'salePrice', 'images', 'stock', 'variants', 'isActive'];
  const update = Object.fromEntries(fields.filter((field) => req.body[field] !== undefined).map((field) => [field, req.body[field]]));
  update.vendor = vendor;
  // Existing SKU quantities belong exclusively to Inventory operations. A
  // catalog form may still submit its stale read-only stock snapshot.
  if (update.stock !== undefined) update.stock = baseInventory ? baseInventory.stock : current.stock;
  if (update.variants !== undefined) {
    if (!Array.isArray(update.variants)) throw badRequest('Danh sách biến thể không hợp lệ');
    update.variants = update.variants.map((variant) => {
      const sku = normalizeSku(variant.sku);
      const existing = (variant._id && current.variants.find((entry) => String(entry._id) === String(variant._id))) || current.variants.find((entry) => entry.sku === sku);
      const inventory = existing && existingInventories.find((entry) => entry.variantId === String(existing._id) || entry.sku === existing.sku);
      return { ...variant, ...(existing && { _id: existing._id }), sku,
        stock: existing ? (inventory?.stock ?? existing.stock) : parseQuantity(variant.stock ?? 0, true) };
    });
  }
  const variants = update.variants ?? current.variants;
  const variantIds = variants.map((variant) => variant._id && String(variant._id)).filter(Boolean);
  if (new Set(variantIds).size !== variantIds.length) throw badRequest('Mã định danh biến thể bị trùng lặp');
  for (const variant of variants) {
    const occupied = existingInventories.find((entry) => entry.sku === variant.sku);
    if (occupied && occupied.variantId && String(occupied.variantId) !== String(variant._id)) {
      throw badRequest('SKU đã thuộc một biến thể khác; vui lòng dùng SKU mới');
    }
  }
  const retainedSkus = [baseSku, ...variants.map((variant) => variant.sku)];
  const removedSkus = [...new Set([...existingInventories.map((entry) => entry.sku), ...oldVariantSkus])]
    .filter((sku) => !retainedSkus.includes(sku));
  if (removedSkus.length && await Order.exists({ status: { $in: ['pending', 'processing', 'shipping'] },
    items: { $elemMatch: { product: current._id, sku: { $in: removedSkus } } } })) {
    throw httpError('Cannot rename or remove SKUs referenced by open orders', 409);
  }
  await checkSkuAvailability([baseSku, ...variants.map((variant) => variant.sku)], current._id);
  const product = await Product.findOneAndUpdate({ _id: id, ...(isVendor(req.user) && { vendor: req.user._id }) }, update, { new: true, runValidators: true });
  if (!product) throw httpError('Product ownership changed; reload your catalog', 409);
  const baseFilter = baseInventory ? { _id: baseInventory._id } : { product: product._id, sku: baseSku };
  await Inventory.findOneAndUpdate(baseFilter, { $set: { product: product._id, sku: baseSku, variantId: null },
    ...(!baseInventory && { $setOnInsert: { stock: current.stock } }) }, { upsert: true, runValidators: true });
  if (update.variants !== undefined) {
    for (const variant of product.variants) {
      const existing = existingInventories.find((entry) => entry.variantId === String(variant._id) || entry.sku === variant.sku);
      const existingCatalogVariant = current.variants.find((entry) => String(entry._id) === String(variant._id));
      // Preserve legacy Product-stock fallback until an explicit migration; a
      // catalog edit must not create a competing stock source during checkout.
      if (!existing && existingCatalogVariant) continue;
      await Inventory.findOneAndUpdate(existing ? { _id: existing._id } : { product: product._id, sku: variant.sku },
        { $set: { product: product._id, sku: variant.sku, variantId: String(variant._id) },
          ...(!existing && { $setOnInsert: { stock: variant.stock } }) },
        { upsert: true, runValidators: true });
    }
    await Inventory.deleteMany({ product: product._id, sku: { $nin: retainedSkus } });
  }
  const [productData] = await withInventory([product]);
  return ApiResponse.success(res, 200, 'Cập nhật sản phẩm thành công', productData);

});

/**
 * Xóa sản phẩm (Admin)
 * DELETE /api/v1/products/:id
 */
const deleteProduct = catchAsync(async (req, res) => {
  const { id } = req.params;

  const product = await Product.findByIdAndUpdate(
    id,
    { isActive: false },
    { new: true }
  );

  if (!product) {
    const error = new Error('Không tìm thấy sản phẩm để xóa');
    error.statusCode = 404;
    throw error;
  }

  return ApiResponse.success(res, 200, 'Đã ẩn sản phẩm thành công', null);
});

module.exports = {
  getProducts,
  getManagedProducts,
  getProductById,
  getCategories,
  createProduct,
  updateProduct,
  deleteProduct,
};
