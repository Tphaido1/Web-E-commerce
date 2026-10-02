const Category = require('../models/Category.model');
const ApiResponse = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');

/**
 * Lấy danh sách danh mục
 * GET /api/v1/categories
 */
const getAllCategories = catchAsync(async (req, res) => {
  const filter = {};
  if (req.query.all !== 'true') {
    filter.isActive = true;
  }

  const categories = await Category.find(filter).sort({ name: 1 });
  return ApiResponse.success(res, 200, 'Lấy danh sách danh mục thành công', categories);
});

/**
 * Lấy chi tiết danh mục theo ID hoặc Slug
 * GET /api/v1/categories/:id
 */
const getCategoryById = catchAsync(async (req, res) => {
  const { id } = req.params;

  let category = null;
  if (id.match(/^[0-9a-fA-F]{24}$/)) {
    category = await Category.findById(id);
  }

  if (!category) {
    category = await Category.findOne({ slug: id });
  }

  if (!category) {
    const error = new Error('Không tìm thấy danh mục');
    error.statusCode = 404;
    throw error;
  }

  return ApiResponse.success(res, 200, 'Lấy chi tiết danh mục thành công', category);
});

/**
 * Tạo danh mục mới (Admin)
 * POST /api/v1/categories
 */
const createCategory = catchAsync(async (req, res) => {
  const { name, description, image } = req.body;

  if (!name || !name.trim()) {
    const error = new Error('Tên danh mục là bắt buộc');
    error.statusCode = 400;
    throw error;
  }

  const existing = await Category.findOne({ name: name.trim() });
  if (existing) {
    const error = new Error('Tên danh mục đã tồn tại');
    error.statusCode = 400;
    throw error;
  }

  const newCategory = await Category.create({
    name: name.trim(),
    description: description || '',
    image: image || null,
  });

  return ApiResponse.success(res, 201, 'Tạo danh mục thành công', newCategory);
});

/**
 * Cập nhật danh mục (Admin)
 * PUT /api/v1/categories/:id
 */
const updateCategory = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { name, description, image, isActive } = req.body;

  const category = await Category.findById(id);
  if (!category) {
    const error = new Error('Không tìm thấy danh mục để cập nhật');
    error.statusCode = 404;
    throw error;
  }

  if (name && name.trim() !== category.name) {
    const duplicate = await Category.findOne({ name: name.trim(), _id: { $ne: id } });
    if (duplicate) {
      const error = new Error('Tên danh mục đã bị trùng với danh mục khác');
      error.statusCode = 400;
      throw error;
    }
    category.name = name.trim();
  }

  if (description !== undefined) category.description = description;
  if (image !== undefined) category.image = image;
  if (isActive !== undefined) category.isActive = isActive;

  await category.save();

  return ApiResponse.success(res, 200, 'Cập nhật danh mục thành công', category);
});

/**
 * Xóa/ẩn danh mục (Admin)
 * DELETE /api/v1/categories/:id
 */
const deleteCategory = catchAsync(async (req, res) => {
  const { id } = req.params;

  const category = await Category.findByIdAndUpdate(
    id,
    { isActive: false },
    { new: true }
  );

  if (!category) {
    const error = new Error('Không tìm thấy danh mục để xóa');
    error.statusCode = 404;
    throw error;
  }

  return ApiResponse.success(res, 200, 'Đã ẩn danh mục thành công', null);
});

module.exports = {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
};
