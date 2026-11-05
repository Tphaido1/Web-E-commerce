const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { createHash, randomUUID } = require('crypto');

const env = require('../config/env');
const User = require('../models/User.model');
const ApiResponse = require('../utils/apiResponse');
const { verifyGoogleIdToken } = require('../services/googleAuth.service');

const createAccessToken = (user) => {
  // Access token có thời hạn ngắn và secret riêng cho request API.
  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
      type: 'access',
      tokenVersion: user.tokenVersion || 0,
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN, jwtid: randomUUID() }
  );
};

const createRefreshToken = (user) => {
  // Refresh token dùng secret riêng để tách biệt với access token.
  return jwt.sign(
    { sub: user._id.toString(), type: 'refresh' },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN, jwtid: randomUUID() }
  );
};

const sanitizeUser = (user) => ({
  id: user._id,
  email: user.email,
  role: user.role,
  name: user.name || '',
  phone: user.phone || '',
  address: user.address || '',
  wishlist: user.wishlist || [],
});

// bcrypt only considers 72 bytes: digest the entire JWT before hashing/comparing.
const refreshDigest = (token) => createHash('sha256').update(token).digest('hex');

const issueTokens = async (user, expectedRefreshHash, { keepExisting = false } = {}) => {
  const accessToken = createAccessToken(user);
  const refreshToken = createRefreshToken(user);

  // Chỉ lưu hash refresh token, không lưu token plain trong database.
  const refreshHash = await bcrypt.hash(refreshDigest(refreshToken), 12);
  const filter = { _id: user._id, isActive: { $ne: false } };
  if (expectedRefreshHash !== undefined) {
    filter.$or = [
      { refreshToken: expectedRefreshHash },
      { refreshTokens: expectedRefreshHash },
    ];
  }

  let update;
  if (keepExisting) {
    update = {
      $set: { refreshToken: refreshHash },
      $push: { refreshTokens: { $each: [refreshHash], $slice: -5 } },
    };
  } else {
    update = {
      $set: { refreshToken: refreshHash, refreshTokens: [refreshHash] },
    };
  }

  const updated = await User.findOneAndUpdate(filter, update, { new: true });
  if (!updated) {
    const error = new Error('Refresh token không hợp lệ hoặc đã bị thu hồi');
    error.statusCode = 401;
    throw error;
  }

  return {
    token: accessToken,
    accessToken,
    refreshToken,
  };
};

const invalidCredentialsError = () => {
  const error = new Error('Email hoặc mật khẩu không chính xác');
  error.statusCode = 401;
  return error;
};

exports.register = async (req, res) => {
  const { email, password, name, phone, address } = req.body || {};

  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    return ApiResponse.error(res, 400, 'Vui lòng nhập email và mật khẩu');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    return ApiResponse.error(res, 409, 'Email đã được sử dụng');
  }

  const user = await User.create({
    email: normalizedEmail,
    password,
    ...(typeof name === 'string' && name.trim() && { name: name.trim() }),
    ...(typeof phone === 'string' && phone.trim() && { phone: phone.trim() }),
    ...(typeof address === 'string' && address.trim() && { address: address.trim() }),
  });
  const tokens = await issueTokens(user);

  return ApiResponse.success(res, 201, 'Đăng ký thành công', {
    user: sanitizeUser(user),
    ...tokens,
  });
};

exports.login = async (req, res) => {
  const { email, password } = req.body || {};

  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    return ApiResponse.error(res, 400, 'Vui lòng nhập email và mật khẩu');
  }

  const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password +refreshToken');
  // bcrypt.compare giúp không bao giờ so sánh mật khẩu plain với hash bằng phép so sánh chuỗi.
  if (!user || user.isActive === false || !(await user.comparePassword(password))) {
    throw invalidCredentialsError();
  }

  const tokens = await issueTokens(user);
  return ApiResponse.success(res, 200, 'Đăng nhập thành công', {
    user: sanitizeUser(user),
    ...tokens,
  });
};

exports.refreshToken = async (req, res) => {
  const { refreshToken } = req.body || {};

  if (typeof refreshToken !== 'string' || !refreshToken) {
    return ApiResponse.error(res, 400, 'Refresh token là bắt buộc');
  }

  const payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET);
  if (payload.type !== 'refresh') {
    const error = new Error('Refresh token không hợp lệ');
    error.statusCode = 401;
    throw error;
  }

  const user = await User.findById(payload.sub).select('+refreshToken +refreshTokens');
  if (!user || user.isActive === false) {
    const error = new Error('Refresh token không hợp lệ hoặc đã bị thu hồi');
    error.statusCode = 401;
    throw error;
  }

  const tokenDigest = refreshDigest(refreshToken);
  const candidateHashes = [user.refreshToken, ...(user.refreshTokens || [])].filter(Boolean);

  let matchedHash = null;
  for (const h of candidateHashes) {
    if (await bcrypt.compare(tokenDigest, h)) {
      matchedHash = h;
      break;
    }
  }

  if (!matchedHash) {
    const error = new Error('Refresh token không hợp lệ hoặc đã bị thu hồi');
    error.statusCode = 401;
    throw error;
  }

  const newAccessToken = createAccessToken(user);
  const newRefreshToken = createRefreshToken(user);
  const newRefreshHash = await bcrypt.hash(refreshDigest(newRefreshToken), 12);

  // Xoay vòng nguyên tử: thu hồi matchedHash và cập nhật hash mới
  const updated = await User.findOneAndUpdate(
    {
      _id: user._id,
      isActive: { $ne: false },
      $or: [{ refreshToken: matchedHash }, { refreshTokens: matchedHash }],
    },
    {
      $set: { refreshToken: newRefreshHash },
      $pull: { refreshTokens: matchedHash },
    }
  );

  if (!updated) {
    const error = new Error('Refresh token không hợp lệ hoặc đã bị thu hồi');
    error.statusCode = 401;
    throw error;
  }

  await User.findByIdAndUpdate(user._id, {
    $push: { refreshTokens: { $each: [newRefreshHash], $slice: -5 } },
  });

  return ApiResponse.success(res, 200, 'Làm mới token thành công', {
    token: newAccessToken,
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  });
};

exports.logout = async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, {
    $unset: { refreshToken: 1, refreshTokens: 1 },
  });
  return ApiResponse.success(res, 200, 'Đăng xuất thành công');
};

exports.googleLogin = async (req, res) => {
  const { idToken, requiredRole } = req.body || {};

  if (!idToken || typeof idToken !== 'string' || !idToken.trim()) {
    return ApiResponse.error(res, 400, 'Google ID token là bắt buộc');
  }

  const googleProfile = await verifyGoogleIdToken(idToken.trim());
  const { googleId, email, name, avatar } = googleProfile;

  let user = await User.findOne({
    $or: [{ googleId }, { email }],
  });
  let isNewlyLinked = false;

  if (user) {
    if (user.isActive === false) {
      const error = new Error('Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.');
      error.statusCode = 403;
      throw error;
    }

    // GA-06: Nếu tài khoản đã liên kết googleId nhưng googleId của token khác -> từ chối
    if (user.googleId && user.googleId !== googleId) {
      const error = new Error('Tài khoản Google này không khớp với tài khoản đã liên kết.');
      error.statusCode = 409;
      throw error;
    }

    // GA-07: Cho phép cả admin và vendor nếu đăng nhập khu vực quản trị
    if (requiredRole === 'admin' && !['admin', 'vendor'].includes(user.role)) {
      const error = new Error('Tài khoản này không có quyền truy cập trang quản trị');
      error.statusCode = 403;
      throw error;
    }

    let needsSave = false;
    // GA-05 & FR-01: Liên kết Google vào tài khoản đã có -> vô hiệu hóa mật khẩu cũ và thu hồi Access Token (FR-01)
    if (!user.googleId) {
      user.googleId = googleId;
      isNewlyLinked = true;
      // Tăng tokenVersion để vô hiệu hóa ngay lập tức mọi Access Token cũ của kẻ xấu (FR-01)
      user.tokenVersion = (user.tokenVersion || 0) + 1;
      // Thu hồi toàn bộ refresh token cũ trước đó của kẻ xấu
      user.refreshToken = null;
      user.refreshTokens = [];
      // Chỉ xóa mật khẩu của khách hàng (customer). Giữ nguyên mật khẩu cho admin/vendor để có lối vào dự phòng
      if (user.role === 'customer') {
        user.authProvider = 'google';
        user.set('password', undefined);
      }
      needsSave = true;
    }
    if (!user.avatar && avatar) {
      user.avatar = avatar;
      needsSave = true;
    }
    if (!user.name && name) {
      user.name = name;
      needsSave = true;
    }
    if (needsSave) {
      await user.save();
    }
  } else {
    // Nếu chưa có tài khoản mà yêu cầu quyền quản trị
    if (requiredRole === 'admin') {
      const error = new Error('Tài khoản chưa được cấp quyền quản trị trong hệ thống');
      error.statusCode = 403;
      throw error;
    }

    // GA-04: Xử lý race condition khi 2 callback đến cùng lúc (E11000 duplicate key)
    try {
      user = await User.create({
        email,
        name,
        avatar,
        googleId,
        authProvider: 'google',
        role: 'customer',
      });
    } catch (createErr) {
      if (createErr.code === 11000) {
        user = await User.findOne({ email });
        if (!user) throw createErr;
      } else {
        throw createErr;
      }
    }
  }

  // FR-03: Với người dùng mới hoặc đăng nhập lại, keepExisting: true để các callback song song không ghi đè refresh token của nhau.
  // Khi tài khoản lần đầu liên kết (isNewlyLinked), keepExisting: false để xóa sổ mọi refresh token cũ của kẻ xấu (FR-01).
  const tokens = await issueTokens(user, undefined, { keepExisting: !isNewlyLinked });
  return ApiResponse.success(res, 200, 'Đăng nhập Google thành công', {
    user: sanitizeUser(user),
    ...tokens,
  });
};
