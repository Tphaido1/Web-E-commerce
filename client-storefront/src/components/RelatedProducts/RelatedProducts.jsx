import { useEffect, useState } from 'react';
import ProductCard from '../ProductCard/ProductCard.jsx';
import { getRelatedProducts } from '../../services/productService.js';
import './RelatedProducts.css';

function RelatedProducts({ product }) {
  const productId = String(product?._id || product?.id || '');
  const category = typeof product?.category === 'string' ? product.category.trim() : '';
  const requestKey = JSON.stringify([productId, category]);
  const [retryCount, setRetryCount] = useState(0);
  const [result, setResult] = useState({ key: '', status: 'loading', products: [], isCached: false });

  useEffect(() => {
    if (!productId || !category) return undefined;
    const controller = new AbortController();
    let isCurrent = true;
    setResult({ key: requestKey, status: 'loading', products: [], isCached: false });

    async function loadRelatedProducts() {
      try {
        const response = await getRelatedProducts(product, { signal: controller.signal });
        if (!isCurrent || controller.signal.aborted) return;
        setResult({ key: requestKey, status: 'ready', ...response });
      } catch (error) {
        if (!isCurrent || controller.signal.aborted || error.name === 'CanceledError'
          || error.name === 'AbortError' || error.code === 'ERR_CANCELED') return;
        setResult({ key: requestKey, status: 'error', products: [], isCached: false });
      }
    }

    loadRelatedProducts();
    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [productId, category, requestKey, retryCount]);

  // Hide the previous product's suggestions even before its effect cleanup runs.
  const currentResult = result.key === requestKey ? result : { status: 'loading', products: [] };
  if (!productId || !category || (currentResult.status === 'ready' && !currentResult.products.length)) return null;

  return (
    <section className="related-products" aria-labelledby="related-products-heading">
      <h2 id="related-products-heading">Sản phẩm cùng loại</h2>
      {currentResult.status === 'loading' && (
        <div role="status" aria-label="Đang tải sản phẩm cùng loại">
          <div className="related-products-grid" aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => <div className="related-product-skeleton" key={index}><div /><span /><span /></div>)}
          </div>
        </div>
      )}
      {currentResult.status === 'error' && (
        <div className="related-products-error">
          <p>Chưa thể tải sản phẩm cùng loại.</p>
          <button type="button" onClick={() => setRetryCount((count) => count + 1)}>Thử lại</button>
        </div>
      )}
      {currentResult.status === 'ready' && (
        <>
          {currentResult.isCached && <p className="cached-data-notice" role="status">Đang xem sản phẩm cùng loại đã lưu trước đó; giá và tình trạng còn hàng có thể đã thay đổi.</p>}
          <div className="related-products-grid">
            {currentResult.products.map((entry) => <ProductCard key={entry._id || entry.id} product={entry} />)}
          </div>
        </>
      )}
    </section>
  );
}

export default RelatedProducts;
