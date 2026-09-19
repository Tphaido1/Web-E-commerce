/**
 * auth.routes.js
 * ------------------------------------------------------------
 * Route xác thực người dùng.
 * Route chỉ điều hướng tới controller và middleware tương ứng.
 * ------------------------------------------------------------
 */

const express = require('express');
const catchAsync = require('../utils/catchAsync');
const authController = require('../controllers/auth.controller');
const { protect } = require('../middlewares/auth.middleware');

const router = express.Router();

router.post('/register', catchAsync(authController.register));
router.post('/login', catchAsync(authController.login));
router.post('/refresh-token', catchAsync(authController.refreshToken));
router.post('/logout', protect, catchAsync(authController.logout));

module.exports = router;
