const express = require('express');
const request = require('supertest');
const { createRateLimiter } = require('../src/middlewares/rateLimiter');

test('changing untrusted forwarded headers cannot evade the IP request limit', async () => {
  const app = express();
  const limiter = createRateLimiter({ max: 1, windowMs: 60000, skipInTest: false });
  app.use(limiter);
  app.get('/', (_req, res) => res.json({ ok: true }));
  expect((await request(app).get('/').set('X-Forwarded-For', '198.51.100.1')).status).toBe(200);
  const second = await request(app).get('/').set('X-Forwarded-For', '198.51.100.2');
  expect(second.status).toBe(429);
  expect(second.headers['retry-after']).toBeDefined();
});

test('explicitly trusted proxy configuration supplies the Express client IP', async () => {
  const app = express();
  app.set('trust proxy', 'loopback');
  const limiter = createRateLimiter({ max: 1, windowMs: 60000, skipInTest: false });
  app.use(limiter);
  app.get('/', (_req, res) => res.json({ ok: true }));
  expect((await request(app).get('/').set('X-Forwarded-For', '198.51.100.1')).status).toBe(200);
  expect((await request(app).get('/').set('X-Forwarded-For', '198.51.100.2')).status).toBe(200);
  expect((await request(app).get('/').set('X-Forwarded-For', '198.51.100.1')).status).toBe(429);
});

test('repeated product category and sort filters remain scalar at the catalog controller', async () => {
  const app = require('../src/app');
  const Product = require('../src/models/Product.model');
  const Inventory = require('../src/models/Inventory.model');
  const chain = {
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue([]),
  };
  const find = jest.spyOn(Product, 'find').mockReturnValue(chain);
  jest.spyOn(Product, 'countDocuments').mockResolvedValue(0);
  jest.spyOn(Inventory, 'find').mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
  try {
    const response = await request(app).get('/api/v1/products?category=Shoes&category=Clothing&sort=price_asc&sort=price_desc');
    expect(response.status).toBe(200);
    expect(find.mock.calls[0][0].category.$regex.source).toBe('^Clothing$');
    expect(chain.sort).toHaveBeenCalledWith({ price: -1 });
  } finally {
    jest.restoreAllMocks();
  }
});

test('repeated order status filters are normalized consistently by the application', async () => {
  const app = require('../src/app');
  const response = await request(app).post('/api/v1/security/echo?status=pending&status=delivered').send({});
  expect(response.status).toBe(200);
  expect(response.body.data.query.status).toBe('delivered');
});
