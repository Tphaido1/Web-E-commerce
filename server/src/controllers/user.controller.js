const mongoose = require('mongoose');
const User = require('../models/User.model');
const Product = require('../models/Product.model');
const Inventory = require('../models/Inventory.model');
const ApiResponse = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');
const { getIo } = require('../config/socket');
const { pagination, escapeRegex, httpError } = require('../utils/management.util');

const roles = ['admin', 'vendor', 'customer'];
const safeFields = '_id email role isActive createdAt updatedAt';

const safeAdminUser = (user) => ({
  _id: user._id,
  email: user.email,
  role: user.role,
  isActive: user.isActive !== false,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const safeProfileUser = (user) => ({
  _id: user._id,
  email: user.email,
  name: user.name || '',
  phone: user.phone || '',
  address: user.address || '',
  avatar: user.avatar || '',
  wishlist: user.wishlist || [],
  role: user.role,
  isActive: user.isActive !== false,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const withInventory = async (products) => {
  if (!products || !products.length) return [];
  const inventories = await Inventory.find({ product: { $in: products.map((product) => product._id) } }).lean();
  return products.map((product) => {
    const doc = product.toJSON ? product.toJSON() : product;
    const records = inventories.filter((entry) => String(entry.product) === String(doc._id));
    const variantSkus = new Set((doc.variants || []).map((variant) => variant.sku));
    const base = records.find((entry) => !variantSkus.has(entry.sku));
    return {
      ...doc,
      ...(base && { sku: base.sku, stock: base.stock }),
      variants: (doc.variants || []).map((variant) => {
        const record = records.find((entry) => entry.sku === variant.sku);
        return record ? { ...variant, stock: record.stock } : variant;
      }),
      image: doc.images?.[0] || null,
    };
  });
};

// ==========================================
// 1. PROFILE KHÁCH HÀNG
// ==========================================
const getProfile = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id).select('-password -refreshToken').lean();
  if (!user) throw httpError('User not found', 404);
  return ApiResponse.success(res, 200, 'Lấy thông tin cá nhân thành công', safeProfileUser(user));
});

const updateProfile = catchAsync(async (req, res) => {
  const { name, phone, address, avatar } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = typeof name === 'string' ? name.trim() : '';
  if (phone !== undefined) updates.phone = typeof phone === 'string' ? phone.trim() : '';
  if (address !== undefined) updates.address = typeof address === 'string' ? address.trim() : '';
  if (avatar !== undefined) updates.avatar = typeof avatar === 'string' ? avatar.trim() : '';

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: updates },
    { new: true, runValidators: true }
  ).select('-password -refreshToken').lean();

  if (!user) throw httpError('User not found', 404);
  return ApiResponse.success(res, 200, 'Cập nhật thông tin thành công', safeProfileUser(user));
});

const changePassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    throw httpError('Vui lòng nhập mật khẩu hiện tại và mật khẩu mới', 400);
  }
  if (newPassword.length < 6) {
    throw httpError('Mật khẩu mới phải có ít nhất 6 ký tự', 400);
  }

  const user = await User.findById(req.user._id).select('+password');
  if (!user) throw httpError('User not found', 404);

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    throw httpError('Mật khẩu hiện tại không chính xác', 400);
  }

  user.password = newPassword;
  await user.save();

  return ApiResponse.success(res, 200, 'Đổi mật khẩu thành công');
});

// ==========================================
// 2. SẢN PHẨM YÊU THÍCH (WISHLIST) & GỢI Ý
// ==========================================
const getWishlist = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id).select('wishlist').lean();
  if (!user) throw httpError('User not found', 404);

  const productIds = user.wishlist || [];
  if (!productIds.length) {
    return ApiResponse.success(res, 200, 'Danh sách yêu thích trống', {
      products: [],
      total: 0,
    });
  }

  const rawProducts = await Product.find({ _id: { $in: productIds }, isActive: true }).lean();
  const products = await withInventory(rawProducts);

  return ApiResponse.success(res, 200, 'Lấy danh sách yêu thích thành công', {
    products,
    total: products.length,
  });
});

const toggleWishlist = catchAsync(async (req, res) => {
  const { productId } = req.params;
  if (!mongoose.isValidObjectId(productId)) {
    throw httpError('ID sản phẩm không hợp lệ', 400);
  }

  const product = await Product.findById(productId);
  if (!product || !product.isActive) {
    throw httpError('Sản phẩm không tồn tại hoặc đã ngừng kinh doanh', 404);
  }

  const user = await User.findById(req.user._id);
  if (!user) throw httpError('User not found', 404);

  const inWishlist = user.wishlist.some((id) => String(id) === String(productId));

  if (inWishlist) {
    user.wishlist = user.wishlist.filter((id) => String(id) !== String(productId));
  } else {
    user.wishlist.push(productId);
  }

  await user.save();

  return ApiResponse.success(
    res,
    200,
    inWishlist ? 'Đã bỏ yêu thích sản phẩm' : 'Đã thêm sản phẩm vào yêu thích',
    {
      inWishlist: !inWishlist,
      wishlistCount: user.wishlist.length,
      wishlist: user.wishlist,
      productId,
    }
  );
});

const getRecommendations = catchAsync(async (req, res) => {
  let wishlistedIds = [];
  let categories = [];

  if (req.user?._id) {
    const user = await User.findById(req.user._id).select('wishlist').lean();
    wishlistedIds = (user?.wishlist || []).map((id) => String(id));

    if (wishlistedIds.length > 0) {
      const wishlistedProducts = await Product.find({
        _id: { $in: wishlistedIds },
        isActive: true,
      }).select('category').lean();
      categories = [...new Set(wishlistedProducts.map((p) => p.category).filter(Boolean))];
    }
  } else if (req.query.categories) {
    categories = Array.isArray(req.query.categories)
      ? req.query.categories
      : req.query.categories.split(',').map((c) => c.trim()).filter(Boolean);
  }

  const query = { isActive: true };
  if (wishlistedIds.length > 0) {
    query._id = { $nin: wishlistedIds };
  }
  if (categories.length > 0) {
    query.category = { $in: categories };
  }

  let rawRecommendations = await Product.find(query)
    .sort({ ratingAverage: -1, reviewCount: -1, createdAt: -1 })
    .limit(8)
    .lean();

  if (rawRecommendations.length < 4) {
    const existingIds = new Set([
      ...wishlistedIds,
      ...rawRecommendations.map((p) => String(p._id)),
    ]);
    const fallbackProducts = await Product.find({
      _id: { $nin: Array.from(existingIds) },
      isActive: true,
    })
      .sort({ ratingAverage: -1, reviewCount: -1 })
      .limit(8 - rawRecommendations.length)
      .lean();
    rawRecommendations = [...rawRecommendations, ...fallbackProducts];
  }

  const recommendations = await withInventory(rawRecommendations);

  return ApiResponse.success(res, 200, 'Gợi ý sản phẩm dựa trên sở thích', {
    recommendations,
    matchedCategories: categories,
    total: recommendations.length,
  });
});

// ==========================================
// 3. ADMIN: THỐNG KÊ SẢN PHẨM YÊU THÍCH & GỢI Ý TƯƠNG ĐƯƠNG
// ==========================================
const getWishlistAnalytics = catchAsync(async (req, res) => {
  const [topWishlistedRaw, categoryBreakdown, totals] = await Promise.all([
    // 1. Top sản phẩm được yêu thích nhiều nhất
    User.aggregate([
      { $unwind: '$wishlist' },
      { $group: { _id: '$wishlist', likesCount: { $sum: 1 } } },
      { $sort: { likesCount: -1 } },
      { $limit: 15 },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: '$product' },
      { $match: { 'product.isActive': true } },
    ]),

    // 2. Phân bố lượt like theo danh mục
    User.aggregate([
      { $unwind: '$wishlist' },
      {
        $lookup: {
          from: 'products',
          localField: 'wishlist',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: '$product' },
      { $match: { 'product.isActive': true } },
      {
        $group: {
          _id: '$product.category',
          totalLikes: { $sum: 1 },
        },
      },
      { $sort: { totalLikes: -1 } },
    ]),

    // 3. Tổng số lượt like và số user có wishlist
    User.aggregate([
      { $project: { wishlistSize: { $size: { $ifNull: ['$wishlist', []] } } } },
      {
        $group: {
          _id: null,
          totalUsersWithWishlist: {
            $sum: { $cond: [{ $gt: ['$wishlistSize', 0] }, 1, 0] },
          },
          totalWishlistItems: { $sum: '$wishlistSize' },
        },
      },
    ]),
  ]);

  // Nạp thêm sản phẩm gợi ý tương đương cho từng sản phẩm top wishlist
  const topProductsWithEquivalent = await Promise.all(
    topWishlistedRaw.map(async (entry) => {
      const prod = entry.product;
      const equivalentProducts = await Product.find({
        category: prod.category,
        _id: { $ne: prod._id },
        isActive: true,
      })
        .select('_id name price images category ratingAverage')
        .limit(3)
        .lean();

      return {
        productId: prod._id,
        name: prod.name,
        category: prod.category,
        price: prod.price,
        image: prod.images?.[0] || null,
        ratingAverage: prod.ratingAverage,
        reviewCount: prod.reviewCount,
        likesCount: entry.likesCount,
        equivalentProducts: equivalentProducts.map((eq) => ({
          _id: eq._id,
          name: eq.name,
          price: eq.price,
          image: eq.images?.[0] || null,
          category: eq.category,
        })),
      };
    })
  );

  const stats = totals[0] || { totalUsersWithWishlist: 0, totalWishlistItems: 0 };

  return ApiResponse.success(res, 200, 'Thống kê sản phẩm yêu thích', {
    metrics: {
      totalUsersWithWishlist: stats.totalUsersWithWishlist,
      totalWishlistItems: stats.totalWishlistItems,
      topItemCount: topProductsWithEquivalent.length,
    },
    topProducts: topProductsWithEquivalent,
    categoryBreakdown: categoryBreakdown.map((item) => ({
      category: item._id || 'Chưa phân loại',
      count: item.totalLikes,
      totalLikes: item.totalLikes,
    })),
  });
});

// ==========================================
// 4. ADMIN: QUẢN LÝ TÀI KHOẢN NGƯỜI DÙNG (CŨ)
// ==========================================
const getUsers = catchAsync(async (req, res) => {
  const { page, limit, skip } = pagination(req.query);
  const filter = {};
  if (req.query.search?.trim()) filter.email = new RegExp(escapeRegex(req.query.search), 'i');
  if (req.query.role) {
    if (!roles.includes(req.query.role)) throw httpError('Invalid user role', 400);
    filter.role = req.query.role;
  }
  if (req.query.active !== undefined) {
    if (!['true', 'false'].includes(req.query.active)) throw httpError('Invalid active filter', 400);
    filter.isActive = req.query.active === 'true' ? { $ne: false } : false;
  }
  const [users, total] = await Promise.all([
    User.find(filter).select(safeFields).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(filter),
  ]);
  return ApiResponse.success(res, 200, 'Users loaded', {
    users: users.map(safeAdminUser),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

const getUserById = catchAsync(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw httpError('Invalid user ID', 400);
  const user = await User.findById(req.params.id).select(safeFields).lean();
  if (!user) throw httpError('User not found', 404);
  return ApiResponse.success(res, 200, 'User loaded', safeAdminUser(user));
});

const updateUser = catchAsync(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw httpError('Invalid user ID', 400);
  const { role, isActive } = req.body;
  if (Object.keys(req.body).some((key) => !['role', 'isActive'].includes(key))) {
    throw httpError('Only role and isActive can be updated', 400);
  }
  if (role === undefined && isActive === undefined) throw httpError('No user changes provided', 400);
  if (role !== undefined && !roles.includes(role)) throw httpError('Invalid user role', 400);
  if (isActive !== undefined && typeof isActive !== 'boolean') throw httpError('isActive must be boolean', 400);
  if (String(req.user._id) === req.params.id.toLowerCase() && ((role !== undefined && role !== 'admin') || isActive === false)) {
    throw httpError('You cannot deactivate or demote your own Admin account', 409);
  }
  const changes = { ...(role !== undefined && { role }), ...(isActive !== undefined && { isActive }), refreshToken: null };
  const user = await User.findByIdAndUpdate(req.params.id, { $set: changes }, { new: true, runValidators: true }).select(safeFields).lean();
  if (!user) throw httpError('User not found', 404);
  const io = req.app.get('io') || getIo();
  if (io) io.in('user_' + user._id).disconnectSockets(true);
  return ApiResponse.success(res, 200, 'User updated', safeAdminUser(user));
});

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
  getWishlist,
  toggleWishlist,
  getRecommendations,
  getWishlistAnalytics,
  getUsers,
  getUserById,
  updateUser,
};
