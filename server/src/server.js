/**
 * server.js
 * ------------------------------------------------------------
 * Điểm khởi động (Entry point) thật sự của ứng dụng.
 * Trách nhiệm:
 *   1. Kết nối Database (MongoDB qua Mongoose)
 *   2. Tạo HTTP server bọc quanh Express app
 *   3. Tích hợp Socket.io vào cùng HTTP server (dùng chung 1 cổng)
 *   4. Lắng nghe cổng (listen)
 *   5. Xử lý các sự kiện thoát tiến trình an toàn (graceful shutdown)
 * ------------------------------------------------------------
 */

const http = require('http');
const { Server } = require('socket.io');

const app = require('./app');
const env = require('./config/env');
const connectDB = require('./config/db');

// Tạo HTTP server từ Express app (bắt buộc để gắn Socket.io vào chung cổng)
const httpServer = http.createServer(app);

// Khởi tạo Socket.io, gắn CORS tương tự Express để 2 client có thể kết nối realtime
const io = new Server(httpServer, {
  cors: {
    origin: [env.CLIENT_URL, env.ADMIN_URL],
    credentials: true,
  },
});

// Lắng nghe sự kiện kết nối Socket.io (VD: thông báo đơn hàng mới cho Admin,
// cập nhật trạng thái đơn hàng realtime cho khách hàng...)
io.on('connection', (socket) => {
  console.log(`🔌 Client mới kết nối Socket.io: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`🔌 Client đã ngắt kết nối: ${socket.id}`);
  });
});

// Cho các Controller/Service khác truy cập io qua app (VD: req.app.get('io').emit(...))
app.set('io', io);

const startServer = async () => {
  // 1. Kết nối Database trước khi mở cổng lắng nghe
  await connectDB();

  // 2. Lắng nghe cổng
  httpServer.listen(env.PORT, () => {
    console.log(`🚀 Server đang chạy ở môi trường [${env.NODE_ENV}] - cổng ${env.PORT}`);
    console.log(`   API base URL: http://localhost:${env.PORT}/api/v1`);
  });
};

startServer();

// ----- Xử lý lỗi không mong muốn (an toàn cho production) -----
process.on('unhandledRejection', (err) => {
  console.error('❌ UNHANDLED REJECTION! Đang tắt server...', err);
  httpServer.close(() => process.exit(1));
});

process.on('uncaughtException', (err) => {
  console.error('❌ UNCAUGHT EXCEPTION! Đang tắt server...', err);
  process.exit(1);
});

module.exports = { httpServer, io };
