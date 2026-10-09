const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const env = require('./env');
const mongoose = require('mongoose');
const Order = require('../models/Order.model');
const User = require('../models/User.model');
const { canManageWholeOrder } = require('../utils/vendorScope.util');

let ioInstance = null;

/**
 * Middleware xác thực JWT khi bắt tay kết nối (Handshake Auth)
 */
const authenticateSocket = async (socket, next) => {
  const token =
    socket.handshake.auth?.token ||
    socket.handshake.headers?.authorization?.replace('Bearer ', '') ||
    socket.handshake.query?.token;

  if (token) {
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET);
      socket.user = null;
      if (decoded.type === 'access' && mongoose.isValidObjectId(decoded.sub)) {
        const user = await User.findById(decoded.sub).select('_id role isActive');
        if (user && user.isActive !== false) socket.user = { ...decoded, sub: String(user._id), role: user.role };
      }
    } catch {
      // Cho phép kết nối vãng lai (guest) nhưng không gán thông tin user
      socket.user = null;
    }
  } else {
    socket.user = null;
  }
  next();
};

/**
 * Khởi tạo và cấu hình Socket.io Server
 * Hỗ trợ xác thực token handshake và phân vùng Room theo:
 *  - 'role_admin': Nhận thông báo đơn hàng mới, biến động doanh thu
 *  - 'vendor_{id}': Nhận thông báo các đơn hàng chứa sản phẩm của vendor
 *  - 'user_{id}': Nhận thông báo trạng thái đơn hàng và thanh toán cá nhân
 *  - 'order_{id}': Kênh riêng để theo dõi tiến độ một đơn hàng cụ thể
 *
 * @param {import('http').Server} httpServer
 * @returns {import('socket.io').Server}
 */
const initializeSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: [env.CLIENT_URL, env.ADMIN_URL],
      credentials: true,
      methods: ['GET', 'POST'],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Gắn middleware xác thực
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    const userId = socket.user?.sub || socket.user?._id;
    const role = socket.user?.role;
    const expiresAt = socket.user?.exp && socket.user.exp * 1000;
    const expiryTimer = expiresAt ? setTimeout(() => socket.disconnect?.(true), Math.max(0, expiresAt - Date.now())) : null;
    if (expiryTimer) expiryTimer.unref();

    // Tự động phân vùng Room dựa trên thông tin định danh
    if (userId) {
      socket.join(`user_${userId}`);
      console.log(`🔌 [Socket.io] User ${userId} (${role}) đã gia nhập phòng: user_${userId}`);

      if (role === 'admin') {
        socket.join('role_admin');
        console.log(`👑 [Socket.io] Admin ${userId} đã gia nhập phòng: role_admin`);
      } else if (role === 'vendor') {
        socket.join(`vendor_${userId}`);
        socket.join('role_vendor');
        console.log(`🏪 [Socket.io] Vendor ${userId} đã gia nhập phòng: vendor_${userId}`);
      }
    } else {
      console.log(`🔌 [Socket.io] Khách vãng lai kết nối: ${socket.id}`);
    }

    // Cho phép client chủ động đăng ký theo dõi một đơn hàng cụ thể (VD: trang Live Tracking)
    socket.on('join_order_room', async (orderId, acknowledge) => {
      const respond = (allowed) => {
        if (typeof acknowledge === 'function') acknowledge({ success: allowed });
      };
      if (!userId || !mongoose.isValidObjectId(orderId) ||
          (socket.user.exp && socket.user.exp * 1000 <= Date.now())) return respond(false);
      try {
        const filter = { _id: orderId };
        if (role === 'vendor') filter['items.vendor'] = userId;
        else if (role !== 'admin') filter.user = userId;
        const order = await Order.findOne(filter).select('_id items.vendor');
        // Mixed orders use the Vendor room; the full-order room is shared with
        // customer/Admin and must not expose another Vendor's payment details.
        if (!order || !socket.connected || !canManageWholeOrder(order, { role, _id: userId })) return respond(false);
        await socket.join('order_' + orderId);
        return respond(true);
      } catch {
        return respond(false);
      }
    });

    socket.on('leave_order_room', (orderId) => {
      if (orderId) {
        socket.leave(`order_${orderId}`);
      }
    });

    socket.on('disconnect', (reason) => {
      if (expiryTimer) clearTimeout(expiryTimer);
      console.log(`🔌 [Socket.io] Socket ${socket.id} ngắt kết nối (${reason})`);
    });
  });

  ioInstance = io;
  return io;
};

/**
 * Lấy thể hiện (instance) hiện tại của Socket.io
 * @returns {import('socket.io').Server|null}
 */
const getIo = () => ioInstance;

/**
 * Gửi thông báo đến toàn bộ Admin
 * @param {string} event
 * @param {*} data
 */
const notifyAdmin = (event, data) => {
  if (ioInstance) {
    ioInstance.to('role_admin').emit(event, data);
  }
};

/**
 * Gửi thông báo đến một người dùng cụ thể
 * @param {string} userId
 * @param {string} event
 * @param {*} data
 */
const notifyUser = (userId, event, data) => {
  if (ioInstance && userId) {
    ioInstance.to(`user_${userId}`).emit(event, data);
  }
};

/**
 * Gửi thông báo cập nhật tiến độ đơn hàng
 * @param {string} orderId
 * @param {string} event
 * @param {*} data
 */
const notifyOrderUpdate = (orderId, event, data) => {
  if (ioInstance && orderId) {
    ioInstance.to(`order_${orderId}`).emit(event, data);
  }
};

module.exports = {
  initializeSocket,
  authenticateSocket,
  getIo,
  notifyAdmin,
  notifyUser,
  notifyOrderUpdate,
};
