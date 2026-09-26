const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Sản phẩm là bắt buộc'],
    },
    sku: {
      type: String,
      required: [true, 'SKU là bắt buộc'],
      uppercase: true,
      trim: true,
    },
    variantId: {
      type: String,
      trim: true,
      default: null,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'Số lượng tối thiểu là 1'],
      default: 1,
    },
    image: {
      type: String,
      default: null,
    },
  },
  { _id: true }
);

const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    sessionId: {
      type: String,
      default: null,
      index: true,
    },
    items: [cartItemSchema],
    totalAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

cartSchema.methods.recalculateTotal = function () {
  this.totalAmount = this.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return this.totalAmount;
};

cartSchema.pre('save', function (next) {
  this.recalculateTotal();
  next();
});

module.exports = mongoose.model('Cart', cartSchema);
