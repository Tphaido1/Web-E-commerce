/**
 * db.js
 * ------------------------------------------------------------
 * Chịu trách nhiệm kết nối tới MongoDB thông qua Mongoose.
 * Có try-catch + logging rõ ràng, và thoát process nếu kết nối thất bại
 * để tránh server chạy "ngầm" trong trạng thái không có DB.
 * ------------------------------------------------------------
 */

const dns = require('dns');
const mongoose = require('mongoose');
const env = require('./env');

// Hỗ trợ phân giải DNS SRV (mongodb+srv://) trên mạng nội địa / Windows khi DNS mặc định từ chối querySrv
if (env.MONGO_URI && env.MONGO_URI.startsWith('mongodb+srv://')) {
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  } catch {
    // Bỏ qua nếu môi trường không cho phép cấu hình DNS
  }
}

let connectionPromise;
let listenersAttached = false;

const connectDB = async () => {
  // Tái sử dụng kết nối hiện có nếu đã kết nối (tối ưu cho Vercel Serverless & container)
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  // Concurrent cold-start requests must all await the same connection attempt.
  // readyState=2 means connecting and readyState=3 means disconnecting.
  if (connectionPromise) return connectionPromise;

  try {
    connectionPromise = mongoose.connect(env.MONGO_URI);
    const conn = await connectionPromise;

    console.log(`✅ MongoDB đã kết nối thành công: ${conn.connection.host}`);

    // Lắng nghe các sự kiện quan trọng của kết nối để debug dễ dàng hơn
    if (!listenersAttached) {
      mongoose.connection.on('disconnected', () => {
        console.warn('⚠️  MongoDB đã ngắt kết nối.');
      });

      mongoose.connection.on('error', (err) => {
        console.error(`❌ Lỗi kết nối MongoDB: ${err.message}`);
      });
      listenersAttached = true;
    }

    return conn;
  } catch (error) {
    console.error(`❌ Không thể kết nối MongoDB: ${error.message}`);
    // Trên Vercel Serverless không dùng process.exit để tránh sập worker lambda
    if (!process.env.VERCEL) {
      process.exit(1);
    }
    throw error;
  } finally {
    connectionPromise = undefined;
  }
};

module.exports = connectDB;
