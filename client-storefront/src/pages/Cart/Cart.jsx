import { Link } from 'react-router-dom';
import Header from '../../components/Header/Header.jsx';
import Footer from '../../components/Footer/Footer.jsx';
import CartItem from '../../components/CartItem/CartItem.jsx';
import CartSummary from '../../components/CartSummary/CartSummary.jsx';
import { useCart } from '../../context/CartContext.jsx';
import './Cart.css';

function Cart() {
  const { items } = useCart();
  return <div className="storefront-page"><Header /><main className="cart-page"><div className="cart-page-heading"><p className="section-kicker">NovaMart</p><h1>Giỏ hàng</h1></div>{items.length === 0 ? <section className="cart-page-empty"><h2>Giỏ hàng của bạn đang trống.</h2><p>Thêm sản phẩm yêu thích để bắt đầu mua sắm.</p><Link className="cart-checkout-button" to="/products">Tiếp tục mua sắm</Link></section> : <div className="cart-page-layout"><section className="cart-page-items">{items.map((item) => <CartItem item={item} key={item.id} />)}</section><aside className="cart-page-summary"><h2>Tóm tắt đơn hàng</h2><CartSummary /></aside></div>}</main><Footer /></div>;
}

export default Cart;