import { Link } from 'react-router-dom';
import { useCart } from '../../context/CartContext.jsx';
import CartItem from '../CartItem/CartItem.jsx';
import CartSummary from '../CartSummary/CartSummary.jsx';
import './CartDrawer.css';

function CartDrawer({ isOpen, onClose }) {
  const { items, error } = useCart();
  if (!isOpen) return null;

  return (
    <div className="cart-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-drawer-title" onClick={(event) => event.stopPropagation()}>
        <div className="cart-drawer-heading"><div><p className="section-kicker">NovaMart</p><h2 id="cart-drawer-title">Giỏ hàng</h2></div><button type="button" className="drawer-close" onClick={onClose} aria-label="Đóng giỏ hàng">×</button></div>
        {error && <p className="cart-error" role="alert">{error}</p>}
        {items.length === 0 ? <div className="cart-empty"><p>Giỏ hàng của bạn đang trống.</p><Link className="cart-continue-button" to="/products" onClick={onClose}>Tiếp tục mua sắm</Link></div> : <><div className="cart-drawer-items">{items.map((item) => <CartItem item={item} key={item.id} />)}</div><CartSummary compact /><div className="cart-drawer-actions"><Link className="cart-view-button" to="/cart" onClick={onClose}>Xem giỏ hàng</Link><Link className="cart-checkout-button" to="/checkout" onClick={onClose}>Thanh toán</Link></div></>}
      </aside>
    </div>
  );
}

export default CartDrawer;