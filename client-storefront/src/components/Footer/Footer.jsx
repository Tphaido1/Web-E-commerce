import './Footer.css';
import { Link } from 'react-router-dom';

function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div className="footer-intro">
          <Link className="brand footer-brand" to="/">
            <span className="brand-mark">N</span>
            <span>NovaMart</span>
          </Link>
          <p>Những lựa chọn đẹp và hữu ích cho một cuộc sống có gu.</p>
        </div>
        <div>
          <h2>Khám phá</h2>
          <Link to="/">Trang chủ</Link>
          <Link to="/products">Sản phẩm</Link>
          <a href="#categories">Danh mục</a>
        </div>
        <div>
          <h2>Hỗ trợ</h2>
          <a href="#policy">Chính sách</a>
          <a href="#contact">Liên hệ</a>
          <a href="#shipping">Giao hàng</a>
        </div>
        <div className="footer-contact">
          <h2>Liên hệ</h2>
          <a href="mailto:hello@novamart.vn">hello@novamart.vn</a>
          <a href="tel:19001234">1900 1234</a>
          <span>Thứ 2 - Chủ nhật, 9:00 - 21:00</span>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© 2026 NovaMart. All rights reserved.</span>
        <span>Made for everyday living.</span>
      </div>
    </footer>
  );
}

export default Footer;