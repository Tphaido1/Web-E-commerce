import { useCart } from '../../context/CartContext.jsx';
import { formatCurrency } from '../../utils/currency.js';

function CartItem({ item }) {
  const { updateQuantity, removeItem } = useCart();

  return (
    <article className="cart-item">
      <div className="cart-item-image"><img src={item.image} alt={item.name} /></div>
      <div className="cart-item-content">
        <div className="cart-item-heading"><div><p>{item.category || 'Sản phẩm'}</p><h2>{item.name}</h2></div><button type="button" className="cart-remove" onClick={() => removeItem(item.id)} aria-label={`Xóa ${item.name}`}>×</button></div>
        <strong>{formatCurrency(item.price)}</strong>
        <div className="cart-item-footer"><div className="quantity-control"><button type="button" onClick={() => updateQuantity(item.id, item.quantity - 1)} disabled={item.quantity <= 1} aria-label={`Giảm số lượng ${item.name}`}>-</button><span aria-label={`Số lượng ${item.quantity}`}>{item.quantity}</span><button type="button" onClick={() => updateQuantity(item.id, item.quantity + 1)} aria-label={`Tăng số lượng ${item.name}`}>+</button></div><strong>{formatCurrency(item.price * item.quantity)}</strong></div>
      </div>
    </article>
  );
}

export default CartItem;