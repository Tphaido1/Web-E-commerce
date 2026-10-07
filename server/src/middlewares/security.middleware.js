/**
 * security.middleware.js
 * ------------------------------------------------------------
 * Bộ middleware bảo mật toàn diện:
 * 1. Chống NoSQL Injection:
 *    - Quét đệ quy req.body, req.query, req.params.
 *    - Loại bỏ/ngăn chặn các toán tử MongoDB độc hại ($gt, $ne, $where, $regex...)
 *      hoặc key chứa ký tự phân cấp '.' gây lỗi logic.
 * 2. Chống XSS (Cross-Site Scripting):
 *    - Làm sạch các chuỗi dữ liệu chứa thẻ <script>, URI javascript:,
 *      inline event handlers (onerror=, onload=, eval=) và thẻ <iframe>.
 * 3. Chống HTTP Parameter Pollution (HPP):
 *    - Chuẩn hóa query string tránh gửi mảng trùng lặp gây xung đột tham số.
 * ------------------------------------------------------------
 */

const ApiResponse = require('../utils/apiResponse');

/**
 * Kiểm tra xem object có chứa key NoSQL Injection không ($ hoặc .)
 * @param {*} obj
 * @returns {boolean}
 */
function hasNoSqlOperator(obj) {
  if (!obj || typeof obj !== 'object') return false;

  for (const key of Object.keys(obj)) {
    if (key.startsWith('$') || key.includes('.')) {
      return true;
    }
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      if (hasNoSqlOperator(obj[key])) return true;
    }
  }
  return false;
}

/**
 * Làm sạch đệ quy object bằng cách loại bỏ các key bắt đầu bằng $ hoặc chứa .
 * @param {*} obj
 * @returns {*}
 */
function sanitizeNoSql(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeNoSql(item));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    // Bỏ qua các key bắt đầu bằng $ (MongoDB operators) hoặc chứa dấu '.'
    if (key.startsWith('$') || key.includes('.')) {
      continue;
    }

    sanitized[key] =
      typeof value === 'object' && value !== null
        ? sanitizeNoSql(value)
        : value;
  }

  return sanitized;
}

/**
 * Middleware ngăn chặn và làm sạch NoSQL Injection
 * @param {Object} [options]
 * @param {'strip'|'block'} [options.mode='strip'] - 'strip': xóa key độc hại; 'block': trả về lỗi 400
 */
function mongoSanitize(options = {}) {
  const mode = options.mode || 'strip';

  return (req, res, next) => {
    const targets = ['body', 'query', 'params'];
    const shouldBlock =
      mode === 'block' ||
      (req.headers && req.headers['x-test-nosql-block'] === 'true');

    for (const target of targets) {
      if (req[target] && typeof req[target] === 'object') {
        if (shouldBlock && hasNoSqlOperator(req[target])) {
          return ApiResponse.error(
            res,
            400,
            'Phát hiện toán tử NoSQL Injection không hợp lệ trong dữ liệu yêu cầu'
          );
        }
        req[target] = sanitizeNoSql(req[target]);
      }
    }

    next();
  };
}

/**
 * Làm sạch chuỗi chống tấn công XSS
 * @param {string} str
 * @returns {string}
 */
function cleanXssString(str) {
  if (typeof str !== 'string') return str;

  return str
    // Loại bỏ thẻ <script>...</script>
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Loại bỏ URI schemes nguy hiểm
    .replace(/javascript\s*:/gi, '')
    .replace(/vbscript\s*:/gi, '')
    .replace(/data\s*:\s*text\/html/gi, '')
    // Loại bỏ inline event handlers (onload, onerror, onclick, onmouseover...)
    .replace(/on\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/on\w+\s*=\s*[^>\s]+/gi, '')
    // Loại bỏ thẻ <iframe>, <object>, <embed>
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '');
}

/**
 * Làm sạch đệ quy XSS cho mọi chuỗi trong object / array
 * @param {*} data
 * @returns {*}
 */
function sanitizeXss(data) {
  if (typeof data === 'string') {
    return cleanXssString(data);
  }
  if (!data || typeof data !== 'object') {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeXss(item));
  }

  const cleaned = {};
  for (const [key, value] of Object.entries(data)) {
    cleaned[key] = sanitizeXss(value);
  }
  return cleaned;
}

/**
 * Middleware làm sạch mã độc XSS
 */
function xssSanitize() {
  return (req, res, next) => {
    ['body', 'query', 'params'].forEach((target) => {
      if (req[target]) {
        req[target] = sanitizeXss(req[target]);
      }
    });
    next();
  };
}

/**
 * Middleware chống HTTP Parameter Pollution (HPP)
 * @param {Array<string>} [whitelist=[]] - Các trường được phép có nhiều giá trị trong query (VD: categories, tags)
 */
function hppSanitize(whitelist = []) {
  return (req, res, next) => {
    if (req.query && typeof req.query === 'object') {
      for (const [key, val] of Object.entries(req.query)) {
        if (Array.isArray(val) && !whitelist.includes(key)) {
          // Chỉ lấy giá trị cuối cùng nếu không nằm trong whitelist
          req.query[key] = val[val.length - 1];
        }
      }
    }
    next();
  };
}

module.exports = {
  mongoSanitize,
  xssSanitize,
  hppSanitize,
  hasNoSqlOperator,
  sanitizeNoSql,
  cleanXssString,
  sanitizeXss,
};
