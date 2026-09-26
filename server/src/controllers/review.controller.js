const Review = require('../models/Review.model');
const Order = require('../models/Order.model');
const Product = require('../models/Product.model');
const ApiResponse = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');

/**
 * GỬI ĐÁNH GIÁ SẢN PHẨM (YÊU CẦU ĐÃ MUA HÀNG - VERIFIED PURCHASE)
 * POST /api/v1/reviews
 */
const createReview = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { productId, rating, comment, orderId } = req.body;

  if (!productId || !rating || !comment) {
    const error = new Error('Vui lòng cung cấp mã sản phẩm, số sao đánh giá (1-5) và nội dung nhận xét');
    error.statusCode = 400;
    throw error;
  }

  const numericRating = Number(rating);
  if (isNaN(numericRating) || numericRating < 1 || numericRating > 5) {
    const error = new Error('Điểm số đánh giá phải là số nguyên từ 1 đến 5 sao');
    error.statusCode = 400;
    throw error;
  }

  // 1. Kiểm tra sản phẩm có tồn tại không
  const product = await Product.findById(productId);
  if (!product) {
    const error = new Error('Không tìm thấy sản phẩm cần đánh giá');
    error.statusCode = 404;
    throw error;
  }

  // 2. Kiểm tra điều kiện Verified Purchase: Khách hàng phải có đơn hàng đã mua sản phẩm này
  const orderFilter = {
    user: userId,
    'items.product': productId,
    status: { $in: ['delivered', 'processing', 'shipping'] },
  };

  if (orderId) {
    orderFilter._id = orderId;
  }

  const eligibleOrder = await Order.findOne(orderFilter);

  if (!eligibleOrder) {
    const error = new Error('Chỉ khách hàng đã từng mua sản phẩm này và đơn hàng được xác nhận mới có thể gửi đánh giá');
    error.statusCode = 403;
    throw error;
  }

  // 3. Kiểm tra xem người dùng đã đánh giá cho đơn hàng/sản phẩm này chưa
  const existingReview = await Review.findOne({
    product: productId,
    user: userId,
    ...(eligibleOrder && { order: eligibleOrder._id }),
  });

  if (existingReview) {
    const error = new Error('Bạn đã gửi đánh giá cho sản phẩm này trong đơn hàng trước đó rồi');
    error.statusCode = 409;
    throw error;
  }

  // 4. Khởi tạo đánh giá
  const newReview = await Review.create({
    product: productId,
    user: userId,
    order: eligibleOrder._id,
    rating: numericRating,
    comment: comment.trim(),
    isVerifiedPurchase: true,
    status: 'approved',
  });

  const populatedReview = await Review.findById(newReview._id)
    .populate('user', 'email')
    .lean();

  if (typeof Review.calculateAverageRatings === 'function') {
    await Review.calculateAverageRatings(productId);
  }

  return ApiResponse.success(res, 201, 'Gửi đánh giá sản phẩm thành công', populatedReview);
});

/**
 * XEM TẤT CẢ ĐÁNH GIÁ ĐÃ DUYỆT CỦA MỘT SẢN PHẨM (PUBLIC)
 * GET /api/v1/reviews/product/:productId
 */
const getProductReviews = catchAsync(async (req, res) => {
  const { productId } = req.params;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const filter = {
    product: productId,
    status: 'approved',
  };

  const [reviews, total, stats] = await Promise.all([
    Review.find(filter)
      .populate('user', 'email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Review.countDocuments(filter),
    Review.aggregate([
      { $match: { product: new (require('mongoose').Types.ObjectId)(productId), status: 'approved' } },
      {
        $group: {
          _id: null,
          avgRating: { $avg: '$rating' },
          total: { $sum: 1 },
          star5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
          star4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
          star3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
          star2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
          star1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const summary = stats[0]
    ? {
        averageRating: Number(stats[0].avgRating.toFixed(1)),
        totalReviews: stats[0].total,
        starsBreakdown: {
          5: stats[0].star5,
          4: stats[0].star4,
          3: stats[0].star3,
          2: stats[0].star2,
          1: stats[0].star1,
        },
      }
    : {
        averageRating: 0,
        totalReviews: 0,
        starsBreakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
      };

  return ApiResponse.success(res, 200, 'Lấy danh sách đánh giá thành công', {
    reviews,
    summary,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

/**
 * QUẢN TRỊ VIÊN KIỂM DUYỆT TẤT CẢ ĐÁNH GIÁ (ADMIN / VENDOR)
 * GET /api/v1/reviews
 */
const getAllReviews = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.status) {
    filter.status = req.query.status;
  }
  if (req.query.rating) {
    filter.rating = Number(req.query.rating);
  }

  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .populate('user', 'email')
      .populate('product', 'name images')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Review.countDocuments(filter),
  ]);

  return ApiResponse.success(res, 200, 'Lấy danh sách đánh giá quản trị thành công', {
    reviews,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

/**
 * CẬP NHẬT TRẠNG THÁI DUYỆT / ẨN ĐÁNH GIÁ (ADMIN ONLY)
 * PATCH /api/v1/reviews/:id/status
 */
const moderateReviewStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { status, adminFeedback } = req.body;

  if (!['approved', 'rejected', 'pending'].includes(status)) {
    const error = new Error('Trạng thái không hợp lệ. Chỉ chấp nhận: approved, rejected, pending');
    error.statusCode = 400;
    throw error;
  }

  const review = await Review.findById(id);
  if (!review) {
    const error = new Error('Không tìm thấy đánh giá');
    error.statusCode = 404;
    throw error;
  }

  review.status = status;
  if (adminFeedback !== undefined) {
    review.adminFeedback = adminFeedback;
  }

  await review.save();

  if (typeof Review.calculateAverageRatings === 'function') {
    await Review.calculateAverageRatings(review.product);
  }

  return ApiResponse.success(res, 200, `Đã cập nhật trạng thái đánh giá thành [${status}]`, review);
});

module.exports = {
  createReview,
  getProductReviews,
  getAllReviews,
  moderateReviewStatus,
};
