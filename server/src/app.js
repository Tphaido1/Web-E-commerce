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
const { apiRateLimiter } = require('./middlewares/rateLimiter');
const {
  mongoSanitize,
  xssSanitize,
  hppSanitize,
} = require('./middlewares/security.middleware');

const app = express();

// ----- Security Middleware (Tuần 7 Leader) -----
// 1. Helmet: thiết lập HTTP headers an toàn chống clickjacking, XSS, sniffing, CSP
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com'],
        connectSrc: ["'self'", env.CLIENT_URL, env.ADMIN_URL],
        fontSrc: ["'self'", 'https:', 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    frameguard: { action: 'deny' },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);

// 2. CORS: chỉ cho phép 2 client (storefront & admin) gọi API
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
app.use(express.json({ limit: '10kb' })); // Parse JSON body (giới hạn 10kb chống DoS body)
app.use(express.urlencoded({ extended: true, limit: '10kb' })); // Parse form data

// 3. Chống NoSQL Injection: Quét và làm sạch các toán tử MongoDB ($gt, $ne...)
app.use(mongoSanitize());

// 4. Chống XSS (Cross-Site Scripting): Làm sạch thẻ <script>, inline handlers
app.use(xssSanitize());

// 5. Chống HTTP Parameter Pollution (HPP)
app.use(hppSanitize(['category', 'sort', 'status']));

// ----- Root Router -----
// Toàn bộ API sẽ có tiền tố /api/v1 và áp dụng Rate Limiter chống spam DDoS
app.use('/api/v1', apiRateLimiter, rootRouter);

// ----- Route mặc định -----
app.get('/', (req, res) => {
  res.json({ message: 'Chào mừng đến với E-Commerce API 🚀' });
});

// ----- Error Handling (luôn đặt SAU CÙNG) -----
app.use(notFoundHandler); // Bắt các route không tồn tại (404)
app.use(errorHandler); // Xử lý lỗi tập trung

module.exports = app;
