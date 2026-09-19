import { Link } from 'react-router-dom';
import { useCart } from '../../context/CartContext.jsx';
import { formatCurrency, PRODUCT_PLACEHOLDER_IMAGE } from '../../utils/currency.js';

function ProductCard({ product }) {
  const { addItem } = useCart();
  const image = product.image || product.images?.[0] || PRODUCT_PLACEHOLDER_IMAGE;
  const price = Number(product.price ?? product.salePrice);
  const originalPrice = product.originalPrice ?? product.compareAtPrice;

  return (
    <article className="product-card">
      <div className="product-image-wrap"><img src={image} alt={product.name || 'Sản phẩm'} /></div>
      <div className="product-card-body">
        <p className="product-category">{product.category?.name || product.category || 'Sản phẩm'}</p>
        <h2>{product.name || product.title || 'Sản phẩm chưa có tên'}</h2>
        <div className="product-prices"><strong>{formatCurrency(price)}</strong>{originalPrice && <del>{formatCurrency(originalPrice)}</del>}</div>
        <div className="product-card-actions"><Link className="product-link" to={`/products/${product.id || product._id || ''}`}>Xem chi tiết <span aria-hidden="true">-&gt;</span></Link><button type="button" className="product-add-button" disabled={!Number.isFinite(price)} onClick={() => addItem(product)}>Thêm vào giỏ</button></div>
      </div>
    </article>
  );
}

export default ProductCard;