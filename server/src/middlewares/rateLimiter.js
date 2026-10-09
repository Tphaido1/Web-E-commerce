/**
 * rateLimiter.js
 * ------------------------------------------------------------
 * Middleware giới hạn tần suất request (Rate Limiting)
 * bảo vệ hệ thống khỏi các đợt tấn công từ chối dịch vụ (DDoS),
 * spam API và tấn công dò quét mật khẩu (Brute-force).
 * 
 * - Tuân thủ RFC về RateLimit headers:
 *   + RateLimit-Limit
 *   + RateLimit-Remaining
 *   + RateLimit-Reset
 *   + Retry-After (khi chạm ngưỡng 429)
 * - Tự động dọn dẹp các IP đã hết hạn để tránh rò rỉ bộ nhớ (Memory Leak).
 * - Cung cấp các cấu hình phân cấp:
 *   + apiRateLimiter: Giới hạn toàn sàn cho API
 *   + authRateLimiter: Giới hạn nghiêm ngặt cho Login, Register
 *   + checkoutRateLimiter: Giới hạn cho luồng tạo đơn Checkout
 * ------------------------------------------------------------
 */

const ApiResponse = require('../utils/apiResponse');

/**
 * Factory tạo Rate Limiter Middleware
 * @param {Object} options
 * @param {number} [options.windowMs=900000] - Khung thời gian tính bằng ms (mặc định 15 phút)
 * @param {number} [options.max=100] - Số request tối đa trong 1 khung thời gian
 * @param {string} [options.message] - Thông điệp khi chạm ngưỡng
 * @param {number} [options.statusCode=429] - Mã trạng thái HTTP trả về
 * @param {Function} [options.keyGenerator] - Hàm lấy key định danh client (mặc định IP)
 * @param {Function} [options.skip] - Hàm kiểm tra bỏ qua rate limit
 * @param {boolean} [options.skipInTest=true] - Bỏ qua khi chạy Jest trừ khi có header 'x-test-rate-limit'
 */
function createRateLimiter(options = {}) {
  const windowMs = options.windowMs || 15 * 60 * 1000;
  const max = options.max || 100;
  const message =
    options.message ||
    'Quá nhiều yêu cầu từ địa chỉ IP này. Vui lòng thử lại sau ít phút.';
  const statusCode = options.statusCode || 429;
  const keyGenerator =
    options.keyGenerator ||
    // Express resolves req.ip using its configured trusted proxies. Never accept
    // an arbitrary client-supplied X-Forwarded-For value as the limiter key.
    ((req) => req.ip || req.socket?.remoteAddress || '127.0.0.1');

  const store = new Map();

  // Dọn dẹp định kỳ các bản ghi đã quá hạn
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store.entries()) {
      if (now > record.resetTime) {
        store.delete(key);
      }
    }
  }, Math.min(windowMs, 60000));

  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }

  const limiterMiddleware = (req, res, next) => {
    // Cho phép skip theo logic tùy biến
    if (options.skip && options.skip(req)) {
      return next();
    }

    // Môi trường kiểm thử Jest tự động bỏ qua trừ khi được kích hoạt rõ ràng để test rate limit
    const isTest = process.env.NODE_ENV === 'test';
    const forceTest = req.headers && req.headers['x-test-rate-limit'] === 'true';
    if (isTest && options.skipInTest !== false && !forceTest) {
      return next();
    }

    const key = keyGenerator(req);
    const now = Date.now();
    let record = store.get(key);

    if (!record || now > record.resetTime) {
      record = {
        count: 0,
        resetTime: now + windowMs,
      };
      store.set(key, record);
    }

    record.count += 1;
    const remaining = Math.max(0, max - record.count);
    const resetSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));

    // Đính kèm các HTTP header chuẩn
    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', remaining);
    res.setHeader('RateLimit-Reset', resetSeconds);

    if (record.count > max) {
      res.setHeader('Retry-After', resetSeconds);
      return ApiResponse.error(res, statusCode, message, [
        {
          retryAfterSeconds: resetSeconds,
          limit: max,
        },
      ]);
    }

    next();
  };

  limiterMiddleware.reset = (key) => {
    if (key) {
      store.delete(key);
    } else {
      store.clear();
    }
  };

  limiterMiddleware.getRecord = (key) => store.get(key);
  limiterMiddleware.store = store;

  return limiterMiddleware;
}

// 1. Rate Limiter chung cho toàn bộ API endpoints (ngăn spam tổng thể)
const apiRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 300, // 300 requests / 15 phút
  message: 'Bạn đã gửi quá nhiều yêu cầu đến hệ thống. Vui lòng thử lại sau 15 phút.',
  skipInTest: true,
});

// 2. Rate Limiter nghiêm ngặt cho Auth (chống brute-force mật khẩu & spam tạo tài khoản)
const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 10, // Tối đa 10 lần thử
  message: 'Quá nhiều lần thử xác thực không hợp lệ. Vui lòng thử lại sau 15 phút.',
  skipInTest: true,
});

// 3. Rate Limiter cho luồng Đặt hàng / Checkout (chống spam bot tạo đơn ảo)
const checkoutRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 phút
  max: 20, // Tối đa 20 đơn / 10 phút
  message: 'Tần suất thao tác đặt hàng quá nhanh. Vui lòng chờ giây lát trước khi gửi đơn mới.',
  skipInTest: true,
});

module.exports = {
  createRateLimiter,
  apiRateLimiter,
  authRateLimiter,
  checkoutRateLimiter,
};
