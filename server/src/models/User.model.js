const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    isActive: { type: Boolean, default: true, index: true },
    email: {
      type: String,
      required: [true, 'Email là bắt buộc'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Email không hợp lệ'],
    },
    password: {
      type: String,
      required: [
        function () {
          return !this.googleId && this.authProvider !== 'google';
        },
        'Mật khẩu là bắt buộc đối với tài khoản thông thường',
      ],
      minlength: [6, 'Mật khẩu phải có ít nhất 6 ký tự'],
      select: false,
    },
    googleId: {
      type: String,
      default: null,
      sparse: true,
      index: true,
    },
    authProvider: {
      type: String,
      enum: ['local', 'google'],
      default: 'local',
      index: true,
    },
    role: {
      type: String,
      // Mô hình Single Shop: 'admin' đóng vai trò là Chủ Shop (Shop Owner), 'customer' là Khách hàng.
      // Role 'vendor' được bảo lưu (tạm ẩn) phục vụ mở rộng sàn đa người bán trong tương lai mà không làm vỡ DB.
      enum: ['admin', 'vendor', 'customer'],
      default: 'customer',
    },
    name: {
      type: String,
      trim: true,
      default: '',
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    address: {
      type: String,
      trim: true,
      default: '',
    },
    avatar: {
      type: String,
      default: '',
    },
    wishlist: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
      },
    ],
    refreshToken: {
      type: String,
      select: false,
      default: null,
    },
  },
  { timestamps: true }
);

// Chỉ hash mật khẩu khi tạo mới hoặc khi mật khẩu bị thay đổi.
userSchema.pre('save', async function hashPassword(next) {
  if (!this.password || !this.isModified('password')) return next();

  this.password = await bcrypt.hash(this.password, 12);
  return next();
});

userSchema.methods.comparePassword = function comparePassword(candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
