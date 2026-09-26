const Review = require('../src/models/Review.model');
const Order = require('../src/models/Order.model');
const Product = require('../src/models/Product.model');
const {
  createReview,
  moderateReviewStatus,
  getProductReviews,
} = require('../src/controllers/review.controller');
const mongoose = require('mongoose');

jest.mock('../src/models/Review.model');
jest.mock('../src/models/Order.model');
jest.mock('../src/models/Product.model');

describe('Review & Rating Moderation Tests (Week 6 - Thành viên B & Verified Purchase)', () => {
  const mockUserId = new mongoose.Types.ObjectId();
  const mockProductId = new mongoose.Types.ObjectId();
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      user: { _id: mockUserId, role: 'customer' },
      body: {},
      params: {},
      query: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  describe('createReview (Verified Purchase Check)', () => {
    test('Từ chối 403 nếu khách hàng chưa từng mua sản phẩm (Chống đánh giá ảo / seeder)', async () => {
      req.body = {
        productId: mockProductId,
        rating: 5,
        comment: 'Sản phẩm quá tuyệt vời!',
      };

      Product.findById.mockResolvedValue({ _id: mockProductId, name: 'Sản phẩm A' });
      // Không tìm thấy đơn hàng thỏa mãn
      Order.findOne.mockResolvedValue(null);

      await createReview(req, res, next);

      expect(next).toHaveBeenCalled();
      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(403);
      expect(err.message).toMatch(/Chỉ khách hàng đã từng mua sản phẩm/);
    });

    test('Từ chối 400 nếu số sao rating không nằm trong khoảng 1 đến 5', async () => {
      req.body = {
        productId: mockProductId,
        rating: 6, // Không hợp lệ
        comment: 'Quá 5 sao',
      };

      await createReview(req, res, next);

      expect(next).toHaveBeenCalled();
      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
      expect(err.message).toMatch(/từ 1 đến 5 sao/);
    });

    test('Chấp nhận tạo đánh giá thành công khi đã mua hàng (Verified Purchase = true)', async () => {
      const mockOrderId = new mongoose.Types.ObjectId();
      req.body = {
        productId: mockProductId,
        rating: 5,
        comment: 'Hàng chuẩn chính hãng, đóng gói cẩn thận',
      };

      Product.findById.mockResolvedValue({ _id: mockProductId, name: 'Giày Sneaker' });
      Order.findOne.mockResolvedValue({
        _id: mockOrderId,
        user: mockUserId,
        status: 'delivered',
      });
      Review.findOne.mockResolvedValue(null); // Chưa đánh giá lần nào

      const mockReviewDoc = {
        _id: new mongoose.Types.ObjectId(),
        product: mockProductId,
        user: mockUserId,
        order: mockOrderId,
        rating: 5,
        comment: req.body.comment,
        isVerifiedPurchase: true,
        status: 'approved',
      };
      Review.create.mockResolvedValue(mockReviewDoc);
      Review.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            ...mockReviewDoc,
            user: { email: 'buyer@real.com' },
          }),
        }),
      });

      await createReview(req, res, next);

      expect(Review.create).toHaveBeenCalledWith(
        expect.objectContaining({
          isVerifiedPurchase: true,
          rating: 5,
        })
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          data: expect.objectContaining({ isVerifiedPurchase: true }),
        })
      );
    });
  });

  describe('moderateReviewStatus (Admin Moderation)', () => {
    test('Admin chuyển trạng thái đánh giá thành "rejected" (Ẩn bình luận vi phạm)', async () => {
      const reviewId = new mongoose.Types.ObjectId();
      req.params = { id: reviewId };
      req.body = { status: 'rejected', adminFeedback: 'Bình luận chứa ngôn từ vi phạm tiêu chuẩn cộng đồng' };
      req.user.role = 'admin';

      const mockReview = {
        _id: reviewId,
        status: 'approved',
        save: jest.fn().mockResolvedValue(true),
      };
      Review.findById.mockResolvedValue(mockReview);

      await moderateReviewStatus(req, res, next);

      expect(mockReview.status).toBe('rejected');
      expect(mockReview.adminFeedback).toBe('Bình luận chứa ngôn từ vi phạm tiêu chuẩn cộng đồng');
      expect(mockReview.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});
