import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext.jsx';
import { useWishlist } from '../../context/WishlistContext.jsx';
import { getAuthSession, subscribeAuthSession } from '../../services/authSession.js';
import { logout } from '../../services/authService.js';
import CartDrawer from '../CartDrawer/CartDrawer.jsx';
import './Header.css';

function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isFashionExpanded, setIsFashionExpanded] = useState(true);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isHotlineOpen, setIsHotlineOpen] = useState(false);
  const [session, setSession] = useState(getAuthSession);
  const [logoutError, setLogoutError] = useState('');
  const { wishlistCount } = useWishlist();

  const hoverTimeoutRef = useRef(null);
  const accountMenuRef = useRef(null);
  const hotlineRef = useRef(null);
  const searchInputRef = useRef(null);

  const { totalQuantity } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState(() => new URLSearchParams(location.search).get('search') || '');

  // Đăng ký phiên xác thực
  useEffect(() => subscribeAuthSession(setSession), []);

  // Đồng bộ ô tìm kiếm với URL
  useEffect(() => {
    setSearch(location.pathname === '/products' ? new URLSearchParams(location.search).get('search') || '' : '');
  }, [location.pathname, location.search]);

  // Đóng drawer và popups khi phím Escape được nhấn
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
        setIsAccountMenuOpen(false);
        setIsHotlineOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Đóng account menu & hotline khi click ra ngoài
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target)) {
        setIsAccountMenuOpen(false);
      }
      if (hotlineRef.current && !hotlineRef.current.contains(event.target)) {
        setIsHotlineOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Xử lý mở/đóng menu khi hover hoặc click
  const handleMenuHoverEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsMenuOpen(true);
  };

  const handleMenuHoverLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setIsMenuOpen(false);
    }, 250);
  };

  const toggleMenu = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsMenuOpen((prev) => !prev);
  };

  const closeMenu = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsMenuOpen(false);
  };

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
      setIsAccountMenuOpen(false);
      if (!getAuthSession()) navigate('/', { replace: true });
    } catch (error) {
      setLogoutError(error.message);
    }
    closeMenu();
  };

  return (
    <>
      <header className="elise-header">
        <div className="elise-header-inner">
          {/* 1. KHỐI TRÁI: NÚT MENU HAMBURGER & LOGO THƯƠNG HIỆU */}
          <div className="elise-header-left">
            <button
              className="elise-menu-trigger"
              type="button"
              aria-label={isMenuOpen ? 'Đóng menu' : 'Mở menu điều hướng'}
              aria-expanded={isMenuOpen}
              onClick={toggleMenu}
              onMouseEnter={handleMenuHoverEnter}
              onMouseLeave={handleMenuHoverLeave}
            >
              <svg className="elise-hamburger-icon" width="24" height="18" viewBox="0 0 24 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="1" y1="2" x2="23" y2="2" />
                <line x1="1" y1="9" x2="23" y2="9" />
                <line x1="1" y1="16" x2="23" y2="16" />
              </svg>
            </button>

            <Link className="elise-brand" to="/" onClick={closeMenu}>
              {/* Biểu tượng 2 vòng tròn lồng nhau sang trọng như mẫu Elise */}
              <svg className="elise-brand-rings" width="34" height="24" viewBox="0 0 36 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="13" cy="12" r="9" />
                <circle cx="23" cy="12" r="9" />
              </svg>
              <span className="elise-brand-text">NOVA FASHION</span>
            </Link>
          </div>

          {/* 2. KHỐI GIỮA: THANH TÌM KIẾM TỐI GIẢN (TÌM KIẾM ________ 🔍) */}
          <div className="elise-header-center">
            <form className="elise-search-form" role="search" onSubmit={submitSearch}>
              <label htmlFor="elise-search-input" className="elise-search-label">TÌM KIẾM</label>
              <div className="elise-search-input-wrap">
                <input
                  id="elise-search-input"
                  ref={searchInputRef}
                  type="search"
                  placeholder=""
                  aria-label="Tìm kiếm sản phẩm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button type="submit" className="elise-search-btn" aria-label="Tìm kiếm">
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </button>
              </div>
            </form>
          </div>

          {/* 3. KHỐI PHẢI: GỌI NGAY - TÀI KHOẢN - GIỎ HÀNG - YÊU THÍCH */}
          <div className="elise-header-right">
            {/* Nút Gọi Ngay */}
            <div className="elise-action-item" ref={hotlineRef}>
              <button
                type="button"
                className="elise-action-btn elise-hotline-btn"
                onClick={() => setIsHotlineOpen((prev) => !prev)}
                title="Hotline hỗ trợ: 1900 6369"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                <span className="elise-action-text">Gọi Ngay</span>
              </button>
              {isHotlineOpen && (
                <div className="elise-popover elise-hotline-popover">
                  <p className="popover-title">Hỗ trợ khách hàng</p>
                  <a href="tel:19006369" className="popover-phone">1900 6369</a>
                  <p className="popover-time">8:00 - 21:30 (Thứ 2 - Chủ Nhật)</p>
                </div>
              )}
            </div>

            {/* Nút Tài Khoản */}
            <div className="elise-action-item" ref={accountMenuRef}>
              {session ? (
                <button
                  type="button"
                  className="elise-action-btn elise-account-btn"
                  onClick={() => setIsAccountMenuOpen((prev) => !prev)}
                >
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <span className="elise-action-text">Tài Khoản</span>
                </button>
              ) : (
                <Link to="/login" className="elise-action-btn elise-account-btn" onClick={closeMenu}>
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <span className="elise-action-text">Tài Khoản</span>
                </Link>
              )}

              {isAccountMenuOpen && session && (
                <div className="elise-popover elise-account-popover">
                  <div className="account-popover-info">
                    <strong>Xin chào!</strong>
                    <span>{session.user?.email || session.user?.name || 'Khách hàng'}</span>
                  </div>
                  <Link to="/profile" onClick={() => setIsAccountMenuOpen(false)}>Thông tin cá nhân</Link>
                  <Link to="/wishlist" onClick={() => setIsAccountMenuOpen(false)}>Sản phẩm yêu thích ({wishlistCount})</Link>
                  <Link to="/my-orders" onClick={() => setIsAccountMenuOpen(false)}>Đơn hàng của tôi</Link>
                  <button type="button" onClick={handleLogout}>Đăng xuất</button>
                </div>
              )}
            </div>

            {/* Nút Giỏ Hàng (Icon túi xách có số lượng) */}
            <button
              className="elise-action-btn elise-cart-btn"
              type="button"
              onClick={() => setIsCartOpen(true)}
              aria-label={`Giỏ hàng, ${totalQuantity} sản phẩm`}
            >
              <div className="elise-icon-badge-wrap">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <path d="M16 10a4 4 0 0 1-8 0" />
                </svg>
                <span className="elise-badge">{totalQuantity}</span>
              </div>
            </button>

            {/* Nút Yêu Thích (Icon trái tim) */}
            <Link
              to="/wishlist"
              className="elise-action-btn elise-wishlist-btn"
              title="Danh sách yêu thích"
              onClick={closeMenu}
            >
              <div className="elise-icon-badge-wrap">
                <svg width="20" height="20" viewBox="0 0 24 24" fill={wishlistCount > 0 ? '#b84b39' : 'none'} stroke={wishlistCount > 0 ? '#b84b39' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
                <span className="elise-badge">{wishlistCount}</span>
              </div>
            </Link>
          </div>
        </div>

        {logoutError && <p className="elise-auth-error">{logoutError}</p>}
      </header>

      {/* 4. MENU DRAWER DỌC TRƯỢT TỪ TRÁI RA (HÌNH 1) */}
      {createPortal(
        <div
          className={`elise-drawer-backdrop ${isMenuOpen ? 'is-visible' : ''}`}
          onClick={closeMenu}
        >
          <aside
            className={`elise-side-drawer ${isMenuOpen ? 'is-open' : ''}`}
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={handleMenuHoverEnter}
            onMouseLeave={handleMenuHoverLeave}
            aria-label="Menu điều hướng chính"
          >
            {/* Top drawer: Logo + Nút Đóng '✕' */}
            <div className="elise-drawer-header">
              <Link to="/" className="elise-drawer-brand" onClick={closeMenu}>
                <svg width="32" height="22" viewBox="0 0 36 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="13" cy="12" r="9" />
                  <circle cx="23" cy="12" r="9" />
                </svg>
                <span>NOVA FASHION</span>
              </Link>
              <button
                type="button"
                className="elise-drawer-close"
                onClick={closeMenu}
                aria-label="Đóng menu"
              >
                ✕
              </button>
            </div>

            {/* Danh sách mục menu kiểu thời trang cao cấp */}
            <nav className="elise-drawer-nav">
              <ul className="elise-menu-list">
                <li className="elise-menu-item">
                  <Link to="/#products" onClick={closeMenu}>SẢN PHẨM BÁN CHẠY</Link>
                </li>

                {/* Mục THỜI TRANG NỮ & NAM có danh mục con (Accordion) */}
                <li className={`elise-menu-item has-sub ${isFashionExpanded ? 'expanded' : ''}`}>
                  <div
                    className="elise-sub-header"
                    role="button"
                    tabIndex={0}
                    onClick={() => setIsFashionExpanded((prev) => !prev)}
                    onKeyDown={(e) => e.key === 'Enter' && setIsFashionExpanded((prev) => !prev)}
                  >
                    <span>THỜI TRANG</span>
                    <span className="elise-chevron" aria-hidden="true">
                      {isFashionExpanded ? '▾' : '▸'}
                    </span>
                  </div>

                  {isFashionExpanded && (
                    <ul className="elise-sub-menu">
                      <li>
                        <Link to="/products?category=Váy%20%26%20Đầm" onClick={closeMenu}>ĐẦM &amp; VÁY</Link>
                      </li>
                      <li>
                        <Link to="/products?category=Áo%20thun%20%26%20Polo" onClick={closeMenu}>ÁO THUN &amp; POLO</Link>
                      </li>
                      <li>
                        <Link to="/products?category=Áo%20sơ%20mi" onClick={closeMenu}>ÁO SƠ MI</Link>
                      </li>
                      <li>
                        <Link to="/products?category=Quần%20Jean%20%26%20Kaki" onClick={closeMenu}>QUẦN JEAN &amp; KAKI</Link>
                      </li>
                      <li>
                        <Link to="/products?category=Áo%20khoác%20%26%20Hoodie" onClick={closeMenu}>ÁO KHOÁC &amp; HOODIE</Link>
                      </li>
                    </ul>
                  )}
                </li>

                <li className="elise-menu-item">
                  <Link to="/categories" onClick={closeMenu} className="highlight-categories">
                    <span>TẤT CẢ DANH MỤC</span>
                    <span className="arrow-right" aria-hidden="true">&gt;</span>
                  </Link>
                </li>
                <li className="elise-menu-item">
                  <Link to="/products" onClick={closeMenu} className="sale-item">
                    <span>GIẢM GIÁ ĐẾN 50%</span>
                    <span className="arrow-right" aria-hidden="true">&gt;</span>
                  </Link>
                </li>
                <li className="elise-menu-item">
                  <Link to="/track-order" onClick={closeMenu}>TRA CỨU ĐƠN HÀNG</Link>
                </li>
                {session ? (
                  <li className="elise-menu-item">
                    <Link to="/my-orders" onClick={closeMenu}>ĐƠN HÀNG CỦA TÔI</Link>
                  </li>
                ) : (
                  <li className="elise-menu-item">
                    <Link to="/login" onClick={closeMenu}>ĐĂNG NHẬP / ĐĂNG KÝ</Link>
                  </li>
                )}
                <li className="elise-menu-item">
                  <a href="tel:19006369" onClick={closeMenu}>HỆ THỐNG CỬA HÀNG &amp; HOTLINE</a>
                </li>
              </ul>
            </nav>

            {/* Footer chân trang trong Drawer: Mạng xã hội giống hình 1 */}
            <div className="elise-drawer-footer">
              <div className="elise-social-links">
                <a href="https://facebook.com" target="_blank" rel="noreferrer">f FACEBOOK</a>
                <a href="https://instagram.com" target="_blank" rel="noreferrer">📷 INSTAGRAM</a>
                <a href="https://youtube.com" target="_blank" rel="noreferrer">▶ YOUTUBE</a>
                <a href="https://tiktok.com" target="_blank" rel="noreferrer">🎵 TIKTOK</a>
                <a href="https://zalo.me" target="_blank" rel="noreferrer">💬 ZALO</a>
              </div>
            </div>
          </aside>
        </div>,
        document.body
      )}

      {/* Cart Drawer */}
      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </>
  );
}

export default Header;