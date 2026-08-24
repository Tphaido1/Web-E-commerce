/**
 * auth.routes.js
 * ------------------------------------------------------------
 * Route xác thực người dùng. Ở Tuần 1 mới chỉ dựng khung (boilerplate),
 * logic thật (kiểm tra user trong DB, so sánh mật khẩu, ký JWT...)
 * sẽ được thành viên phụ trách Auth triển khai ở các tuần sau.
 * ------------------------------------------------------------
 */

const express = require('express');
const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/apiResponse');

const router = express.Router();

// @route   POST /api/v1/auth/login
// @desc    Đăng nhập người dùng, trả về JWT token
// @access  Public
// @body    { email: string, password: string }
router.post(
  '/login',
  catchAsync(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return ApiResponse.error(res, 400, 'Vui lòng nhập email và mật khẩu');
    }

    // TODO: Thay thế bằng logic thật: tìm user trong DB, so sánh password
    // bằng bcryptjs, và ký JWT bằng jsonwebtoken (xem .env.example: JWT_SECRET).
    return ApiResponse.success(res, 200, 'Đăng nhập thành công (mock)', {
      user: {
        id: 'mock_user_id',
        email,
        role: 'customer',
      },
      token: 'mock.jwt.token',
    });
  })
);

module.exports = router;
