const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'productId là bắt buộc'],
    },
    variantId: {
      type: String,
      default: null,
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'Số lượng phải lớn hơn 0'],
    },
    price: {
      type: Number,
      required: true,
      min: [0, 'Giá sản phẩm không được âm'],
    },
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: undefined,
    },
    guestId: {
      type: String,
      default: undefined,
      trim: true,
    },
    items: {
      type: [cartItemSchema],
      default: [],
    },
  },
  { timestamps: true }
);

cartSchema.pre('validate', function validateOwner(next) {
  const hasUser = Boolean(this.userId);
  const hasGuest = Boolean(this.guestId);

  if (hasUser === hasGuest) {
    return next(new Error('Cart phải thuộc về user hoặc guest, không phải cả hai'));
  }

  return next();
});

// Mỗi user/guest chỉ có một cart; partial index tránh xung đột giữa hai loại owner.
cartSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { userId: { $exists: true } } });
cartSchema.index({ guestId: 1 }, { unique: true, partialFilterExpression: { guestId: { $exists: true } } });

module.exports = mongoose.model('Cart', cartSchema);