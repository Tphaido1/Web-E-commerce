/**
 * error.middleware.js
 * ------------------------------------------------------------
 * Middleware xử lý lỗi tập trung (Global Error Handler).
 * Được đặt cuối cùng trong app.js sau tất cả các Route.
 * Mọi lỗi (kể cả từ catchAsync) đều sẽ đi qua đây.
 * ------------------------------------------------------------
 */

const ApiResponse = require('../utils/apiResponse');
const env = require('../config/env');

// Middleware xử lý route không tồn tại (404)
const notFoundHandler = (req, res, next) => {
  const error = new Error(`Không tìm thấy đường dẫn: ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

// Middleware xử lý lỗi tổng quát
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Lỗi Server nội bộ';

  // Xử lý lỗi validate của Mongoose
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((val) => val.message)
      .join(', ');
  }

  // Xử lý lỗi trùng khóa unique của Mongoose (VD: email đã tồn tại)
  if (err.code === 11000) {
    statusCode = 400;
    const field = Object.keys(err.keyValue)[0];
    message = `Giá trị '${field}' đã tồn tại trong hệ thống`;
  }

  // Xử lý lỗi JWT không hợp lệ
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Token không hợp lệ, vui lòng đăng nhập lại';
  }

  // Log lỗi ra console (production nên tích hợp thêm Winston/Sentry)
  if (env.NODE_ENV === 'development') {
    console.error('🔥 ERROR:', err);
  }

  return ApiResponse.error(res, statusCode, message);
};

module.exports = { notFoundHandler, errorHandler };
