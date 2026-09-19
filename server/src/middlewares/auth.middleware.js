const jwt = require('jsonwebtoken');

const env = require('../config/env');
const User = require('../models/User.model');
const catchAsync = require('../utils/catchAsync');

const protect = catchAsync(async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization || !authorization.startsWith('Bearer ')) {
    const error = new Error('Vui lòng cung cấp Access Token');
    error.statusCode = 401;
    throw error;
  }

  const accessToken = authorization.slice(7);
  const payload = jwt.verify(accessToken, env.JWT_SECRET);
  if (payload.type !== 'access') {
    const error = new Error('Token không phải Access Token');
    error.statusCode = 401;
    throw error;
  }

  const user = await User.findById(payload.sub);
  if (!user) {
    const error = new Error('Tài khoản không còn tồn tại');
    error.statusCode = 401;
    throw error;
  }

  req.user = user;
  return next();
});

const checkRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    const error = new Error('Bạn không có quyền thực hiện thao tác này');
    error.statusCode = 403;
    return next(error);
  }

  return next();
};

module.exports = { protect, checkRole };