import axios from 'axios';

const API_BASE = '/api/v1/reviews';

const initialMockReviews = [
  {
    id: 'rev-001',
    _id: 'rev-001',
    user: { email: 'nguyenvana@gmail.com' },
    product: { name: 'Áo thun Cotton Organic', images: [] },
    rating: 5,
    comment: 'Chất vải rất mịn, mát và thấm hút mồ hôi tốt. Giao hàng nhanh!',
    isVerifiedPurchase: true,
    status: 'approved',
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
  },
  {
    id: 'rev-002',
    _id: 'rev-002',
    user: { email: 'tranvanb@yahoo.com' },
    product: { name: 'Giày Sneaker Streetwear', images: [] },
    rating: 4,
    comment: 'Giày mang êm chân, form chuẩn. Hộp hơi móp do vận chuyển nhẹ.',
    isVerifiedPurchase: true,
    status: 'approved',
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
  },
  {
    id: 'rev-003',
    _id: 'rev-003',
    user: { email: 'spammer99@botmail.com' },
    product: { name: 'Tai nghe Bluetooth Pro', images: [] },
    rating: 1,
    comment: 'Truy cập ngay bit.ly/spam-link để nhận quà khuyến mãi 500k!',
    isVerifiedPurchase: false,
    status: 'pending',
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
  {
    id: 'rev-004',
    _id: 'rev-004',
    user: { email: 'lethic@gmail.com' },
    product: { name: 'Balo chống nước Laptop 15.6"', images: [] },
    rating: 5,
    comment: 'Đựng vừa laptop và nhiều đồ, đi mưa không lo bị ướt. Rất hài lòng.',
    isVerifiedPurchase: true,
    status: 'approved',
    createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
  },
];

let localReviews = [...initialMockReviews];

export const reviewService = {
  list: async (status = '', page = 1, limit = 20) => {
    try {
      const token = localStorage.getItem('token');
      const params = { page, limit };
      if (status) params.status = status;

      const res = await axios.get(API_BASE, {
        params,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return res.data.data;
    } catch {
      // Fallback cho chế độ demo / offline
      let filtered = [...localReviews];
      if (status) {
        filtered = filtered.filter((r) => r.status === status);
      }
      return {
        reviews: filtered,
        pagination: {
          page,
          limit,
          total: filtered.length,
          totalPages: Math.ceil(filtered.length / limit),
        },
      };
    }
  },

  updateStatus: async (id, status, adminFeedback = '') => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.patch(
        `${API_BASE}/${id}/status`,
        { status, adminFeedback },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      return res.data.data;
    } catch {
      // Fallback cập nhật cục bộ
      localReviews = localReviews.map((r) =>
        r.id === id || r._id === id ? { ...r, status, adminFeedback } : r
      );
      return localReviews.find((r) => r.id === id || r._id === id);
    }
  },
};
