import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../../components/Header/Header.jsx';
import BannerCarousel from '../../components/BannerCarousel/BannerCarousel.jsx';
import Footer from '../../components/Footer/Footer.jsx';
import ProductCard from '../../components/ProductCard/ProductCard.jsx';
import { getProducts } from '../../services/productService.js';
import { getCategories } from '../../services/categoryService.js';
import './Home.css';

// Cam kết thương hiệu cho shop thời trang
const trustFeatures = [
  {
    icon: '🚚',
    title: 'Giao hàng hỏa tốc',
    desc: 'Freeship đơn từ 300K, nhận hàng trong 2-3 ngày',
  },
  {
    icon: '🔄',
    title: 'Đổi hàng 7 ngày',
    desc: 'Hỗ trợ đổi size tận nơi nhanh chóng, dễ dàng',
  },
  {
    icon: '✨',
    title: 'Chất liệu cao cấp',
    desc: 'Cotton compact & sợi tự nhiên mềm mát, bền màu',
  },
  {
    icon: '💬',
    title: 'Tư vấn phối đồ 24/7',
    desc: 'Đội ngũ stylist hỗ trợ chọn size chuẩn từng dáng người',
  },
];

// Fallback images cho danh mục
const categoryImages = {
  'ao-thun-polo': 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=700&q=80',
  'ao-so-mi': 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=700&q=80',
  'quan-jean-kaki': 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=700&q=80',
  'ao-khoac-hoodie': 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=700&q=80',
  'vay-dam': 'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?auto=format&fit=crop&w=700&q=80',
};

function Home() {
  const [bestSellers, setBestSellers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isCurrent = true;
    const controller = new AbortController();

    async function loadHomeData() {
      setLoading(true);
      setError('');
      try {
        const [prodRes, catRes] = await Promise.allSettled([
          getProducts({ limit: 8, sort: 'bestseller' }, { signal: controller.signal }),
          getCategories({ signal: controller.signal }),
        ]);

        if (!isCurrent) return;

        if (prodRes.status === 'fulfilled') {
          setBestSellers(prodRes.value.products || []);
        } else {
          console.warn('Lỗi tải sản phẩm bán chạy:', prodRes.reason);
        }

        if (catRes.status === 'fulfilled') {
          setCategories(catRes.value || []);
        } else {
          console.warn('Lỗi tải danh mục sản phẩm:', catRes.reason);
        }
      } catch (err) {
        if (isCurrent) {
          setError('Không thể nạp dữ liệu trang chủ. Vui lòng thử lại sau.');
        }
      } finally {
        if (isCurrent) {
          setLoading(false);
        }
      }
    }

    loadHomeData();

    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, []);

  return (
    <div className="storefront-page" id="home">
      <Header />
      <main>
        {/* Banner Carousel chính */}
        <BannerCarousel />

        {/* Cam kết & Giá trị gia tăng */}
        <section className="home-trust-section" aria-label="Cam kết dịch vụ">
          <div className="home-container">
            <div className="home-trust-grid">
              {trustFeatures.map((feat) => (
                <div className="home-trust-item" key={feat.title}>
                  <span className="home-trust-icon" aria-hidden="true">{feat.icon}</span>
                  <div>
                    <h3 className="home-trust-title">{feat.title}</h3>
                    <p className="home-trust-desc">{feat.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SẢN PHẨM BÁN CHẠY (BEST SELLERS) */}
        <section className="best-sellers-section" id="products">
          <div className="home-container">
            <div className="section-heading">
              <div>
                <p className="section-kicker">🔥 XU HƯỚNG MỚI NHẤT</p>
                <h2>Sản phẩm bán chạy</h2>
                <p className="section-subtext">
                  Những mẫu trang phục được yêu thích và đặt may nhiều nhất tại Nova Fashion
                </p>
              </div>
              <Link className="section-view-all" to="/products">
                Xem tất cả sản phẩm <span aria-hidden="true">-&gt;</span>
              </Link>
            </div>

            {loading ? (
              <div className="home-state-box" role="status">
                <div className="home-spinner" />
                <p>Đang tổng hợp các mẫu bán chạy nhất...</p>
              </div>
            ) : error && bestSellers.length === 0 ? (
              <div className="home-state-box" role="alert">
                <p>{error}</p>
                <button type="button" onClick={() => window.location.reload()}>Tải lại trang</button>
              </div>
            ) : (
              <div className="best-sellers-grid">
                {bestSellers.map((product) => (
                  <ProductCard key={product._id || product.id} product={product} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* DANH MỤC THỜI TRANG & LINK TỚI TRANG /categories */}
        <section className="home-categories-section">
          <div className="home-container">
            <div className="section-heading">
              <div>
                <p className="section-kicker">KHÁM PHÁ THEO PHONG CÁCH</p>
                <h2>Danh mục thời trang</h2>
                <p className="section-subtext">
                  Đa dạng mẫu mã từ áo thun, sơ mi thanh lịch đến quần âu, jean và áo khoác thời thượng
                </p>
              </div>
              <Link className="section-view-all" to="/categories">
                Xem tất cả danh mục ({categories.length}) <span aria-hidden="true">-&gt;</span>
              </Link>
            </div>

            <div className="home-category-grid">
              {categories.map((cat) => {
                const img = cat.image || categoryImages[cat.slug] || 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=700&q=80';
                const count = cat.productCount ?? 0;
                const linkUrl = `/products?category=${encodeURIComponent(cat.name)}`;

                return (
                  <Link
                    key={cat._id || cat.slug}
                    to={linkUrl}
                    className="home-cat-card"
                  >
                    <div className="home-cat-img-wrap">
                      <img src={img} alt={cat.name} loading="lazy" />
                      <span className="home-cat-count">👗 {count} sản phẩm</span>
                    </div>
                    <div className="home-cat-content">
                      <h3 className="home-cat-name">{cat.name}</h3>
                      <p className="home-cat-desc">
                        {cat.description || 'Chất vải chọn lọc, đường may chuẩn form dáng.'}
                      </p>
                      <span className="home-cat-link">
                        Xem các mẫu <span aria-hidden="true">-&gt;</span>
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Banner kêu gọi hành động chuyển sang trang Danh mục hoàn chỉnh */}
            <div className="category-cta-banner">
              <div className="category-cta-text">
                <span className="category-cta-tag">TRANG CHUYÊN BIỆT</span>
                <h3>Tra cứu chi tiết từng danh mục sản phẩm</h3>
                <p>
                  Xem danh sách đầy đủ tất cả danh mục kèm số lượng tồn kho và sản phẩm hiện có tại shop.
                </p>
              </div>
              <Link to="/categories" className="category-cta-button">
                Xem toàn bộ danh mục &amp; số lượng <span aria-hidden="true">&rarr;</span>
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

export default Home;