import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../../components/Header/Header.jsx';
import Footer from '../../components/Footer/Footer.jsx';
import ProductCard from '../../components/ProductCard/ProductCard.jsx';
import { useWishlist } from '../../context/WishlistContext.jsx';
import { getRecommendations } from '../../services/userService.js';
import './Wishlist.css';

function Wishlist() {
  const { wishlistProducts, wishlistCount, isLoading, refreshWishlist } = useWishlist();
  const [recommendations, setRecommendations] = useState([]);
  const [loadingRecs, setLoadingRecs] = useState(false);

  useEffect(() => {
    refreshWishlist();
  }, [refreshWishlist]);

  // Load recommendations based on user's wishlisted categories
  useEffect(() => {
    let isMounted = true;
    setLoadingRecs(true);

    const categories = [
      ...new Set(
        wishlistProducts
          .map((p) => p.category?.name || p.category)
          .filter(Boolean)
      ),
    ];

    getRecommendations({ categories })
      .then((data) => {
        if (!isMounted) return;
        const recList = data?.recommendations || data?.products || [];
        setRecommendations(recList);
      })
      .catch((err) => {
        console.error('Failed to load recommendations:', err);
      })
      .finally(() => {
        if (isMounted) setLoadingRecs(false);
      });

    return () => {
      isMounted = false;
    };
  }, [wishlistProducts]);

  return (
    <div className="wishlist-page">
      <Header />

      <main className="wishlist-main">
        <div className="wishlist-hero">
          <div className="wishlist-container">
            <nav className="wishlist-breadcrumb" aria-label="Breadcrumb">
              <Link to="/">Trang chủ</Link>
              <span className="breadcrumb-separator">/</span>
              <span className="breadcrumb-current">Sản phẩm yêu thích</span>
            </nav>
            <div className="wishlist-title-wrap">
              <h1 className="wishlist-title">
                Sản phẩm yêu thích
                <span className="wishlist-badge-count">{wishlistCount}</span>
              </h1>
              <p className="wishlist-subtitle">
                Lưu giữ những bộ trang phục bạn yêu thích nhất để dễ dàng theo dõi và mua sắm bất cứ khi nào.
              </p>
            </div>
          </div>
        </div>

        <section className="wishlist-section">
          <div className="wishlist-container">
            {isLoading ? (
              <div className="wishlist-loading-state">
                <div className="wishlist-spinner" />
                <p>Đang tải danh sách yêu thích của bạn...</p>
              </div>
            ) : wishlistProducts.length === 0 ? (
              <div className="wishlist-empty-card">
                <div className="wishlist-empty-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                </div>
                <h2>Chưa có sản phẩm yêu thích nào</h2>
                <p>
                  Hãy nhấn vào biểu tượng trái tim ở các sản phẩm bạn quan tâm để lưu vào danh sách yêu thích và nhận thông báo khi có ưu đãi đặc biệt!
                </p>
                <Link to="/products" className="wishlist-cta-btn">
                  Khám phá bộ sưu tập thời trang
                </Link>
              </div>
            ) : (
              <div className="wishlist-grid">
                {wishlistProducts.map((product) => (
                  <ProductCard key={product._id || product.id} product={product} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Section Gợi ý sản phẩm tương đương */}
        <section className="wishlist-recommendations-section">
          <div className="wishlist-container">
            <div className="section-header-compact">
              <div>
                <span className="section-tag">DÀNH RIÊNG CHO BẠN</span>
                <h2 className="section-title">Gợi ý sản phẩm tương đương</h2>
                <p className="section-desc">
                  Dựa trên các sản phẩm bạn yêu thích, chúng tôi đề xuất những lựa chọn tương tự phù hợp phong cách của bạn.
                </p>
              </div>
              <Link to="/products" className="view-more-link">
                Xem tất cả sản phẩm &rarr;
              </Link>
            </div>

            {loadingRecs ? (
              <div className="recs-loading">
                <div className="wishlist-spinner" />
              </div>
            ) : recommendations.length > 0 ? (
              <div className="wishlist-grid">
                {recommendations.slice(0, 8).map((product) => (
                  <ProductCard key={product._id || product.id} product={product} />
                ))}
              </div>
            ) : (
              <p className="no-recs-text">Đang cập nhật các gợi ý thời trang phù hợp nhất...</p>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

export default Wishlist;
