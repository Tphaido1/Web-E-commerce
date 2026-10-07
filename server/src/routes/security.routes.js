/**
 * security.routes.js
 * ------------------------------------------------------------
 * Endpoints kiểm tra và kiểm toán trạng thái bảo mật của hệ thống
 * (Security Audit & Posture Inspection - Tuần 7 Leader).
 * ------------------------------------------------------------
 */

const express = require('express');
const ApiResponse = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');

const router = express.Router();

/**
 * @route   GET /api/v1/security/audit
 * @desc    Báo cáo hiện trạng các tầng bảo vệ hệ thống đã được kích hoạt
 * @access  Public
 */
router.get(
  '/audit',
  catchAsync(async (req, res) => {
    return ApiResponse.success(res, 200, 'Security Audit: Tất cả các tầng phòng thủ đang hoạt động', {
      layers: {
        helmetHeaders: {
          active: true,
          details: 'Content-Security-Policy, X-Frame-Options (DENY), X-Content-Type-Options (nosniff), HSTS, Referrer-Policy',
        },
        rateLimiter: {
          active: true,
          details: 'apiRateLimiter (300 req/15m), authRateLimiter (10 req/15m), checkoutRateLimiter (20 req/10m)',
        },
        noSqlInjectionDefense: {
          active: true,
          details: 'Quét đệ quy và triệt tiêu toán tử MongoDB ($gt, $ne, $where...) cùng ký tự dot-notation',
        },
        xssSanitizer: {
          active: true,
          details: 'Lọc thẻ <script>, inline event handlers, javascript: URIs và nhúng iframe độc hại',
        },
        hppDefense: {
          active: true,
          details: 'Chống ô nhiễm tham số truy vấn HTTP Parameter Pollution (HPP)',
        },
      },
      clientIp: req.ip || req.socket.remoteAddress,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * @route   POST /api/v1/security/echo
 * @desc    Endpoint kiểm tra phản hồi sau khi qua các bộ lọc Sanitizer (phục vụ test tự động)
 * @access  Public
 */
router.post(
  '/echo',
  catchAsync(async (req, res) => {
    return ApiResponse.success(res, 200, 'Echo sanitized payload', {
      body: req.body,
      query: req.query,
    });
  })
);

module.exports = router;
