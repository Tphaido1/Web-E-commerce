import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../../context/CartContext.jsx';
import { formatCurrency, PRODUCT_PLACEHOLDER_IMAGE, resolveProductPrice } from '../../utils/currency.js';
import './ProductCard.css';

function ProductCard({ product }) {
  const { addItem, error, errorAnnounced } = useCart();
  const [showAddError, setShowAddError] = useState(false);
  const image = product.image || product.images?.[0] || PRODUCT_PLACEHOLDER_IMAGE;
  const price = resolveProductPrice(product);
  const originalPrice = [product.originalPrice, product.compareAtPrice, product.price]
    .map(Number).find((value) => Number.isFinite(value) && value > price);
  const discountPercent = originalPrice ? Math.round((1 - price / originalPrice) * 100) : 0;
  const productId = product._id || product.id;
  const productUrl = productId ? `/products/${encodeURIComponent(productId)}` : '/products';
  const hasVariants = Array.isArray(product.variants) && product.variants.length > 0;
  const stock = Number(product.stock);
  const stockValues = (hasVariants ? product.variants.map((variant) => variant.stock) : [product.stock])
    .map((value) => value === null || value === undefined || value === '' ? NaN : Number(value));
  const isAvailable = stockValues.some((value) => Number.isFinite(value) && value > 0);
  const isOutOfStock = stockValues.every((value) => Number.isFinite(value) && value <= 0);
  const handleAdd = async () => {
    setShowAddError(false);
    if (!(await addItem(product))) setShowAddError(true);
  };

  return (
    <article className="product-card">
      <Link className="product-image-wrap" to={productUrl}><img loading="lazy" decoding="async" src={image} alt={product.name || 'Sản phẩm'} /></Link>
      <div className="product-card-body">
        <p className="product-category">{product.category?.name || product.category || 'Sản phẩm'}</p>
        <h2><Link className="product-title-link" to={productUrl}>{product.name || product.title || 'Sản phẩm chưa có tên'}</Link></h2>
        <div className="product-prices"><strong>{formatCurrency(price)}</strong>{originalPrice && <del>{formatCurrency(originalPrice)}</del>}{originalPrice && <span className="product-discount">{discountPercent > 0 ? `Giảm ${discountPercent}%` : 'Giảm giá'}</span>}</div>
        <p className={`product-availability${isOutOfStock ? ' is-out-of-stock' : ''}`}>{isAvailable ? 'Còn hàng' : isOutOfStock ? 'Hết hàng' : 'Xem tình trạng còn hàng'}</p>
        <div className="product-card-actions"><Link className="product-link" to={productUrl}>Xem chi tiết <span aria-hidden="true">-&gt;</span></Link><button type="button" className="product-add-button" disabled={hasVariants || !Number.isFinite(price) || !Number.isFinite(stock) || stock < 1} onClick={handleAdd}>{hasVariants ? 'Chọn biến thể' : 'Thêm vào giỏ'}</button>{showAddError && error && <p className="product-add-error" role={errorAnnounced ? undefined : 'alert'}>{error}</p>}</div>
      </div>
    </article>
  );
}

export default ProductCard;
