import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext.jsx';
import { getAuthSession, subscribeAuthSession } from '../../services/authSession.js';
import { logout } from '../../services/authService.js';
import CartDrawer from '../CartDrawer/CartDrawer.jsx';
import './Header.css';

function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [session, setSession] = useState(getAuthSession);
  const [logoutError, setLogoutError] = useState('');
  const menuButtonRef = useRef(null);
  const { totalQuantity } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState(() => new URLSearchParams(location.search).get('search') || '');

  const closeMenu = () => setIsMenuOpen(false);

  useEffect(() => subscribeAuthSession(setSession), []);
  useEffect(() => {
    if (!isMenuOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      setIsMenuOpen(false);
      menuButtonRef.current?.focus();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [isMenuOpen]);
  useEffect(() => {
    setSearch(location.pathname === '/products' ? new URLSearchParams(location.search).get('search') || '' : '');
  }, [location.pathname, location.search]);

  const submitSearch = (event) => {
    event.preventDefault();
    const params = new URLSearchParams();
    const query = search.trim();
    if (query) params.set('search', query);
    navigate({ pathname: '/products', search: params.toString() ? `?${params}` : '' });
    closeMenu();
  };

  const handleLogout = async () => {
    setLogoutError('');
    try {
      await logout();
      if (!getAuthSession()) navigate('/', { replace: true });
    } catch (error) {
      setLogoutError(error.message);
    }
    closeMenu();
  };

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" to="/" onClick={closeMenu}>
          <span className="brand-mark">N</span>
          <span>NovaMart</span>
        </Link>

        <button
          ref={menuButtonRef}
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
          <Link to="/track-order" onClick={closeMenu}>Tra cứu đơn hàng</Link>
          <Link to="/#categories" onClick={closeMenu}>Danh mục</Link>
          <div className="mobile-account-controls">
            {session ? (
              <>
                <Link to="/my-orders" onClick={closeMenu}>Đơn hàng của tôi</Link>
                <button type="button" onClick={handleLogout}>Đăng xuất</button>
              </>
            ) : <Link to="/login" onClick={closeMenu}>Tài khoản</Link>}
          </div>
        </nav>

        <div className="header-actions">
          <form className="search-box" role="search" onSubmit={submitSearch}>
            <span className="search-icon" aria-hidden="true">⌕</span>
            <input type="search" placeholder="Tìm sản phẩm" aria-label="Tìm sản phẩm" value={search} onChange={(event) => setSearch(event.target.value)} />
            <button className="header-search-submit" type="submit" aria-label="Tìm kiếm">↵</button>
          </form>
          {session ? (
            <>
              <span className="account-name" title={session.user?.email}>{session.user?.email || 'Tài khoản'}</span>
              <Link className="account-link" to="/my-orders" onClick={closeMenu}>Đơn hàng</Link>
              <button className="account-link" type="button" onClick={handleLogout}>Đăng xuất</button>
            </>
          ) : (
            <Link className="account-link" to="/login" onClick={closeMenu}>Tài khoản</Link>
          )}
          <button className="cart-link" type="button" onClick={() => setIsCartOpen(true)} aria-label={`Giỏ hàng, ${totalQuantity} sản phẩm`} aria-haspopup="dialog" aria-expanded={isCartOpen} aria-controls="cart-dialog">
            <span className="cart-icon" aria-hidden="true">🛒</span>
            <span className="cart-badge">{totalQuantity}</span>
          </button>
        </div>
      </div>
      {logoutError && <p className="header-auth-error" role="alert">{logoutError}</p>}
      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </header>
  );
}

export default Header;