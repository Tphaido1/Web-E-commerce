const crypto = require('crypto');
const querystring = require('querystring');
const Order = require('../models/Order.model');
const AuditLogService = require('../services/auditLog.service');
const { notifyAdmin, notifyUser, notifyOrderUpdate } = require('../config/socket');
const ApiResponse = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');
const env = require('../config/env');

/**
 * Format Date thành YYYYMMDDHHmmss theo chuẩn VNPay
 */
const formatVNPayDate = (date) => {
  const pad = (n) => (n < 10 ? '0' + n : n);
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
};

/**
 * Sắp xếp các tham số của object theo thứ tự bảng chữ cái (Alphabetical sort)
 */
const sortObject = (obj) => {
  const sorted = {};
  const str = [];
  let key;
  for (key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      str.push(encodeURIComponent(key));
    }
  }
  str.sort();
  for (key = 0; key < str.length; key++) {
    sorted[str[key]] = encodeURIComponent(obj[str[key]]).replace(/%20/g, '+');
  }
  return sorted;
};

/**
 * Tính toán chữ ký HMAC-SHA512 cho VNPay
 */
const calculateVNPaySecureHash = (params, secretKey) => {
  const sortedParams = sortObject(params);
  const signData = querystring.stringify(sortedParams, { encode: false });
  const hmac = crypto.createHmac('sha512', secretKey);
  return hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');
};

/**
 * Xác thực chữ ký số từ request của VNPay
 */
const verifyVNPaySecureHash = (query, secretKey) => {
  const vnpParams = { ...query };
  const secureHash = vnpParams['vnp_SecureHash'];

  delete vnpParams['vnp_SecureHash'];
  delete vnpParams['vnp_SecureHashType'];

  const calculatedHash = calculateVNPaySecureHash(vnpParams, secretKey);

  if (!secureHash) return false;
  return secureHash.toLowerCase() === calculatedHash.toLowerCase();
};

/**
 * TẠO URL DẪN SANG CỔNG THANH TOÁN VNPAY SANDBOX
 * POST /api/v1/payments/create-vnpay-url
 */
const createVNPayPaymentUrl = catchAsync(async (req, res) => {
  const { orderId, bankCode, locale = 'vn' } = req.body;
  const userId = req.user._id;

  if (!orderId) {
    const error = new Error('Vui lòng cung cấp mã đơn hàng (orderId)');
    error.statusCode = 400;
    throw error;
  }

  const order = await Order.findById(orderId);
  if (!order) {
    const error = new Error('Không tìm thấy đơn hàng cần thanh toán');
    error.statusCode = 404;
    throw error;
  }

  // Kiểm tra quyền sở hữu đơn hàng
  const isOwner = order.user.toString() === userId.toString();
  const isAdmin = ['admin', 'vendor'].includes(req.user.role);
  if (!isOwner && !isAdmin) {
    const error = new Error('Bạn không có quyền thanh toán cho đơn hàng này');
    error.statusCode = 403;
    throw error;
  }

  // Kiểm tra trạng thái đơn
  if (order.paymentStatus === 'paid') {
    const error = new Error('Đơn hàng này đã được thanh toán thành công trước đó');
    error.statusCode = 400;
    throw error;
  }

  if (order.status === 'cancelled') {
    const error = new Error('Đơn hàng đã bị hủy, không thể tiếp tục thanh toán');
    error.statusCode = 400;
    throw error;
  }

  const clientIp =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress?.replace('::ffff:', '') ||
    '127.0.0.1';

  const now = new Date();
  const createDate = formatVNPayDate(now);
  const expireDate = formatVNPayDate(new Date(now.getTime() + 15 * 60 * 1000)); // Hết hạn sau 15 phút

  // VNPay quy định số tiền thanh toán phải nhân với 100 (đơn vị xu/hào)
  const amountInVnpayFormat = Math.round(order.finalAmount * 100);

  const vnpParams = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: env.VNP_TMN_CODE,
    vnp_Locale: locale,
    vnp_CurrCode: 'VND',
    vnp_TxnRef: order.orderCode,
    vnp_OrderInfo: `Thanh toan don hang ${order.orderCode}`,
    vnp_OrderType: 'other',
    vnp_Amount: amountInVnpayFormat,
    vnp_ReturnUrl: env.VNP_RETURN_URL,
    vnp_IpAddr: clientIp,
    vnp_CreateDate: createDate,
    vnp_ExpireDate: expireDate,
  };

  if (bankCode && bankCode.trim()) {
    vnpParams['vnp_BankCode'] = bankCode.trim();
  }

  const sortedParams = sortObject(vnpParams);
  const secureHash = calculateVNPaySecureHash(vnpParams, env.VNP_HASH_SECRET);

  const redirectUrl = `${env.VNP_URL}?${querystring.stringify(sortedParams, { encode: false })}&vnp_SecureHash=${secureHash}`;

  // Ghi nhận Audit Log
  await AuditLogService.logOrderChange({
    orderId: order._id,
    action: 'PAYMENT_URL_GENERATED',
    performedBy: userId,
    actorRole: req.user.role,
    details: {
      orderCode: order.orderCode,
      amount: order.finalAmount,
      bankCode: bankCode || 'ALL',
      ipAddress: clientIp,
    },
    req,
  });

  return ApiResponse.success(res, 200, 'Tạo URL thanh toán VNPay thành công', {
    paymentUrl: redirectUrl,
    orderCode: order.orderCode,
    amount: order.finalAmount,
  });
});

/**
 * XỬ LÝ RETURN URL KHI KHÁCH HÀNG HOÀN TẤT THANH TOÁN TRÊN GIAO DIỆN VNPAY
 * GET /api/v1/payments/vnpay-return
 */
const vnpayReturn = catchAsync(async (req, res) => {
  const vnpParams = req.query;
  const isValidSignature = verifyVNPaySecureHash(vnpParams, env.VNP_HASH_SECRET);

  if (!isValidSignature) {
    const error = new Error('Chữ ký số không hợp lệ (Dữ liệu giao dịch có thể bị giả mạo)');
    error.statusCode = 400;
    throw error;
  }

  const orderCode = vnpParams['vnp_TxnRef'];
  const responseCode = vnpParams['vnp_ResponseCode'];
  const transactionNo = vnpParams['vnp_TransactionNo'];
  const bankCode = vnpParams['vnp_BankCode'];
  const payDate = vnpParams['vnp_PayDate'];
  const vnpAmount = Number(vnpParams['vnp_Amount']) / 100;

  const order = await Order.findOne({ orderCode });
  if (!order) {
    const error = new Error(`Không tìm thấy đơn hàng #${orderCode}`);
    error.statusCode = 404;
    throw error;
  }

  const isSuccess = responseCode === '00';

  if (isSuccess && order.paymentStatus !== 'paid') {
    const oldStatus = order.status;
    order.paymentStatus = 'paid';
    order.status = 'processing';
    order.paymentMethod = 'VNPAY';
    order.trackingHistory.push({
      status: 'processing',
      note: `Thanh toán trực tuyến VNPay thành công. Mã GD: ${transactionNo}, Ngân hàng: ${bankCode}`,
      updatedAt: new Date(),
    });

    await order.save();

    // Ghi nhận Audit Log
    await AuditLogService.logPaymentTransaction({
      orderId: order._id,
      transactionNo,
      amount: vnpAmount,
      bankCode,
      status: 'success',
      responseCode,
      details: { payDate, oldStatus, newStatus: 'processing' },
      req,
    });

    // Bắn sự kiện thời gian thực (Real-time Socket.io)
    notifyAdmin('new_order', {
      orderId: order._id,
      orderCode: order.orderCode,
      finalAmount: order.finalAmount,
      customerName: order.shippingAddress.fullName,
      paymentMethod: 'VNPAY',
      paymentStatus: 'paid',
      createdAt: order.createdAt,
    });

    notifyUser(order.user.toString(), 'payment_success', {
      orderId: order._id,
      orderCode: order.orderCode,
      message: 'Đơn hàng của bạn đã thanh toán thành công qua VNPay',
    });

    notifyOrderUpdate(order._id.toString(), 'order_status_updated', {
      orderId: order._id,
      status: 'processing',
      note: 'Đã thanh toán qua VNPay',
    });
  }

  return ApiResponse.success(res, 200, isSuccess ? 'Thanh toán thành công' : 'Thanh toán không thành công', {
    orderCode,
    isSuccess,
    responseCode,
    transactionNo,
    bankCode,
    amount: vnpAmount,
    orderId: order._id,
  });
});

/**
 * XỬ LÝ SERVER-TO-SERVER WEBHOOK IPN TỪ MÁY CHỦ VNPAY
 * GET /api/v1/payments/vnpay-ipn
 * Yêu cầu trả về đúng định dạng JSON: { RspCode: '00', Message: 'Confirm Success' }
 */
const vnpayIpn = async (req, res) => {
  try {
    const vnpParams = req.query;
    const isValidSignature = verifyVNPaySecureHash(vnpParams, env.VNP_HASH_SECRET);

    // 1. Kiểm tra chữ ký số (Checksum)
    if (!isValidSignature) {
      return res.status(200).json({ RspCode: '97', Message: 'Checksum failed' });
    }

    const orderCode = vnpParams['vnp_TxnRef'];
    const responseCode = vnpParams['vnp_ResponseCode'];
    const transactionNo = vnpParams['vnp_TransactionNo'];
    const bankCode = vnpParams['vnp_BankCode'];
    const vnpAmount = Number(vnpParams['vnp_Amount']);

    // 2. Kiểm tra sự tồn tại của đơn hàng
    const order = await Order.findOne({ orderCode });
    if (!order) {
      return res.status(200).json({ RspCode: '01', Message: 'Order not found' });
    }

    // 3. Kiểm tra số tiền giao dịch có khớp không
    const expectedAmount = Math.round(order.finalAmount * 100);
    if (expectedAmount !== vnpAmount) {
      return res.status(200).json({ RspCode: '04', Message: 'Invalid amount' });
    }

    // 4. Kiểm tra tính Idempotent: Đơn hàng đã được xác nhận thanh toán trước đó chưa
    if (order.paymentStatus === 'paid') {
      return res.status(200).json({ RspCode: '02', Message: 'Order already confirmed' });
    }

    // 5. Cập nhật trạng thái đơn hàng
    if (responseCode === '00') {
      order.paymentStatus = 'paid';
      order.status = 'processing';
      order.paymentMethod = 'VNPAY';
      order.trackingHistory.push({
        status: 'processing',
        note: `VNPay IPN xác nhận thanh toán thành công. Mã GD: ${transactionNo}`,
        updatedAt: new Date(),
      });
      await order.save();

      // Ghi Audit Log
      await AuditLogService.logPaymentTransaction({
        orderId: order._id,
        transactionNo,
        amount: vnpAmount / 100,
        bankCode,
        status: 'success',
        responseCode,
        details: { source: 'VNPay IPN' },
        req,
      });

      // Bắn sự kiện realtime
      notifyAdmin('new_order', {
        orderId: order._id,
        orderCode: order.orderCode,
        finalAmount: order.finalAmount,
        customerName: order.shippingAddress.fullName,
        paymentStatus: 'paid',
        paymentMethod: 'VNPAY',
      });
      notifyUser(order.user.toString(), 'payment_success', {
        orderId: order._id,
        orderCode: order.orderCode,
      });
      notifyOrderUpdate(order._id.toString(), 'order_status_updated', {
        orderId: order._id,
        status: 'processing',
      });
    } else {
      order.paymentStatus = 'failed';
      order.trackingHistory.push({
        status: order.status,
        note: `VNPay IPN thông báo giao dịch thất bại. Mã lỗi: ${responseCode}`,
        updatedAt: new Date(),
      });
      await order.save();

      await AuditLogService.logPaymentTransaction({
        orderId: order._id,
        transactionNo,
        amount: vnpAmount / 100,
        bankCode,
        status: 'failed',
        responseCode,
        details: { source: 'VNPay IPN' },
        req,
      });
    }

    return res.status(200).json({ RspCode: '00', Message: 'Confirm Success' });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('❌ [VNPay IPN Error]:', err.message);
    return res.status(200).json({ RspCode: '99', Message: 'Unknown error' });
  }
};

/**
 * XEM LỊCH SỬ AUDIT LOG CỦA MỘT ĐƠN HÀNG (ADMIN / VENDOR)
 * GET /api/v1/payments/audit-logs/:orderId
 */
const getOrderAuditLogs = catchAsync(async (req, res) => {
  const { orderId } = req.params;
  const logs = await AuditLogService.getOrderAuditLogs(orderId);
  return ApiResponse.success(res, 200, 'Lấy lịch sử kiểm toán đơn hàng thành công', logs);
});

module.exports = {
  createVNPayPaymentUrl,
  vnpayReturn,
  vnpayIpn,
  getOrderAuditLogs,
  // Export helper functions for testing
  sortObject,
  calculateVNPaySecureHash,
  verifyVNPaySecureHash,
  formatVNPayDate,
};
