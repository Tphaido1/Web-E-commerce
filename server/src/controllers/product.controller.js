const Product = require('../models/Product.model');
const Inventory = require('../models/Inventory.model');
const ApiResponse = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');

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

  const query = { isActive: true };

  // 1. Lọc theo danh mục
  if (category && category.trim()) {
    query.category = { $regex: new RegExp(`^${category.trim()}$`, 'i') };
  }

  // 2. Tìm kiếm theo tên hoặc mô tả
  if (search && search.trim()) {
    query.$or = [
      { name: { $regex: search.trim(), $options: 'i' } },
      { description: { $regex: search.trim(), $options: 'i' } },
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
  const pageSize = Math.max(1, parseInt(limit, 10) || 12);
  const skip = (currentPage - 1) * pageSize;

  const [totalProducts, rawProducts] = await Promise.all([
    Product.countDocuments(query),
    Product.find(query).sort(sortOption).skip(skip).limit(pageSize),
  ]);

  const totalPages = Math.ceil(totalProducts / pageSize) || 1;

  // Thêm thuộc tính image tiện cho frontend nếu có images[0]
  const products = rawProducts.map((p) => {
    const doc = p.toJSON ? p.toJSON() : p.toObject();
    return {
      ...doc,
      image: doc.images && doc.images.length > 0 ? doc.images[0] : null,
    };
  });

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

  const doc = product.toJSON ? product.toJSON() : product.toObject();
  const productData = {
    ...doc,
    image: doc.images && doc.images.length > 0 ? doc.images[0] : null,
  };

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

  const product = await Product.create({
    name,
    slug,
    description,
    category: category || 'Chung',
    price,
    salePrice: salePrice || null,
    images,
    stock,
    variants,
  });

  // Tự động tạo bản ghi tồn kho tương ứng nếu có SKU
  const productSku = (sku || `SKU-${Date.now()}`).toUpperCase().trim();
  await Inventory.create({
    product: product._id,
    sku: productSku,
    stock,
    reservedStock: 0,
    lowStockThreshold: 5,
  });

  return ApiResponse.success(res, 201, 'Tạo sản phẩm thành công', product);
});

/**
 * Cập nhật sản phẩm (Admin/Vendor)
 * PUT /api/v1/products/:id
 */
const updateProduct = catchAsync(async (req, res) => {
  const { id } = req.params;

  const product = await Product.findByIdAndUpdate(id, req.body, {
    new: true,
    runValidators: true,
  });

  if (!product) {
    const error = new Error('Không tìm thấy sản phẩm để cập nhật');
    error.statusCode = 404;
    throw error;
  }

  return ApiResponse.success(res, 200, 'Cập nhật sản phẩm thành công', product);
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
  getProductById,
  getCategories,
  createProduct,
  updateProduct,
  deleteProduct,
};
