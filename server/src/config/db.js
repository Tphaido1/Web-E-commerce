/**
 * db.js
 * ------------------------------------------------------------
 * Chịu trách nhiệm kết nối tới MongoDB thông qua Mongoose.
 * Có try-catch + logging rõ ràng, và thoát process nếu kết nối thất bại
 * để tránh server chạy "ngầm" trong trạng thái không có DB.
 * ------------------------------------------------------------
 */

const mongoose = require('mongoose');
const env = require('./env');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(env.MONGO_URI);

    console.log(`✅ MongoDB đã kết nối thành công: ${conn.connection.host}`);

    // Lắng nghe các sự kiện quan trọng của kết nối để debug dễ dàng hơn
    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB đã ngắt kết nối.');
    });

    mongoose.connection.on('error', (err) => {
      console.error(`❌ Lỗi kết nối MongoDB: ${err.message}`);
    });
  } catch (error) {
    console.error(`❌ Không thể kết nối MongoDB: ${error.message}`);
    // Thoát ứng dụng với mã lỗi 1 (thất bại) vì server không thể chạy thiếu DB
    process.exit(1);
  }
};

module.exports = connectDB;
