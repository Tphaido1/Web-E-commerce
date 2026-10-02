const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');

const app = require('../src/app');
const env = require('../src/config/env');
const User = require('../src/models/User.model');
const Category = require('../src/models/Category.model');
const Product = require('../src/models/Product.model');
const Inventory = require('../src/models/Inventory.model');
const Cart = require('../src/models/Cart.model');

describe('Category & Cart API Tests (Week 1-3 Completion)', () => {
  let mongoServer;
  let adminToken;
  let customerToken;
  let customerUser;
  let sampleProduct;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const admin = await User.create({
      email: 'admin_test@ecommerce.com',
      password: 'AdminPassword123!',
      role: 'admin',
    });

    customerUser = await User.create({
      email: 'customer_test@ecommerce.com',
      password: 'CustomerPassword123!',
      role: 'customer',
    });

    adminToken = jwt.sign({ sub: admin._id, role: admin.role, type: 'access' }, env.JWT_SECRET, { expiresIn: '1h' });
    customerToken = jwt.sign({ sub: customerUser._id, role: customerUser.role, type: 'access' }, env.JWT_SECRET, { expiresIn: '1h' });

    // Tạo sản phẩm mẫu & tồn kho
    sampleProduct = await Product.create({
      name: 'Áo Polo Thể Thao Nam',
      category: 'Clothing',
      price: 250000,
      stock: 50,
      variants: [
        {
          sku: 'POLO-NAVY-L',
          color: 'Navy',
          size: 'L',
          price: 250000,
          stock: 50,
        },
      ],
    });

    await Inventory.create({
      product: sampleProduct._id,
      sku: 'POLO-NAVY-L',
      stock: 50,
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  describe('Category Module CRUD', () => {
    let createdCategoryId;

    it('POST /api/v1/categories - Admin tạo danh mục mới thành công', async () => {
      const res = await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Đồng Hồ Cao Cấp',
          description: 'Các mẫu đồng hồ thời trang chính hãng',
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.name).toBe('Đồng Hồ Cao Cấp');
      expect(res.body.data.slug).toBe('dong-ho-cao-cap');
      createdCategoryId = res.body.data._id;
    });

    it('GET /api/v1/categories - Khách có thể xem danh sách danh mục', async () => {
      const res = await request(app).get('/api/v1/categories');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('GET /api/v1/categories/:id - Xem chi tiết danh mục theo ID', async () => {
      const res = await request(app).get(`/api/v1/categories/${createdCategoryId}`);

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Đồng Hồ Cao Cấp');
    });

    it('PUT /api/v1/categories/:id - Admin cập nhật danh mục thành công', async () => {
      const res = await request(app)
        .put(`/api/v1/categories/${createdCategoryId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          description: 'Mô tả cập nhật mới',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.description).toBe('Mô tả cập nhật mới');
    });

    it('DELETE /api/v1/categories/:id - Admin ẩn danh mục thành công', async () => {
      const res = await request(app)
        .delete(`/api/v1/categories/${createdCategoryId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('ẩn danh mục thành công');
    });
  });

  describe('Cart Module Operations', () => {
    let cartItemId;

    it('GET /api/v1/cart - Lấy giỏ hàng ban đầu (trống)', async () => {
      const res = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.totalAmount).toBe(0);
    });

    it('POST /api/v1/cart/items - Thêm sản phẩm vào giỏ hàng', async () => {
      const res = await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          productId: sampleProduct._id,
          sku: 'POLO-NAVY-L',
          quantity: 2,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].sku).toBe('POLO-NAVY-L');
      expect(res.body.data.items[0].quantity).toBe(2);
      expect(res.body.data.totalAmount).toBe(500000); // 250000 * 2
      cartItemId = res.body.data.items[0]._id;
    });

    it('PUT /api/v1/cart/items/:id - Cập nhật số lượng sản phẩm', async () => {
      const res = await request(app)
        .put(`/api/v1/cart/items/${cartItemId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          quantity: 3,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.items[0].quantity).toBe(3);
      expect(res.body.data.totalAmount).toBe(750000);
    });

    it('DELETE /api/v1/cart/items/:id - Xóa món hàng khỏi giỏ', async () => {
      const res = await request(app)
        .delete(`/api/v1/cart/items/${cartItemId}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(0);
      expect(res.body.data.totalAmount).toBe(0);
    });

    it('DELETE /api/v1/cart - Làm trống toàn bộ giỏ hàng', async () => {
      // Thêm lại rồi xóa hết
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          productId: sampleProduct._id,
          sku: 'POLO-NAVY-L',
          quantity: 1,
        });

      const res = await request(app)
        .delete('/api/v1/cart')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
    });
  });
});
