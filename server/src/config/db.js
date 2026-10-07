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
  // Tái sử dụng kết nối hiện có nếu đã kết nối (tối ưu cho Vercel Serverless & container)
  if (mongoose.connection.readyState >= 1) {
    return mongoose.connection;
  }

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

    return conn;
  } catch (error) {
    console.error(`❌ Không thể kết nối MongoDB: ${error.message}`);
    // Trên Vercel Serverless không dùng process.exit để tránh sập worker lambda
    if (!process.env.VERCEL) {
      process.exit(1);
    }
    throw error;
  }
};

module.exports = connectDB;
