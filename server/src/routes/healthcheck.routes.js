/**
 * healthcheck.routes.js
 * ------------------------------------------------------------
 * Route đơn giản để kiểm tra API đang chạy (dùng cho Postman,
 * Uptime monitor, hoặc CI/CD kiểm tra deploy thành công).
 * ------------------------------------------------------------
 */

const express = require('express');
const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/apiResponse');

const router = express.Router();

// @route   GET /api/v1/healthcheck
// @desc    Kiểm tra API còn sống hay không
// @access  Public
router.get(
  '/',
  catchAsync(async (req, res) => {
    return ApiResponse.success(res, 200, 'API is running', {
      status: 'success',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;
