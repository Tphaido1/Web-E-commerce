import { useRef } from 'react';
import { useCart } from '../../context/CartContext.jsx';
import { formatCurrency } from '../../utils/currency.js';

function CartItem({ item, disabled = false }) {
  const { updateQuantity, removeItem, isMutating } = useCart();
  const operationRef = useRef(false);
  const controlsDisabled = disabled || isMutating;
  const runMutation = async (operation) => {
    if (controlsDisabled || operationRef.current) return;
    operationRef.current = true;
    try { await operation(); } finally { operationRef.current = false; }
  };

  return (
    <article className="cart-item">
      <div className="cart-item-image"><img src={item.image} alt={item.name} /></div>
      <div className="cart-item-content">
        <div className="cart-item-heading"><div><p>{item.category || 'Sản phẩm'}</p><h2>{item.name}</h2>{(item.color || item.size || item.sku) && <p className="cart-item-variant">{[item.color, item.size, item.sku && `SKU: ${item.sku}`].filter(Boolean).join(' · ')}</p>}</div><button type="button" className="cart-remove" disabled={controlsDisabled} onClick={() => runMutation(() => removeItem(item.id))} aria-label={`Xóa ${item.name}`} title={`Xóa ${item.name}`}>×</button></div>
        <strong>{formatCurrency(item.price)}</strong>
        <div className="cart-item-footer"><div className="quantity-control" role="group" aria-label={`Số lượng ${item.name}`}><button type="button" onClick={() => runMutation(() => updateQuantity(item.id, item.quantity - 1))} disabled={controlsDisabled || item.quantity <= 1} aria-label={`Giảm số lượng ${item.name}`}>-</button><output aria-live="polite" aria-label={`Số lượng ${item.quantity}`}>{item.quantity}</output><button type="button" onClick={() => runMutation(() => updateQuantity(item.id, item.quantity + 1))} disabled={controlsDisabled || (item.stock !== undefined && item.quantity >= item.stock)} aria-label={`Tăng số lượng ${item.name}`}>+</button></div><strong>{formatCurrency(item.price * item.quantity)}</strong></div>
      </div>
    </article>
  );
}

export default CartItem;