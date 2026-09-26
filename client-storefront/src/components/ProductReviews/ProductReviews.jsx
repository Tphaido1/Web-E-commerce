import React, { useState, useEffect, useCallback } from 'react';
import './ProductReviews.css';

export const ProductReviews = ({ productId, productName }) => {
  const [reviews, setReviews] = useState([]);
  const [summary, setSummary] = useState({
    averageRating: 5.0,
    totalReviews: 0,
    starsBreakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
  });
  const [loading, setLoading] = useState(false);

  // Form states
  const [userRating, setUserRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState(null); // { type: 'success' | 'error', message: string }

  const fetchReviews = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/reviews/product/${productId}?page=1&limit=10`);
      if (res.ok) {
        const json = await res.json();
        setReviews(json.data.reviews || []);
        if (json.data.summary) {
          setSummary(json.data.summary);
        }
      }
    } catch (err) {
      console.warn('Lỗi khi tải đánh giá sản phẩm:', err);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    setAlert(null);

    const token = localStorage.getItem('token');
    if (!token) {
      setAlert({
        type: 'error',
        message: 'Vui lòng đăng nhập để gửi đánh giá sản phẩm.',
      });
      return;
    }

    if (!comment.trim()) {
      setAlert({
        type: 'error',
        message: 'Vui lòng nhập nội dung nhận xét của bạn.',
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/reviews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          productId,
          rating: userRating,
          comment: comment.trim(),
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setAlert({
          type: 'success',
          message: 'Cảm ơn bạn! Đánh giá của bạn đã được ghi nhận và hiển thị.',
        });
        setComment('');
        setUserRating(5);
        fetchReviews();
      } else {
        setAlert({
          type: 'error',
          message:
            data.message ||
            'Chỉ khách hàng đã từng mua và nhận sản phẩm này mới có thể đánh giá.',
        });
      }
    } catch {
      setAlert({
        type: 'error',
        message: 'Lỗi kết nối máy chủ. Vui lòng thử lại sau.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const renderStars = (rating) => {
    const full = Math.round(rating);
    return '★'.repeat(full) + '☆'.repeat(Math.max(0, 5 - full));
  };

  const maskEmail = (email) => {
    if (!email) return 'Khách hàng';
    const parts = email.split('@');
    if (parts.length < 2) return email;
    const name = parts[0];
    const masked = name.length > 2 ? `${name[0]}***${name[name.length - 1]}` : `${name}***`;
    return `${masked}@${parts[1]}`;
  };

  return (
    <section className="product-reviews-container" aria-label="Đánh giá sản phẩm">
      <div className="reviews-header">
        <h3>
          <span>⭐</span> Đánh giá từ khách hàng ({summary.totalReviews})
        </h3>
      </div>

      {/* TỔNG QUAN ĐIỂM SỐ & BIỂU ĐỒ SAO */}
      <div className="reviews-summary-grid">
        <div className="rating-overview">
          <div className="rating-score">{summary.averageRating.toFixed(1)}</div>
          <div className="rating-stars">{renderStars(summary.averageRating)}</div>
          <div className="rating-total">Dựa trên {summary.totalReviews} lượt đánh giá</div>
        </div>

        <div className="stars-breakdown">
          {[5, 4, 3, 2, 1].map((star) => {
            const count = summary.starsBreakdown?.[star] || 0;
            const percentage = summary.totalReviews > 0 ? (count / summary.totalReviews) * 100 : 0;
            return (
              <div key={star} className="breakdown-row">
                <span>{star} sao</span>
                <div className="breakdown-bar-bg">
                  <div
                    className="breakdown-bar-fill"
                    style={{ width: `${percentage}%` }}
                    role="progressbar"
                    aria-valuenow={percentage}
                    aria-valuemin="0"
                    aria-valuemax="100"
                  />
                </div>
                <span className="breakdown-count">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* DANH SÁCH CÁC BÌNH LUẬN ĐÃ DUYỆT */}
      <div className="reviews-list">
        {loading && <p style={{ color: '#6b7280' }}>Đang tải danh sách đánh giá...</p>}
        {!loading && reviews.length === 0 && (
          <p style={{ color: '#6b7280', fontStyle: 'italic' }}>
            Chưa có đánh giá nào cho sản phẩm này. Hãy là người đầu tiên mua và đánh giá!
          </p>
        )}
        {reviews.map((rev) => (
          <article key={rev._id} className="review-card">
            <div className="review-card-header">
              <div className="reviewer-meta">
                <span className="reviewer-email">{maskEmail(rev.user?.email)}</span>
                {rev.isVerifiedPurchase && (
                  <span className="verified-badge">
                    <span>✓</span> Đã mua hàng
                  </span>
                )}
              </div>
              <span className="review-date">
                {rev.createdAt ? new Date(rev.createdAt).toLocaleDateString('vi-VN') : ''}
              </span>
            </div>
            <div className="rating-stars" style={{ fontSize: '1rem' }}>
              {renderStars(rev.rating)}
            </div>
            <p className="review-comment">{rev.comment}</p>
          </article>
        ))}
      </div>

      {/* FORM GỬI ĐÁNH GIÁ MỚI (VERIFIED PURCHASE) */}
      <div className="review-form-card">
        <h4>Viết nhận xét của bạn về {productName || 'sản phẩm này'}</h4>

        {alert && (
          <div className={`review-alert review-alert-${alert.type}`} role="alert">
            {alert.message}
          </div>
        )}

        <form onSubmit={handleSubmitReview}>
          <div className="star-rating-selector">
            <span style={{ fontSize: '0.9rem', color: '#4b5563', fontWeight: 500 }}>
              Đánh giá của bạn:
            </span>
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                className={`star-btn ${star <= userRating ? 'active' : ''}`}
                onClick={() => setUserRating(star)}
                aria-label={`${star} sao`}
              >
                ★
              </button>
            ))}
          </div>

          <textarea
            className="review-textarea"
            placeholder="Chia sẻ trải nghiệm thực tế của bạn về chất lượng sản phẩm, đóng gói và dịch vụ giao hàng..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={1000}
            required
          />

          <button type="submit" className="submit-review-btn" disabled={submitting}>
            {submitting ? 'Đang gửi đánh giá...' : 'Gửi đánh giá xác thực'}
          </button>
        </form>
      </div>
    </section>
  );
};

export default ProductReviews;
