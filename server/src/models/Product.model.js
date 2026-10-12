const mongoose = require('mongoose');

const variantSchema = new mongoose.Schema(
  {
    sku: {
      type: String,
      required: [true, 'SKU biến thể là bắt buộc'],
      uppercase: true,
      trim: true,
    },
    color: { type: String, trim: true },
    size: { type: String, trim: true },
    price: {
      type: Number,
      required: [true, 'Giá biến thể là bắt buộc'],
      min: [0, 'Giá không thể âm'],
    },
    stock: {
      type: Number,
      required: [true, 'Số lượng tồn kho biến thể là bắt buộc'],
      min: [0, 'Số lượng tồn kho không thể âm'],
      default: 0,
    },
  },
  { _id: true }
);

const productSchema = new mongoose.Schema(
  {
    // Mô hình Single Shop: Admin là chủ shop trực tiếp quản lý toàn bộ sản phẩm (vendor = null).
    // Trường 'vendor' được bảo lưu (tạm ẩn trên UI) để sẵn sàng mở rộng đa người bán trong tương lai mà không sửa DB.
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    name: {
      type: String,
      required: [true, 'Tên sản phẩm là bắt buộc'],
      trim: true,
      index: true,
    },
    slug: {
      type: String,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      trim: true,
      default: 'Chung',
    },
    price: {
      type: Number,
      required: [true, 'Giá sản phẩm là bắt buộc'],
      min: [0, 'Giá không thể âm'],
    },
    salePrice: {
      type: Number,
      min: [0, 'Giá khuyến mãi không thể âm'],
      default: null,
    },
    images: {
      type: [String],
      default: [],
    },
    variants: [variantSchema],
    stock: {
      type: Number,
      min: [0, 'Tồn kho không thể âm'],
      default: 0,
    },
    ratingAverage: {
      type: Number,
      default: 5.0,
      min: [1, 'Điểm đánh giá tối thiểu là 1'],
      max: [5, 'Điểm đánh giá tối đa là 5'],
      set: (val) => Math.round(val * 10) / 10,
    },
    reviewCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

productSchema.index({ name: 'text', description: 'text' });
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ isActive: 1, price: 1 });
productSchema.index({ isActive: 1, createdAt: -1 });

module.exports = mongoose.model('Product', productSchema);
