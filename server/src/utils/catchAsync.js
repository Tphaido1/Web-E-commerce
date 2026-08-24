/**
 * catchAsync.js
 * ------------------------------------------------------------
 * Higher-order function bọc quanh các hàm async trong Controller.
 * Mục đích: tránh phải viết try-catch lặp lại ở mọi controller.
 * Bất kỳ lỗi nào bị reject trong Promise sẽ tự động được chuyển
 * tới middleware xử lý lỗi tập trung (error.middleware.js) qua next(err).
 *
 * Cách dùng:
 *   exports.getProducts = catchAsync(async (req, res, next) => {
 *     const products = await Product.find();
 *     res.json(products);
 *   });
 * ------------------------------------------------------------
 */

const catchAsync = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = catchAsync;
