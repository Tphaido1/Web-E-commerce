const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Mã giảm giá là bắt buộc'],
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    discountType: {
      type: String,
      enum: ['percentage', 'fixed'],
      required: [true, 'Loại giảm giá là bắt buộc (percentage hoặc fixed)'],
    },
    discountValue: {
      type: Number,
      required: [true, 'Giá trị giảm giá là bắt buộc'],
      min: [0, 'Giá trị giảm giá không thể âm'],
    },
    maxDiscountAmount: {
      type: Number,
      min: [0, 'Số tiền giảm tối đa không thể âm'],
      default: null, // null nghĩa là không giới hạn trần
    },
    minOrderValue: {
      type: Number,
      min: [0, 'Giá trị đơn hàng tối thiểu không thể âm'],
      default: 0,
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    endDate: {
      type: Date,
      required: [true, 'Ngày hết hạn coupon là bắt buộc'],
    },
    usageLimit: {
      type: Number,
      default: null, // null nghĩa là không giới hạn số lượt dùng toàn hệ thống
      min: 1,
    },
    usageCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    userLimit: {
      type: Number,
      default: 1, // Mỗi user được dùng bao nhiêu lần
      min: 1,
    },
    usedBy: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        usedAt: {
          type: Date,
          default: Date.now,
        },
        orderId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Order',
          default: null,
        },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Kiểm tra tính hợp lệ của coupon cho một người dùng và giá trị đơn hàng cụ thể
 * @param {string|mongoose.Types.ObjectId} userId
 * @param {number} subtotal
 * @returns {{ isValid: boolean, message?: string }}
 */
couponSchema.methods.validateForOrder = function (userId, subtotal) {
  const now = new Date();

  if (!this.isActive) {
    return { isValid: false, message: 'Mã giảm giá hiện đang bị vô hiệu hóa' };
  }

  if (now < this.startDate) {
    return { isValid: false, message: 'Mã giảm giá chưa đến ngày áp dụng' };
  }

  if (now > this.endDate) {
    return { isValid: false, message: 'Mã giảm giá đã hết hạn sử dụng' };
  }

  if (this.usageLimit !== null && this.usageCount >= this.usageLimit) {
    return { isValid: false, message: 'Mã giảm giá đã hết lượt sử dụng' };
  }

  if (subtotal < this.minOrderValue) {
    return {
      isValid: false,
      message: `Đơn hàng tối thiểu phải từ ${this.minOrderValue.toLocaleString('vi-VN')}đ để áp dụng mã này`,
    };
  }

  if (userId) {
    const userUsageCount = this.usedBy.filter(
      (entry) => entry.user && entry.user.toString() === userId.toString()
    ).length;

    if (userUsageCount >= this.userLimit) {
      return {
        isValid: false,
        message: 'Bạn đã sử dụng hết số lượt cho phép của mã giảm giá này',
      };
    }
  }

  return { isValid: true };
};

/**
 * Tính số tiền được giảm dựa trên subtotal
 * @param {number} subtotal
 * @returns {number} Số tiền giảm
 */
couponSchema.methods.calculateDiscount = function (subtotal) {
  let discount = 0;
  if (this.discountType === 'percentage') {
    discount = (subtotal * this.discountValue) / 100;
    if (this.maxDiscountAmount && discount > this.maxDiscountAmount) {
      discount = this.maxDiscountAmount;
    }
  } else if (this.discountType === 'fixed') {
    discount = Math.min(this.discountValue, subtotal);
  }
  return Math.round(discount);
};

module.exports = mongoose.model('Coupon', couponSchema);
