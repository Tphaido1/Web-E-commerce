import Header from '../../components/Header/Header.jsx';
import BannerCarousel from '../../components/BannerCarousel/BannerCarousel.jsx';
import Footer from '../../components/Footer/Footer.jsx';
import { Link } from 'react-router-dom';
import './Home.css';

const collections = [
  { name: 'Thời trang', detail: 'Mới mỗi tuần', tone: 'sage' },
  { name: 'Đồ gia dụng', detail: 'Cho căn nhà có gu', tone: 'sand' },
  { name: 'Phụ kiện', detail: 'Điểm nhấn vừa đủ', tone: 'rose' },
];

function Home() {
  return (
    <div className="storefront-page" id="home">
      <Header />
      <main>
        <BannerCarousel />
        <section className="collection-section" id="products">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Chọn theo cảm hứng</p>
              <h2>Sản phẩm nổi bật</h2>
            </div>
            <Link to="/products">Xem tất cả <span aria-hidden="true">-&gt;</span></Link>
          </div>
          <div className="collection-grid" id="categories">
            {collections.map((collection) => (
              <Link className={`collection-card ${collection.tone}`} to="/products" key={collection.name}>
                <span>{collection.detail}</span>
                <h3>{collection.name}</h3>
                <span className="card-arrow" aria-hidden="true">-&gt;</span>
              </Link>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

export default Home;