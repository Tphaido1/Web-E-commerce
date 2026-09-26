const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Sản phẩm là bắt buộc'],
      index: true,
    },
    sku: {
      type: String,
      required: [true, 'SKU là bắt buộc'],
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    variantId: {
      type: String,
      trim: true,
      default: null,
    },
    stock: {
      type: Number,
      required: [true, 'Số lượng tồn kho là bắt buộc'],
      min: [0, 'Số lượng tồn kho không thể âm'],
      default: 0,
    },
    reservedStock: {
      type: Number,
      min: [0, 'Số lượng tạm giữ không thể âm'],
      default: 0,
    },
    lowStockThreshold: {
      type: Number,
      default: 5,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Trừ tồn kho nguyên tử (Atomic decrement with $gte)
 * Đảm bảo không bao giờ bị âm tồn kho dưới điều kiện tương tranh cao (High Concurrency)
 * @param {string} sku - Mã SKU của sản phẩm hoặc biến thể
 * @param {number} quantity - Số lượng cần trừ
 * @param {import('mongoose').ClientSession} [session] - MongoDB Session nếu dùng transaction
 * @returns {Promise<import('mongoose').Document|null>} Document đã update hoặc null nếu không đủ hàng
 */
inventorySchema.statics.deductStock = async function (sku, quantity, session = null) {
  const query = {
    sku: sku.toUpperCase().trim(),
    stock: { $gte: quantity },
  };
  const update = {
    $inc: { stock: -quantity },
  };
  const options = {
    new: true,
    runValidators: true,
    ...(session && { session }),
  };

  return this.findOneAndUpdate(query, update, options);
};

/**
 * Bồi hoàn tồn kho (Compensation / Rollback) khi transaction hoặc chuỗi trừ kho gặp sự cố
 * @param {string} sku - Mã SKU cần hoàn trả
 * @param {number} quantity - Số lượng cần bù lại
 * @param {import('mongoose').ClientSession} [session]
 */
inventorySchema.statics.compensateStock = async function (sku, quantity, session = null) {
  const query = {
    sku: sku.toUpperCase().trim(),
  };
  const update = {
    $inc: { stock: quantity },
  };
  const options = {
    new: true,
    ...(session && { session }),
  };

  return this.findOneAndUpdate(query, update, options);
};

module.exports = mongoose.model('Inventory', inventorySchema);
