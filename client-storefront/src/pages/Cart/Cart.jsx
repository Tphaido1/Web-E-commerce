import { Link } from 'react-router-dom';
import Header from '../../components/Header/Header.jsx';
import Footer from '../../components/Footer/Footer.jsx';
import CartItem from '../../components/CartItem/CartItem.jsx';
import CartSummary from '../../components/CartSummary/CartSummary.jsx';
import { useCart } from '../../context/CartContext.jsx';
import './Cart.css';

function Cart() {
  const { items, error, errorAnnounced, status, clearCart, reloadCart } = useCart();
  return (
    <div className="storefront-page">
      <Header />
      <main className="cart-page">
        <div className="cart-page-heading"><p className="section-kicker">NovaMart</p><h1>Giỏ hàng</h1></div>
        {error && <div className="cart-page-error" role={errorAnnounced ? undefined : 'alert'}><p>{error}</p><button type="button" onClick={reloadCart}>Thử tải lại</button></div>}
        {status === 'loading' ? (
          <section className="cart-page-empty" role="status"><h2>Đang tải giỏ hàng...</h2></section>
        ) : items.length === 0 ? (
          <section className="cart-page-empty" aria-live="polite">
            <h2>{status === 'error' ? 'Không thể tải giỏ hàng.' : 'Giỏ hàng của bạn đang trống.'}</h2>
            <p>{status === 'offline' ? 'Giỏ hàng ngoại tuyến hiện chưa có món hàng đã lưu.' : 'Thêm sản phẩm yêu thích để bắt đầu mua sắm.'}</p>
            {status === 'error'
              ? <button className="cart-checkout-button" type="button" onClick={reloadCart}>Thử lại</button>
              : <Link className="cart-checkout-button" to="/products">Tiếp tục mua sắm</Link>}
          </section>
        ) : (
          <div className="cart-page-layout">
            <section className="cart-page-items" aria-label="Các sản phẩm trong giỏ hàng">
              <button className="cart-clear-button" type="button" onClick={clearCart}>Xóa toàn bộ giỏ hàng</button>
              {items.map((item) => <CartItem item={item} key={item.id} />)}
            </section>
            <aside className="cart-page-summary" aria-label="Tóm tắt đơn hàng">
              <h2>Tóm tắt đơn hàng</h2>
              <CartSummary />
            </aside>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

export default Cart;
