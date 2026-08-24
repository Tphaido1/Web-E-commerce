/**
 * apiResponse.js
 * ------------------------------------------------------------
 * Chuẩn hóa định dạng Response trả về cho toàn bộ API,
 * giúp Frontend (storefront & admin) luôn nhận về 1 cấu trúc thống nhất.
 *
 * Format thành công:
 * {
 *   status: 'success',
 *   message: 'Mô tả ngắn gọn',
 *   data: {...} | [...] | null
 * }
 *
 * Format lỗi:
 * {
 *   status: 'error',
 *   message: 'Mô tả lỗi',
 *   errors: [...] (optional, chi tiết lỗi validation...)
 * }
 * ------------------------------------------------------------
 */

class ApiResponse {
  /**
   * Trả về response thành công
   * @param {import('express').Response} res
   * @param {number} statusCode - Mã HTTP status (200, 201, ...)
   * @param {string} message - Thông điệp mô tả
   * @param {*} data - Dữ liệu trả về (object, array, null)
   */
  static success(res, statusCode = 200, message = 'Thành công', data = null) {
    return res.status(statusCode).json({
      status: 'success',
      message,
      data,
    });
  }

  /**
   * Trả về response lỗi
   * @param {import('express').Response} res
   * @param {number} statusCode - Mã HTTP status (400, 401, 404, 500, ...)
   * @param {string} message - Thông điệp lỗi
   * @param {Array} errors - Danh sách chi tiết lỗi (optional)
   */
  static error(res, statusCode = 500, message = 'Đã xảy ra lỗi', errors = []) {
    return res.status(statusCode).json({
      status: 'error',
      message,
      ...(errors.length > 0 && { errors }),
    });
  }
}

module.exports = ApiResponse;
