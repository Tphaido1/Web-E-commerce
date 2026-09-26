const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Sản phẩm được đánh giá là bắt buộc'],
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Người đánh giá là bắt buộc'],
      index: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
      index: true,
    },
    rating: {
      type: Number,
      required: [true, 'Điểm số đánh giá từ 1 đến 5 sao là bắt buộc'],
      min: [1, 'Điểm tối thiểu là 1 sao'],
      max: [5, 'Điểm tối đa là 5 sao'],
    },
    comment: {
      type: String,
      required: [true, 'Nội dung nhận xét là bắt buộc'],
      trim: true,
      minlength: [2, 'Nội dung nhận xét quá ngắn'],
      maxlength: [1000, 'Nội dung nhận xét tối đa 1000 ký tự'],
    },
    isVerifiedPurchase: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'approved',
      index: true,
    },
    adminFeedback: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

reviewSchema.index({ product: 1, status: 1, createdAt: -1 });

// Tự động tính toán điểm đánh giá trung bình và số lượng đánh giá cho Product
reviewSchema.statics.calculateAverageRatings = async function (productId) {
  const stats = await this.aggregate([
    {
      $match: {
        product: new mongoose.Types.ObjectId(productId),
        status: 'approved',
      },
    },
    {
      $group: {
        _id: '$product',
        avgRating: { $avg: '$rating' },
        nRating: { $sum: 1 },
      },
    },
  ]);

  const ProductModel = mongoose.model('Product');
  if (stats.length > 0) {
    await ProductModel.findByIdAndUpdate(productId, {
      ratingAverage: Math.round(stats[0].avgRating * 10) / 10,
      reviewCount: stats[0].nRating,
    });
  } else {
    await ProductModel.findByIdAndUpdate(productId, {
      ratingAverage: 5.0,
      reviewCount: 0,
    });
  }
};

module.exports = mongoose.model('Review', reviewSchema);
