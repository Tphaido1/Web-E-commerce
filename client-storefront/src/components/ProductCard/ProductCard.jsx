import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../../context/CartContext.jsx';
import { useWishlist } from '../../context/WishlistContext.jsx';
import { formatCurrency, PRODUCT_PLACEHOLDER_IMAGE, resolveProductPrice } from '../../utils/currency.js';
import './ProductCard.css';

function ProductCard({ product }) {
  const { addItem, error, errorAnnounced } = useCart();
  const { isWishlisted, toggleWishlist } = useWishlist();
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

  const liked = isWishlisted(productId);

  const handleAdd = async () => {
    setShowAddError(false);
    if (!(await addItem(product))) setShowAddError(true);
  };

  const handleToggleLike = (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleWishlist(product);
  };

  return (
    <article className="product-card">
      <div className="product-image-container">
        <Link className="product-image-wrap" to={productUrl}>
          <img loading="lazy" decoding="async" src={image} alt={product.name || 'Sản phẩm'} />
        </Link>
        <button
          type="button"
          className={`product-wishlist-btn ${liked ? 'is-liked' : ''}`}
          onClick={handleToggleLike}
          aria-label={liked ? 'Bỏ thích sản phẩm' : 'Thêm vào yêu thích'}
          title={liked ? 'Bỏ yêu thích' : 'Yêu thích sản phẩm'}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill={liked ? '#b84b39' : 'none'}
            stroke={liked ? '#b84b39' : 'currentColor'}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
      </div>

      <div className="product-card-body">
        <p className="product-category">{product.category?.name || product.category || 'Sản phẩm'}</p>
        <h2>
          <Link className="product-title-link" to={productUrl}>
            {product.name || product.title || 'Sản phẩm chưa có tên'}
          </Link>
        </h2>
        <div className="product-prices">
          <strong>{formatCurrency(price)}</strong>
          {originalPrice && <del>{formatCurrency(originalPrice)}</del>}
          {originalPrice && (
            <span className="product-discount">
              {discountPercent > 0 ? `Giảm ${discountPercent}%` : 'Giảm giá'}
            </span>
          )}
        </div>
        <p className={`product-availability${isOutOfStock ? ' is-out-of-stock' : ''}`}>
          {isAvailable ? 'Còn hàng' : isOutOfStock ? 'Hết hàng' : 'Xem tình trạng còn hàng'}
        </p>
        <div className="product-card-actions">
          <Link className="product-link" to={productUrl}>
            Xem chi tiết <span aria-hidden="true">-&gt;</span>
          </Link>
          <button
            type="button"
            className="product-add-button"
            disabled={hasVariants || !Number.isFinite(price) || !Number.isFinite(stock) || stock < 1}
            onClick={handleAdd}
          >
            {hasVariants ? 'Chọn biến thể' : 'Thêm vào giỏ'}
          </button>
          {showAddError && error && (
            <p className="product-add-error" role={errorAnnounced ? undefined : 'alert'}>
              {error}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

export default ProductCard;
