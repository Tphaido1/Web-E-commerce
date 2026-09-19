import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../../context/CartContext.jsx';
import CartDrawer from '../CartDrawer/CartDrawer.jsx';
import './Header.css';

function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const { totalQuantity } = useCart();

  const closeMenu = () => setIsMenuOpen(false);

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" to="/" onClick={closeMenu}>
          <span className="brand-mark">N</span>
          <span>NovaMart</span>
        </Link>

        <button
          className="menu-toggle"
          type="button"
          aria-label={isMenuOpen ? 'Đóng menu' : 'Mở menu'}
          aria-expanded={isMenuOpen}
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>

        <nav className={`main-nav ${isMenuOpen ? 'is-open' : ''}`} aria-label="Điều hướng chính">
          <Link to="/" onClick={closeMenu}>Trang chủ</Link>
          <Link to="/products" onClick={closeMenu}>Sản phẩm</Link>
          <a href="#categories" onClick={closeMenu}>Danh mục</a>
        </nav>

        <div className="header-actions">
          <label className="search-box">
            <span className="search-icon" aria-hidden="true">⌕</span>
            <input type="search" placeholder="Tìm sản phẩm" aria-label="Tìm sản phẩm" />
          </label>
          <Link className="account-link" to="/login" onClick={closeMenu}>Tài khoản</Link>
          <button className="cart-link" type="button" onClick={() => setIsCartOpen(true)} aria-label={`Giỏ hàng, ${totalQuantity} sản phẩm`}>
            <span className="cart-icon" aria-hidden="true">🛒</span>
            <span className="cart-badge">{totalQuantity}</span>
          </button>
        </div>
      </div>
      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </header>
  );
}

export default Header;