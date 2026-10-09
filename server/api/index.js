/**
 * api/index.js
 * ------------------------------------------------------------
 * Vercel Serverless Function Handler cho Express Backend Monorepo.
 * 
 * Vercel tự động biến file này thành Serverless Function.
 * Quản lý kết nối MongoDB dạng cached connection để tái sử dụng
 * qua các lượt gọi request (tránh tình trạng cạn kiệt connection pool).
 * ------------------------------------------------------------
 */

const app = require('../src/app');
const connectDB = require('../src/config/db');
const ApiResponse = require('../src/utils/apiResponse');

module.exports = async (req, res) => {
  // Đảm bảo kết nối MongoDB được khởi tạo trước khi xử lý request
  try {
    await connectDB();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('❌ Lỗi kết nối MongoDB trong Vercel Serverless Function:', err.message);
    return ApiResponse.error(res, 503, 'Cơ sở dữ liệu tạm thời không khả dụng. Vui lòng thử lại sau.');
  }

  // Chuyển quyền điều khiển cho Express App
  return app(req, res);
};
