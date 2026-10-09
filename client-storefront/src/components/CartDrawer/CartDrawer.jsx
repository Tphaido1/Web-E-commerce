import { Link } from 'react-router-dom';
import { useCart } from '../../context/CartContext.jsx';
import CartItem from '../CartItem/CartItem.jsx';
import CartSummary from '../CartSummary/CartSummary.jsx';
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog.js';
import './CartDrawer.css';

function CartDrawer({ isOpen, onClose }) {
  const { items, error, errorAnnounced, status, reloadCart } = useCart();
  const dialogRef = useAccessibleDialog(isOpen, onClose);
  if (!isOpen) return null;

  return (
    <div className="cart-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside ref={dialogRef} id="cart-dialog" className="cart-drawer" role="dialog" tabIndex={-1} aria-modal="true" aria-labelledby="cart-drawer-title" onClick={(event) => event.stopPropagation()}>
        <div className="cart-drawer-heading"><div><p className="section-kicker">NovaMart</p><h2 id="cart-drawer-title">Giỏ hàng</h2></div><button type="button" className="drawer-close" onClick={onClose} aria-label="Đóng giỏ hàng">×</button></div>
        {error && <p className="cart-error" role={errorAnnounced ? undefined : 'alert'}>{error}<button type="button" onClick={reloadCart}>Tải lại giỏ hàng</button></p>}
        {status === 'loading' && <div className="cart-empty" role="status"><p>Đang tải giỏ hàng...</p></div>}
        {status !== 'loading' && items.length === 0 ? <div className="cart-empty"><p>{status === 'error' ? 'Không thể tải giỏ hàng.' : 'Giỏ hàng của bạn đang trống.'}</p>{status === 'error' ? <button className="cart-view-button" type="button" onClick={reloadCart}>Thử lại</button> : <Link className="cart-continue-button" to="/products" onClick={onClose}>Tiếp tục mua sắm</Link>}</div> : status !== 'loading' && <><div className="cart-drawer-items">{items.map((item) => <CartItem item={item} key={item.id} />)}</div><CartSummary compact /><div className="cart-drawer-actions"><Link className="cart-view-button" to="/cart" onClick={onClose}>Xem giỏ hàng</Link><Link className="cart-checkout-button" to="/checkout" onClick={onClose}>Thanh toán</Link></div></>}
      </aside>
    </div>
  );
}

export default CartDrawer;
