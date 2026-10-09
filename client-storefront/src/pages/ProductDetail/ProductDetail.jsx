import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Header from '../../components/Header/Header.jsx';
import Footer from '../../components/Footer/Footer.jsx';
import ProductReviews from '../../components/ProductReviews/ProductReviews.jsx';
import RelatedProducts from '../../components/RelatedProducts/RelatedProducts.jsx';
import { useCart } from '../../context/CartContext.jsx';
import { getProductById } from '../../services/productService.js';
import { formatCurrency, PRODUCT_PLACEHOLDER_IMAGE, resolveProductPrice } from '../../utils/currency.js';
import './ProductDetail.css';

function uniqueValues(variants, key) {
  return [...new Set(variants.map((variant) => variant[key]).filter(Boolean))];
}

function ProductDetail() {
  const { id } = useParams();
  const { addItem, error: cartError, errorAnnounced } = useCart();
  const [product, setProduct] = useState(null);
  const [isShowingCachedProduct, setIsShowingCachedProduct] = useState(false);
  const [status, setStatus] = useState('loading');
  const [loadedRouteId, setLoadedRouteId] = useState(id);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [selectedColor, setSelectedColor] = useState('');
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedSku, setSelectedSku] = useState('');
  const [imageIndex, setImageIndex] = useState(0);
  const [quantity, setQuantity] = useState('1');
  const [selectionError, setSelectionError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let isCurrent = true;
    async function loadProduct() {
      setLoadedRouteId(id);
      setStatus('loading');
      setError('');
      setProduct(null);
      try {
        const result = await getProductById(id, { signal: controller.signal });
        if (!isCurrent) return;
        setProduct(result.product);
        setIsShowingCachedProduct(result.isCached);
        setSelectedColor('');
        setSelectedSize('');
        setSelectedSku('');
        setImageIndex(0);
        setQuantity('1');
        setStatus('ready');
      } catch (requestError) {
        if (!isCurrent || requestError.name === 'CanceledError') return;
        if (requestError.response?.status === 404) {
          setStatus('not-found');
        } else {
          setError(requestError.offlineCacheMiss
            ? 'Bạn đang ngoại tuyến và sản phẩm này chưa được lưu trên thiết bị. Kết nối mạng để mở sản phẩm.'
            : requestError.response?.data?.message || requestError.message || 'Không thể tải sản phẩm.');
          setStatus('error');
        }
      }
    }
    loadProduct();
    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [id, retryCount]);

  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const currentStatus = loadedRouteId === id ? status : 'loading';
  const colors = useMemo(() => uniqueValues(variants, 'color'), [variants]);
  const sizes = useMemo(() => uniqueValues(variants, 'size'), [variants]);
  const hasVariants = variants.length > 0;
  const hasDimensions = colors.length > 0 || sizes.length > 0;
  const selectedVariant = hasDimensions
    ? variants.find((variant) => (
      (!colors.length || variant.color === selectedColor)
      && (!sizes.length || variant.size === selectedSize)
    )) || null
    : variants.find((variant) => variant.sku === selectedSku) || null;
  const images = product?.images?.length ? product.images : [product?.image || PRODUCT_PLACEHOLDER_IMAGE];
  const price = resolveProductPrice(product, selectedVariant);
  const stock = Number(selectedVariant?.stock ?? product?.stock);
  const quantityNumber = Number(quantity);
  const variantReady = !hasVariants || Boolean(selectedVariant);
  const canPurchase = variantReady && Number.isFinite(price) && Number.isFinite(stock) && stock > 0
    && Number.isInteger(quantityNumber) && quantityNumber > 0 && quantityNumber <= stock;

  const addToCart = async () => {
    setSelectionError('');
    if (!variantReady) {
      setSelectionError('Vui lòng chọn đầy đủ thuộc tính sản phẩm.');
      return;
    }
    if (!Number.isInteger(quantityNumber) || quantityNumber < 1) {
      setSelectionError('Vui lòng nhập số lượng là số nguyên lớn hơn 0.');
      return;
    }
    if (!Number.isFinite(stock) || stock < 1) {
      setSelectionError('Biến thể này hiện đã hết hàng.');
      return;
    }
    if (quantityNumber > stock) {
      setSelectionError(`Chỉ còn ${stock} sản phẩm có sẵn.`);
      return;
    }
    if (!selectedVariant && hasVariants) {
      setSelectionError('Vui lòng chọn một biến thể có SKU.');
      return;
    }
    await addItem(product, { variant: selectedVariant, quantity: quantityNumber });
  };

  return (
    <div className="storefront-page">
      <Header />
      <main className="product-detail-page">
        {currentStatus === 'loading' && <div className="product-detail-state" role="status"><div className="product-detail-skeleton" /><p>Đang tải thông tin sản phẩm...</p></div>}
        {currentStatus === 'error' && <section className="product-detail-state state-box" role="alert"><h1>Không thể tải sản phẩm.</h1><p>{error}</p><button type="button" onClick={() => setRetryCount((current) => current + 1)}>Thử lại</button></section>}
        {currentStatus === 'not-found' && <section className="product-detail-state state-box"><h1>Không tìm thấy sản phẩm.</h1><p>Sản phẩm có thể đã bị xóa hoặc không còn được bán.</p><Link to="/products">Quay lại sản phẩm</Link></section>}
        {currentStatus === 'ready' && product && (
          <>
            {isShowingCachedProduct && <p className="cached-data-notice" role="status">Đang xem thông tin sản phẩm đã lưu trước đó; giá và tình trạng còn hàng có thể đã thay đổi.</p>}
            <nav className="product-detail-breadcrumb" aria-label="Đường dẫn"><Link to="/products">Sản phẩm</Link><span aria-hidden="true">/</span><span>{product.name}</span></nav>
            <section className="product-detail-layout">
              <div className="product-detail-gallery">
                <div className="product-detail-main-image"><img src={images[imageIndex]} alt={product.name} /></div>
                {images.length > 1 && <div className="product-detail-thumbnails" aria-label="Ảnh sản phẩm">{images.map((image, index) => <button className={imageIndex === index ? 'is-selected' : ''} type="button" key={`${image}-${index}`} onClick={() => setImageIndex(index)} aria-label={`Xem ảnh ${index + 1}`} aria-pressed={imageIndex === index}><img src={image} alt="" /></button>)}</div>}
              </div>
              <div className="product-detail-info">
                <p className="section-kicker">{product.category || 'NovaMart'}</p>
                <h1>{product.name}</h1>
                <p className="product-detail-price">{price !== undefined ? formatCurrency(price) : 'Liên hệ'}</p>
                {product.description && <p className="product-detail-description">{product.description}</p>}
                {hasVariants && hasDimensions && (
                  <div className="product-variant-fields">
                    {colors.length > 0 && <label>Màu sắc<select value={selectedColor} onChange={(event) => { setSelectedColor(event.target.value); setSelectionError(''); }}><option value="">Chọn màu sắc</option>{colors.map((color) => <option key={color} value={color}>{color}</option>)}</select></label>}
                    {sizes.length > 0 && <label>Kích cỡ<select value={selectedSize} onChange={(event) => { setSelectedSize(event.target.value); setSelectionError(''); }}><option value="">Chọn kích cỡ</option>{sizes.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>}
                  </div>
                )}
                {hasVariants && !hasDimensions && <label className="product-variant-sku">Biến thể<select value={selectedSku} onChange={(event) => { setSelectedSku(event.target.value); setSelectionError(''); }}><option value="">Chọn biến thể</option>{variants.map((variant) => <option key={variant._id || variant.sku} value={variant.sku} disabled={Number(variant.stock) < 1}>{variant.sku} — {formatCurrency(resolveProductPrice(product, variant))} — Còn {variant.stock}</option>)}</select></label>}
                {hasVariants && selectedVariant && <div className="product-variant-meta">{selectedVariant.sku && <span>SKU: {selectedVariant.sku}</span>}<span>{stock > 0 ? `Còn ${stock} sản phẩm` : 'Hết hàng'}</span></div>}
                {!hasVariants && <p className="product-variant-meta">{stock > 0 ? `Còn ${stock} sản phẩm` : 'Hết hàng'}</p>}
                <label className="product-detail-quantity">Số lượng<input type="number" min="1" max={Number.isFinite(stock) ? stock : undefined} step="1" value={quantity} onChange={(event) => { setQuantity(event.target.value); setSelectionError(''); }} /></label>
                <button className="product-detail-add" type="button" onClick={addToCart} disabled={!canPurchase}>Thêm vào giỏ hàng</button>
                {(selectionError || cartError) && <p className="product-detail-error" role={selectionError || !errorAnnounced ? 'alert' : undefined}>{selectionError || cartError}</p>}
              </div>
            </section>
            <RelatedProducts key={product._id || product.id} product={product} />
            <ProductReviews productId={product._id || product.id} productName={product.name} />
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}

export default ProductDetail;
