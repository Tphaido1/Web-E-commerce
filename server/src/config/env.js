/**
 * env.js
 * ------------------------------------------------------------
 * Tập trung đọc & export toàn bộ biến môi trường tại một nơi duy nhất.
 * Lợi ích: Nếu thiếu biến quan trọng, app sẽ báo lỗi ngay khi khởi động
 * thay vì lỗi rải rác ở nhiều file khác nhau (fail-fast).
 * ------------------------------------------------------------
 */

const dotenv = require('dotenv');
dotenv.config();

const env = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGO_URI: process.env.MONGO_URI,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
  ADMIN_URL: process.env.ADMIN_URL || 'http://localhost:5174',
};

// Danh sách các biến bắt buộc phải có, nếu thiếu sẽ dừng server ngay lập tức
const REQUIRED_KEYS = ['MONGO_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];

REQUIRED_KEYS.forEach((key) => {
  if (!env[key]) {
    // eslint-disable-next-line no-console
    console.error(`❌ Thiếu biến môi trường bắt buộc: ${key}. Vui lòng kiểm tra file .env`);
    process.exit(1);
  }
});

module.exports = env;
