const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { createHash, randomUUID } = require('crypto');

const env = require('../config/env');
const User = require('../models/User.model');
const ApiResponse = require('../utils/apiResponse');

const createAccessToken = (user) => {
  // Access token có thời hạn ngắn và secret riêng cho request API.
  return jwt.sign(
    { sub: user._id.toString(), role: user.role, type: 'access' },
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
});

// bcrypt only considers 72 bytes: digest the entire JWT before hashing/comparing.
const refreshDigest = (token) => createHash('sha256').update(token).digest('hex');

const issueTokens = async (user, expectedRefreshHash) => {
  const accessToken = createAccessToken(user);
  const refreshToken = createRefreshToken(user);

  // Chỉ lưu hash refresh token, không lưu token plain trong database.
  const refreshHash = await bcrypt.hash(refreshDigest(refreshToken), 12);
  const filter = { _id: user._id, isActive: { $ne: false } };
  if (expectedRefreshHash !== undefined) filter.refreshToken = expectedRefreshHash;
  const updated = await User.findOneAndUpdate(filter, { $set: { refreshToken: refreshHash } });
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
  const { email, password } = req.body || {};

  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    return ApiResponse.error(res, 400, 'Vui lòng nhập email và mật khẩu');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    return ApiResponse.error(res, 409, 'Email đã được sử dụng');
  }

  const user = await User.create({ email: normalizedEmail, password });
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

  const user = await User.findById(payload.sub).select('+refreshToken');
  if (!user || user.isActive === false || !user.refreshToken || !(await bcrypt.compare(refreshDigest(refreshToken), user.refreshToken))) {
    const error = new Error('Refresh token không hợp lệ hoặc đã bị thu hồi');
    error.statusCode = 401;
    throw error;
  }

  const tokens = await issueTokens(user, user.refreshToken);
  return ApiResponse.success(res, 200, 'Làm mới token thành công', tokens);
};

exports.logout = async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { $unset: { refreshToken: 1 } });
  return ApiResponse.success(res, 200, 'Đăng xuất thành công');
};
