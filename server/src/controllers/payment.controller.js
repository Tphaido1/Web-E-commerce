const crypto = require('crypto');
const querystring = require('querystring');
const Order = require('../models/Order.model');
const AuditLogService = require('../services/auditLog.service');
const { getIo, notifyAdmin, notifyUser, notifyOrderUpdate } = require('../config/socket');
const { canManageWholeOrder, notifyOrderVendors } = require('../utils/vendorScope.util');
const ApiResponse = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');
const env = require('../config/env');

/**
 * Format Date thành YYYYMMDDHHmmss theo chuẩn VNPay
 */
const formatVNPayDate = (date) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}${values.month}${values.day}${values.hour}${values.minute}${values.second}`;
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
  const signData = querystring.stringify(sortedParams, '&', '=', { encodeURIComponent: (value) => value });
  const hmac = crypto.createHmac('sha512', secretKey);
  return hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');
};

/**
 * Xác thực chữ ký số từ request của VNPay
 */
const verifyVNPaySecureHash = (query, secretKey) => {
  if (!secretKey || !query || Object.values(query).some(value => typeof value !== 'string' && typeof value !== 'number')) return false;
  const vnpParams = { ...query };
  const secureHash = vnpParams['vnp_SecureHash'];

  delete vnpParams['vnp_SecureHash'];
  delete vnpParams['vnp_SecureHashType'];

  if (typeof secureHash !== 'string' || !/^[a-f\d]{128}$/i.test(secureHash)) return false;
  const calculatedHash = calculateVNPaySecureHash(vnpParams, secretKey);
  return crypto.timingSafeEqual(Buffer.from(secureHash, 'hex'), Buffer.from(calculatedHash, 'hex'));
};

const isVNPayConfigured = () => Boolean(env.VNP_TMN_CODE && env.VNP_HASH_SECRET &&
  (env.NODE_ENV === 'test' || !['RAHZANVOWZGCLUTNZJNXGUSYDJAEXMGS', 'your_vnpay_hash_secret'].includes(env.VNP_HASH_SECRET)));

const validCallback = (params) => params.vnp_TmnCode === env.VNP_TMN_CODE &&
  typeof params.vnp_TxnRef === 'string' && /^[\w-]{1,100}$/.test(params.vnp_TxnRef) &&
  /^\d{2}$/.test(params.vnp_ResponseCode) && /^\d{2}$/.test(params.vnp_TransactionStatus) &&
  /^\d+$/.test(params.vnp_Amount) && Number.isSafeInteger(Number(params.vnp_Amount)) &&
  (!params.vnp_CurrCode || params.vnp_CurrCode === 'VND');

const callbackSucceeded = params => params.vnp_ResponseCode === '00' && params.vnp_TransactionStatus === '00';

/**
 * TẠO URL DẪN SANG CỔNG THANH TOÁN VNPAY SANDBOX
 * POST /api/v1/payments/create-vnpay-url
 */
const createVNPayPaymentUrl = catchAsync(async (req, res) => {
  if (!isVNPayConfigured()) throw Object.assign(new Error('VNPay chưa được cấu hình merchant. Vui lòng chọn COD hoặc thử lại sau.'), { statusCode: 503 });
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
  const isAdmin = req.user.role === 'admin';
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

  if (order.paymentMethod !== 'VNPAY' || !['pending', 'processing'].includes(order.status) ||
    !Number.isSafeInteger(Math.round(order.finalAmount * 100)) || order.finalAmount <= 0) {
    throw Object.assign(new Error('Đơn hàng không phù hợp để thanh toán VNPay'), { statusCode: 400 });
  }
  if (!['vn', 'en'].includes(locale) || (bankCode != null && (typeof bankCode !== 'string' || !/^[A-Za-z0-9_]{0,20}$/.test(bankCode)))) {
    throw Object.assign(new Error('Ngôn ngữ hoặc mã ngân hàng không hợp lệ'), { statusCode: 400 });
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

  const redirectUrl = `${env.VNP_URL}?${querystring.stringify(sortedParams, '&', '=', { encodeURIComponent: (value) => value })}&vnp_SecureHash=${secureHash}`;

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
// Compare the snapshot used to verify the callback before committing it.
// A cancellation or another callback may have won since the initial read.
const commitPayment = (order, paymentStatus, trackingEntry) => Order.findOneAndUpdate(
  { _id: order._id, status: order.status, paymentStatus: order.paymentStatus, paymentMethod: 'VNPAY' },
  { $set: { paymentStatus, ...(paymentStatus === 'paid' && { status: 'processing', paymentMethod: 'VNPAY' }) },
    $push: { trackingHistory: trackingEntry } },
  { new: true, runValidators: true }
);

const vnpayReturn = catchAsync(async (req, res) => {
  if (!isVNPayConfigured()) throw Object.assign(new Error('VNPay chưa được cấu hình merchant'), { statusCode: 503 });
  const vnpParams = req.query;
  const isValidSignature = verifyVNPaySecureHash(vnpParams, env.VNP_HASH_SECRET);

  if (!isValidSignature) {
    const error = new Error('Chữ ký số không hợp lệ (Dữ liệu giao dịch có thể bị giả mạo)');
    error.statusCode = 400;
    throw error;
  }
  if (!validCallback(vnpParams)) throw Object.assign(new Error('Thông tin giao dịch VNPay không hợp lệ'), { statusCode: 400 });

  const orderCode = vnpParams['vnp_TxnRef'];
  const responseCode = vnpParams['vnp_ResponseCode'];
  const transactionNo = vnpParams['vnp_TransactionNo'];
  const bankCode = vnpParams['vnp_BankCode'];
  const vnpAmount = Number(vnpParams['vnp_Amount']) / 100;

  const order = await Order.findOne({ orderCode });
  if (!order) {
    const error = new Error(`Không tìm thấy đơn hàng #${orderCode}`);
    error.statusCode = 404;
    throw error;
  }

  if (!Number.isFinite(vnpAmount) || Number(vnpParams.vnp_Amount) !== Math.round(order.finalAmount * 100)) {
    const error = new Error('Số tiền giao dịch không khớp với đơn hàng');
    error.statusCode = 400;
    throw error;
  }
  if (order.status === 'cancelled' || order.paymentMethod !== 'VNPAY') {
    const error = new Error('Đơn hàng đã bị hủy, không thể xác nhận thanh toán');
    error.statusCode = 400;
    throw error;
  }
  // Return is a browser navigation. Only authenticated server-to-server IPN changes payment state.
  const isSuccess = order.paymentStatus === 'paid';
  const isPending = callbackSucceeded(vnpParams) && order.paymentStatus === 'unpaid';
  return ApiResponse.success(res, 200, isSuccess ? 'Thanh toán thành công' : isPending ? 'Đang chờ xác nhận thanh toán' : 'Thanh toán không thành công', {
    orderCode,
    isSuccess,
    isPending,
    paymentStatus: order.paymentStatus,
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
    if (!isVNPayConfigured()) return res.status(200).json({ RspCode: '99', Message: 'Merchant is not configured' });
    const vnpParams = req.query;
    const isValidSignature = verifyVNPaySecureHash(vnpParams, env.VNP_HASH_SECRET);

    // 1. Kiểm tra chữ ký số (Checksum)
    if (!isValidSignature) {
      return res.status(200).json({ RspCode: '97', Message: 'Checksum failed' });
    }
    if (!validCallback(vnpParams)) return res.status(200).json({ RspCode: '97', Message: 'Invalid callback or merchant' });

    const orderCode = vnpParams['vnp_TxnRef'];
    const responseCode = vnpParams['vnp_ResponseCode'];
    const transactionNo = vnpParams['vnp_TransactionNo'];
    const bankCode = vnpParams['vnp_BankCode'];
    const vnpAmount = Number(vnpParams['vnp_Amount']);

    // 2. Kiểm tra sự tồn tại của đơn hàng
    let order = await Order.findOne({ orderCode });
    if (!order) {
      return res.status(200).json({ RspCode: '01', Message: 'Order not found' });
    }

    // 3. Kiểm tra số tiền giao dịch có khớp không
    const expectedAmount = Math.round(order.finalAmount * 100);
    if (expectedAmount !== vnpAmount) {
      return res.status(200).json({ RspCode: '04', Message: 'Invalid amount' });
    }

    if (order.paymentMethod !== 'VNPAY') return res.status(200).json({ RspCode: '02', Message: 'Order is not payable with VNPay' });

    if (order.status === 'cancelled') {
      return res.status(200).json({ RspCode: '02', Message: 'Order already cancelled' });
    }

    // 4. Kiểm tra tính Idempotent: Đơn hàng đã được xác nhận thanh toán trước đó chưa
    if (['paid', 'refunded'].includes(order.paymentStatus)) {
      return res.status(200).json({ RspCode: '02', Message: 'Order already confirmed' });
    }

    if (!['pending', 'processing'].includes(order.status)) return res.status(200).json({ RspCode: '02', Message: 'Order is not awaiting payment' });
    const isSuccess = callbackSucceeded(vnpParams);
    if (!isSuccess && order.paymentStatus === 'failed') {
      return res.status(200).json({ RspCode: '02', Message: 'Order already confirmed' });
    }
    const committed = await commitPayment(order, isSuccess ? 'paid' : 'failed', {
      status: isSuccess ? 'processing' : order.status,
      note: isSuccess
        ? `VNPay IPN xác nhận thanh toán thành công. Mã GD: ${transactionNo}`
        : `VNPay IPN thông báo giao dịch thất bại. Mã lỗi: ${responseCode}`,
      updatedAt: new Date(),
    });
    if (!committed) {
      const current = await Order.findById(order._id);
      if (current?.status === 'cancelled') {
        return res.status(200).json({ RspCode: '02', Message: 'Order already cancelled' });
      }
      if (current?.paymentStatus === 'paid' || (!isSuccess && current?.paymentStatus === 'failed')) {
        return res.status(200).json({ RspCode: '02', Message: 'Order already confirmed' });
      }
      return res.status(200).json({ RspCode: '99', Message: 'Order changed; retry callback' });
    }
    order = committed;
    if (isSuccess) {
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
      notifyOrderVendors(getIo(), order, 'new_order');
      notifyUser(order.user.toString(), 'payment_success', {
        orderId: order._id,
        orderCode: order.orderCode,
      });
      notifyOrderUpdate(order._id.toString(), 'order_status_updated', {
        orderId: order._id,
        status: 'processing',
      });
    } else {
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
  const order = await Order.findById(orderId);
  if (!order) throw Object.assign(new Error('Không tìm thấy đơn hàng'), { statusCode: 404 });
  if (!canManageWholeOrder(order, req.user)) throw Object.assign(new Error('Bạn không có quyền xem audit log của đơn hàng này'), { statusCode: 403 });
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
