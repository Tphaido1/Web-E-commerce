import { Link } from 'react-router-dom';
import { useCart } from '../../context/CartContext.jsx';
import { formatCurrency } from '../../utils/currency.js';

function CartSummary({ compact = false }) {
  const { subtotal, totalQuantity } = useCart();
  return (
    <div className={`cart-summary ${compact ? 'is-compact' : ''}`}>
      <div><span>Số lượng</span><strong>{totalQuantity} sản phẩm</strong></div>
      <div><span>Tạm tính</span><strong>{formatCurrency(subtotal)}</strong></div>
      {!compact && <Link className="cart-checkout-button" to="/checkout">Tiến hành thanh toán</Link>}
    </div>
  );
}

export default CartSummary;