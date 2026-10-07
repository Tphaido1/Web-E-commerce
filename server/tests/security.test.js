/**
 * security.test.js
 * ------------------------------------------------------------
 * Test Suite kiểm thử toàn diện các tính năng bảo mật Tuần 7:
 * 1. HTTP Security Headers (Helmet, CSP, Frameguard, NoSniff).
 * 2. Rate Limiting (Chống DDoS, Brute Force, chuẩn RFC headers, HTTP 429).
 * 3. Chống NoSQL Injection (Làm sạch toán tử $gt, $ne, $where và chặn input độc hại).
 * 4. Chống XSS (Làm sạch thẻ <script>, inline event handlers onerror/onload, javascript: URI).
 * 5. Chống HTTP Parameter Pollution (HPP).
 * 6. Endpoint Security Audit (/api/v1/security/audit).
 * ------------------------------------------------------------
 */

const request = require('supertest');
const app = require('../src/app');
const {
  createRateLimiter,
  authRateLimiter,
} = require('../src/middlewares/rateLimiter');
const {
  hasNoSqlOperator,
  sanitizeNoSql,
  cleanXssString,
  sanitizeXss,
} = require('../src/middlewares/security.middleware');

describe('Tuần 7 — Leader Security & Rate Limit Test Suite', () => {
  beforeEach(() => {
    // Reset rate limiter stores trước mỗi test
    authRateLimiter.reset();
  });

  // ===========================================================================
  // 1. KIỂM THỬ HELMET & HTTP SECURITY HEADERS
  // ===========================================================================
  describe('1. HTTP Security Headers (Helmet)', () => {
    it('Phải thiết lập header X-Frame-Options là DENY để chống Clickjacking', async () => {
      const res = await request(app).get('/api/v1/healthcheck');
      expect(res.headers['x-frame-options']).toBe('DENY');
    });

    it('Phải thiết lập X-Content-Type-Options là nosniff để chống MIME sniffing', async () => {
      const res = await request(app).get('/api/v1/healthcheck');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('Phải đính kèm Content-Security-Policy bảo vệ tài nguyên', async () => {
      const res = await request(app).get('/api/v1/healthcheck');
      expect(res.headers['content-security-policy']).toBeDefined();
      expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    });

    it('Phải ẩn header X-Powered-By để giấu thông tin công nghệ Express', async () => {
      const res = await request(app).get('/api/v1/healthcheck');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });

  // ===========================================================================
  // 2. KIỂM THỬ RATE LIMITING (CHỐNG DDOS & BRUTE-FORCE)
  // ===========================================================================
  describe('2. Rate Limiting Engine', () => {
    it('createRateLimiter phải giới hạn request và trả về HTTP 429 kèm Retry-After', async () => {
      const express = require('express');
      const testApp = express();

      const customLimiter = createRateLimiter({
        windowMs: 60 * 1000,
        max: 3,
        message: 'Quá giới hạn 3 request',
        skipInTest: false,
      });

      testApp.use(customLimiter);
      testApp.get('/test-limit', (req, res) => res.json({ ok: true }));

      // 3 request đầu tiên phải thành công (HTTP 200)
      const res1 = await request(testApp).get('/test-limit');
      expect(res1.status).toBe(200);
      expect(res1.headers['ratelimit-remaining']).toBe('2');

      const res2 = await request(testApp).get('/test-limit');
      expect(res2.status).toBe(200);
      expect(res2.headers['ratelimit-remaining']).toBe('1');

      const res3 = await request(testApp).get('/test-limit');
      expect(res3.status).toBe(200);
      expect(res3.headers['ratelimit-remaining']).toBe('0');

      // Request thứ 4 chạm ngưỡng và phải nhận HTTP 429
      const res4 = await request(testApp).get('/test-limit');
      expect(res4.status).toBe(429);
      expect(res4.body.status).toBe('error');
      expect(res4.body.message).toContain('Quá giới hạn 3 request');
      expect(res4.headers['retry-after']).toBeDefined();
    });

    it('authRateLimiter phải chặn brute-force khi vượt ngưỡng max attempts', async () => {
      const express = require('express');
      const testApp = express();
      authRateLimiter.reset();

      testApp.use(authRateLimiter);
      testApp.post('/test-auth', (req, res) => res.json({ ok: true }));

      // Gửi 10 request hợp lệ với header force-test
      for (let i = 0; i < 10; i++) {
        const res = await request(testApp)
          .post('/test-auth')
          .set('x-test-rate-limit', 'true');
        expect(res.status).toBe(200);
      }

      // Request thứ 11 phải bị từ chối 429
      const blockedRes = await request(testApp)
        .post('/test-auth')
        .set('x-test-rate-limit', 'true');

      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.status).toBe('error');
      expect(blockedRes.body.message).toContain('Quá nhiều lần thử xác thực không hợp lệ');
      expect(blockedRes.headers['retry-after']).toBeDefined();
    });

    it('Phương thức reset() phải xóa bộ đếm và cho phép gửi request trở lại', async () => {
      const express = require('express');
      const testApp = express();

      const limiter = createRateLimiter({
        windowMs: 60 * 1000,
        max: 1,
        skipInTest: false,
      });

      testApp.use(limiter);
      testApp.get('/test-reset', (req, res) => res.json({ ok: true }));

      await request(testApp).get('/test-reset');
      const blocked = await request(testApp).get('/test-reset');
      expect(blocked.status).toBe(429);

      // Reset
      limiter.reset();

      // Sau khi reset phải gọi lại bình thường
      const recovered = await request(testApp).get('/test-reset');
      expect(recovered.status).toBe(200);
    });
  });

  // ===========================================================================
  // 3. KIỂM THỬ CHỐNG NOSQL INJECTION
  // ===========================================================================
  describe('3. NoSQL Injection Defense', () => {
    it('hasNoSqlOperator phải phát hiện các toán tử $ và dot-notation', () => {
      expect(hasNoSqlOperator({ email: 'test@example.com' })).toBe(false);
      expect(hasNoSqlOperator({ password: { $gt: '' } })).toBe(true);
      expect(hasNoSqlOperator({ password: { $ne: null } })).toBe(true);
      expect(hasNoSqlOperator({ 'user.role': 'admin' })).toBe(true);
      expect(hasNoSqlOperator([{ $where: 'sleep(100)' }])).toBe(true);
    });

    it('sanitizeNoSql phải triệt tiêu các key chứa $ hoặc . trong object lồng nhau', () => {
      const dirtyPayload = {
        email: 'user@example.com',
        password: {
          $ne: null,
          validKey: 'safe-password',
        },
        'system.admin': true,
        filters: [{ $gt: 100 }, { price: 50 }],
      };

      const clean = sanitizeNoSql(dirtyPayload);

      expect(clean.email).toBe('user@example.com');
      expect(clean.password.$ne).toBeUndefined();
      expect(clean.password.validKey).toBe('safe-password');
      expect(clean['system.admin']).toBeUndefined();
      expect(clean.filters[0]).toEqual({});
      expect(clean.filters[1]).toEqual({ price: 50 });
    });

    it('Middleware mongoSanitize phải tự động làm sạch payload gửi lên API /security/echo', async () => {
      const dirtyBody = {
        username: 'attacker',
        queryInjection: { $gt: '' },
        nested: {
          $where: 'malicious()',
          cleanField: 'allowed',
        },
      };

      const res = await request(app)
        .post('/api/v1/security/echo')
        .send(dirtyBody);

      expect(res.status).toBe(200);
      expect(res.body.data.body.queryInjection).toEqual({});
      expect(res.body.data.body.nested.$where).toBeUndefined();
      expect(res.body.data.body.nested.cleanField).toBe('allowed');
    });

    it('Middleware mongoSanitize phải trả về HTTP 400 nếu kích hoạt chế độ block khi có injection', async () => {
      const res = await request(app)
        .post('/api/v1/security/echo')
        .set('x-test-nosql-block', 'true')
        .send({
          email: 'admin@example.com',
          password: { $ne: '' },
        });

      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toContain('NoSQL Injection không hợp lệ');
    });
  });

  // ===========================================================================
  // 4. KIỂM THỬ CHỐNG XSS (CROSS-SITE SCRIPTING)
  // ===========================================================================
  describe('4. XSS Protection', () => {
    it('cleanXssString phải loại bỏ các thẻ <script> và inline event handlers', () => {
      const xssScript = 'Hello <script>alert("hacked")</script> World';
      expect(cleanXssString(xssScript)).toBe('Hello  World');

      const xssImg = '<img src="x" onerror="stealCookies()">';
      expect(cleanXssString(xssImg)).not.toContain('onerror=');

      const xssUri = 'javascript:alert(1)';
      expect(cleanXssString(xssUri)).toBe('alert(1)');

      const xssIframe = 'Xem thử <iframe src="evil.com"></iframe> tại đây';
      expect(cleanXssString(xssIframe)).toBe('Xem thử  tại đây');
    });

    it('sanitizeXss phải giữ nguyên tiếng Việt có dấu và ký tự an toàn', () => {
      const safeText = 'Áo thun cotton cao cấp màu Đen, cỡ XL (100% Chính Hãng)';
      expect(sanitizeXss(safeText)).toBe(safeText);
    });

    it('Middleware xssSanitize phải làm sạch nội dung gửi lên qua API', async () => {
      const maliciousBody = {
        title: 'Bình luận sản phẩm <script>alert("xss")</script>',
        comment: 'Hàng tốt <img src="invalid" onerror="alert(document.cookie)"> rất ưng ý',
        link: 'javascript:window.location="http://evil.com"',
      };

      const res = await request(app)
        .post('/api/v1/security/echo')
        .send(maliciousBody);

      expect(res.status).toBe(200);
      expect(res.body.data.body.title).toBe('Bình luận sản phẩm ');
      expect(res.body.data.body.comment).not.toContain('onerror=');
      expect(res.body.data.body.link).not.toContain('javascript:');
    });
  });

  // ===========================================================================
  // 5. KIỂM THỬ SECURITY AUDIT ENDPOINT
  // ===========================================================================
  describe('5. Security Audit Endpoint', () => {
    it('GET /api/v1/security/audit phải trả về đầy đủ các tầng bảo mật của hệ thống', async () => {
      const res = await request(app).get('/api/v1/security/audit');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.layers.helmetHeaders.active).toBe(true);
      expect(res.body.data.layers.rateLimiter.active).toBe(true);
      expect(res.body.data.layers.noSqlInjectionDefense.active).toBe(true);
      expect(res.body.data.layers.xssSanitizer.active).toBe(true);
      expect(res.body.data.layers.hppDefense.active).toBe(true);
    });
  });
});
