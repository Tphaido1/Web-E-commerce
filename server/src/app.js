/**
 * app.js
 * ------------------------------------------------------------
 * Cấu hình Express Application: middlewares toàn cục (security,
 * logging, body-parser, CORS) và gắn Root Router.
 * File này KHÔNG chịu trách nhiệm "listen" cổng hay kết nối DB
 * (việc đó thuộc về server.js) — giúp tách biệt rõ concerns,
 * đồng thời dễ viết test (import app mà không cần start server thật).
 * ------------------------------------------------------------
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const env = require('./config/env');
const rootRouter = require('./routes');
const { notFoundHandler, errorHandler } = require('./middlewares/error.middleware');

const app = express();

// ----- Security Middleware -----
// Helmet: set các HTTP header bảo mật cơ bản (chống XSS, sniffing...)
app.use(helmet());

// CORS: chỉ cho phép 2 client (storefront & admin) gọi API
app.use(
  cors({
    origin: [env.CLIENT_URL, env.ADMIN_URL],
    credentials: true,
  })
);

// ----- Logging Middleware -----
// Morgan: log request ra console, dùng format 'dev' cho môi trường phát triển
if (env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ----- Body Parser Middleware -----
app.use(express.json({ limit: '10kb' })); // Parse JSON body
app.use(express.urlencoded({ extended: true, limit: '10kb' })); // Parse form data

// ----- Root Router -----
// Toàn bộ API sẽ có tiền tố /api/v1
app.use('/api/v1', rootRouter);

// ----- Route mặc định -----
app.get('/', (req, res) => {
  res.json({ message: 'Chào mừng đến với E-Commerce API 🚀' });
});

// ----- Error Handling (luôn đặt SAU CÙNG) -----
app.use(notFoundHandler); // Bắt các route không tồn tại (404)
app.use(errorHandler); // Xử lý lỗi tập trung

module.exports = app;
