import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../../components/Header/Header.jsx';
import Footer from '../../components/Footer/Footer.jsx';
import { getCategories } from '../../services/categoryService.js';
import './Categories.css';

// Fallback images theo từng nhóm sản phẩm thời trang
const categoryImages = {
  'ao-thun-polo': 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=700&q=80',
  'ao-so-mi': 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=700&q=80',
  'quan-jean-kaki': 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=700&q=80',
  'ao-khoac-hoodie': 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=700&q=80',
  'vay-dam': 'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?auto=format&fit=crop&w=700&q=80',
};

function Categories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isCurrent = true;
    const controller = new AbortController();

    async function fetchCategories() {
      setLoading(true);
      setError('');
      try {
        const data = await getCategories({ signal: controller.signal });
        if (isCurrent) {
          setCategories(data);
        }
      } catch (err) {
        if (isCurrent) {
          setError('Không thể nạp danh mục sản phẩm. Vui lòng thử lại sau.');
        }
      } finally {
        if (isCurrent) {
          setLoading(false);
        }
      }
    }

    fetchCategories();

    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, []);

  const totalProducts = categories.reduce((sum, cat) => sum + (cat.productCount || 0), 0);

  return (
    <div className="storefront-page" id="categories-page">
      <Header />
      <main className="categories-main">
        <section className="categories-hero">
          <div className="categories-hero-container">
            <nav className="breadcrumb" aria-label="Đường dẫn">
              <Link to="/">Trang chủ</Link>
              <span aria-hidden="true">/</span>
              <span>Danh mục sản phẩm</span>
            </nav>
            <p className="section-kicker">PHÂN LOẠI THỜI TRANG</p>
            <h1 className="categories-page-title">Tất Cả Danh Mục Sản Phẩm</h1>
            <p className="categories-page-subtitle">
              Khám phá toàn bộ {categories.length > 0 ? categories.length : '5'} nhóm trang phục và bộ sưu tập được thiết kế tinh tế của Nova Fashion.
            </p>
            {!loading && (
              <div className="categories-summary-bar">
                <div className="summary-pill">
                  <strong>{categories.length}</strong> Phân loại
                </div>
                <div className="summary-pill">
                  <strong>{totalProducts}</strong> Tổng sản phẩm hiện có
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="categories-content-container">
          {loading && (
            <div className="categories-loading" role="status">
              <div className="loading-spinner" />
              <p>Đang tải danh mục thời trang...</p>
            </div>
          )}

          {error && (
            <div className="categories-error-box" role="alert">
              <p>{error}</p>
              <button type="button" onClick={() => window.location.reload()}>Tải lại</button>
            </div>
          )}

          {!loading && !error && (
            <div className="categories-grid-cards">
              {categories.map((cat) => {
                const img = cat.image || categoryImages[cat.slug] || 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=700&q=80';
                const count = cat.productCount ?? 0;
                const linkUrl = `/products?category=${encodeURIComponent(cat.name)}`;

                return (
                  <article className="cat-card" key={cat._id || cat.slug}>
                    <Link to={linkUrl} className="cat-card-img-wrap" tabIndex={-1}>
                      <img src={img} alt={cat.name} loading="lazy" />
                      <span className="cat-card-count-badge">
                        👗 {count} sản phẩm
                      </span>
                    </Link>
                    <div className="cat-card-body">
                      <div className="cat-card-header">
                        <h2 className="cat-card-title">
                          <Link to={linkUrl}>{cat.name}</Link>
                        </h2>
                        <span className="cat-card-number">{count} SP</span>
                      </div>
                      <p className="cat-card-desc">
                        {cat.description || `Khám phá các mẫu ${cat.name.toLowerCase()} phong cách thời thượng, phom dáng chuẩn.`}
                      </p>
                      <Link to={linkUrl} className="cat-card-explore-btn">
                        Xem sản phẩm ({count}) <span aria-hidden="true">&rarr;</span>
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}

export default Categories;
