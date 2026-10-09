import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Header from '../../components/Header/Header.jsx';
import Footer from '../../components/Footer/Footer.jsx';
import ProductCard from '../../components/ProductCard/ProductCard.jsx';
import FilterPanel from '../../components/FilterPanel/FilterPanel.jsx';
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog.js';
import { getProductCategories, getProducts } from '../../services/productService.js';
import './Products.css';

const FILTER_KEYS = ['search', 'category', 'minPrice', 'maxPrice', 'sort', 'page'];
const SORT_OPTIONS = new Set(['', 'price_asc', 'price_desc']);
const emptyFilters = { category: '', minPrice: '', maxPrice: '', sort: '' };

function readPage(value) {
  const page = Number.parseInt(value || '1', 10);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function setDiscoveryParams(current, updates) {
  const next = new URLSearchParams(current);
  for (const key of FILTER_KEYS) {
    const value = updates[key];
    if (value === undefined || value === '') next.delete(key);
    else next.set(key, String(value));
  }
  return next;
}

function getPriceRangeError({ minPrice, maxPrice }) {
  const min = minPrice === '' ? null : Number(minPrice);
  const max = maxPrice === '' ? null : Number(maxPrice);
  if ((min !== null && (!Number.isFinite(min) || min < 0)) || (max !== null && (!Number.isFinite(max) || max < 0))) {
    return 'Giá phải là số không âm.';
  }
  if (min !== null && max !== null && min > max) {
    return 'Giá tối thiểu không thể lớn hơn giá tối đa.';
  }
  return '';
}

function Products() {
  const [searchParams, setSearchParams] = useSearchParams();
  const locationKey = searchParams.toString();
  const query = useMemo(() => new URLSearchParams(locationKey), [locationKey]);
  const search = query.get('search') || '';
  const page = readPage(query.get('page'));
  const filters = {
    category: query.get('category') || '',
    minPrice: query.get('minPrice') || '',
    maxPrice: query.get('maxPrice') || '',
    sort: SORT_OPTIONS.has(query.get('sort') || '') ? query.get('sort') || '' : '',
  };

  const [products, setProducts] = useState([]);
  const [isShowingCachedProducts, setIsShowingCachedProducts] = useState(false);
  const [draftFilters, setDraftFilters] = useState(filters);
  const [searchDraft, setSearchDraft] = useState(search);
  const [categories, setCategories] = useState([]);
  const [categoryStatus, setCategoryStatus] = useState('loading');
  const [categoryError, setCategoryError] = useState('');
  const [categoryRetry, setCategoryRetry] = useState(0);
  const [pagination, setPagination] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const filterButtonRef = useRef(null);
  const filterDialogRef = useAccessibleDialog(isDrawerOpen, () => setIsDrawerOpen(false));
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [validationError, setValidationError] = useState('');
  const appliedValidationError = getPriceRangeError(filters);

  useEffect(() => {
    const next = new URLSearchParams(locationKey);
    let changed = false;
    const rawSort = next.get('sort') || '';
    if (!SORT_OPTIONS.has(rawSort)) {
      next.delete('sort');
      changed = true;
    }
    const rawPage = next.get('page');
    if (rawPage && (!/^[1-9]\d*$/.test(rawPage) || !Number.isSafeInteger(Number(rawPage)))) {
      next.delete('page');
      changed = true;
    }
    if (changed) setSearchParams(next, { replace: true });
  }, [locationKey, setSearchParams]);

  useEffect(() => {
    setDraftFilters(filters);
    setSearchDraft(search);
    setValidationError('');
  }, [locationKey]);

  useEffect(() => {
    const controller = new AbortController();
    let isCurrent = true;
    async function loadCategories() {
      setCategoryStatus('loading');
      setCategoryError('');
      try {
        const result = await getProductCategories({ signal: controller.signal });
        if (!isCurrent) return;
        setCategories(result);
        setCategoryStatus('ready');
      } catch (requestError) {
        if (!isCurrent || requestError.name === 'CanceledError') return;
        setCategoryError(requestError.response?.data?.message || requestError.message || 'Không thể tải danh mục.');
        setCategoryStatus('error');
      }
    }
    loadCategories();
    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [categoryRetry]);

  useEffect(() => {
    const controller = new AbortController();
    let isCurrent = true;
    async function loadProducts() {
      setStatus('loading');
      setError('');
      const rangeError = getPriceRangeError(filters);
      if (rangeError) {
        setError(rangeError);
        setStatus('error');
        return;
      }
      const params = {
        page,
        limit: 12,
        ...(search.trim() && { search: search.trim() }),
        ...(filters.category && { category: filters.category }),
        ...(filters.minPrice !== '' && { minPrice: filters.minPrice }),
        ...(filters.maxPrice !== '' && { maxPrice: filters.maxPrice }),
        ...(filters.sort && { sort: filters.sort }),
      };
      try {
        const result = await getProducts(params, { signal: controller.signal });
        if (!isCurrent) return;
        setProducts(result.products);
        setIsShowingCachedProducts(result.isCached);
        setPagination(result.pagination);
        setStatus(result.products.length ? 'ready' : 'empty');
      } catch (requestError) {
        if (!isCurrent || requestError.name === 'CanceledError') return;
        setProducts([]);
        setIsShowingCachedProducts(false);
        setError(requestError.offlineCacheMiss
          ? 'Bạn đang ngoại tuyến và chưa có bản lưu của bộ lọc này. Hãy kết nối mạng để tải sản phẩm.'
          : requestError.response?.data?.message || requestError.message || 'Không thể tải danh sách sản phẩm. Vui lòng thử lại.');
        setStatus('error');
      }
    }
    loadProducts();
    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [locationKey, retryCount]);

  const updateDiscovery = useCallback((updates) => {
    setSearchParams((current) => setDiscoveryParams(current, updates));
  }, [setSearchParams]);

  const changeFilter = (key, value) => {
    setDraftFilters((current) => ({ ...current, [key]: value }));
    setValidationError('');
  };

  const validateFilters = () => {
    const rangeError = getPriceRangeError(draftFilters);
    if (rangeError) {
      setValidationError(rangeError);
      return false;
    }
    if (!SORT_OPTIONS.has(draftFilters.sort)) {
      setValidationError('Vui lòng chọn cách sắp xếp hợp lệ.');
      return false;
    }
    setValidationError('');
    return true;
  };

  const applyFilters = () => {
    if (!validateFilters()) return;
    updateDiscovery({ ...draftFilters, search, page: '' });
    setIsDrawerOpen(false);
  };

  const resetFilters = () => {
    setDraftFilters(emptyFilters);
    setSearchDraft('');
    setValidationError('');
    updateDiscovery({ ...emptyFilters, search: '', page: '' });
    setIsDrawerOpen(false);
  };

  const submitSearch = (event) => {
    event.preventDefault();
    updateDiscovery({
      ...filters,
      search: searchDraft.trim(),
      page: '',
    });
  };

  const updatePage = (nextPage) => updateDiscovery({ ...filters, search, page: nextPage });
  const panelProps = {
    filters: draftFilters,
    categories: categoryStatus === 'ready' ? categories : [],
    onChange: changeFilter,
    onApply: applyFilters,
    onReset: resetFilters,
    validationError: validationError || appliedValidationError,
    categoryError,
    categoryStatus,
    onRetryCategories: () => setCategoryRetry((current) => current + 1),
  };

  return (
    <div className="storefront-page">
      <Header />
      <main className="products-page">
        <div className="products-heading"><div><p className="section-kicker">Khám phá NovaMart</p><h1>Sản phẩm</h1><p>Những lựa chọn được chọn lọc cho cuộc sống mỗi ngày.</p></div><button ref={filterButtonRef} className="mobile-filter-button" type="button" aria-haspopup="dialog" aria-expanded={isDrawerOpen} aria-controls="filter-dialog" onClick={() => setIsDrawerOpen(true)}>Bộ lọc</button></div>
        <div className="products-layout">
          <aside className="desktop-filter"><FilterPanel {...panelProps} /></aside>
          <section className="product-results" aria-live="polite">
            <form className="products-search" onSubmit={submitSearch}><input name="search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Tìm theo tên sản phẩm" aria-label="Tìm theo tên sản phẩm" /><button type="submit">Tìm kiếm</button></form>
            {status === 'loading' && <div className="product-grid loading-grid">{[1, 2, 3, 4].map((item) => <div className="product-skeleton" key={item} />)}</div>}
            {status === 'error' && <div className="state-box" role="alert"><h2>Không thể tải danh sách sản phẩm.</h2><p>{error}</p><button type="button" onClick={() => setRetryCount((current) => current + 1)}>Thử lại</button></div>}
            {status === 'empty' && <div className="state-box"><h2>Không tìm thấy sản phẩm phù hợp.</h2><button type="button" onClick={resetFilters}>Xóa bộ lọc</button></div>}
            {status === 'ready' && <>{isShowingCachedProducts && <p className="cached-data-notice" role="status">Đang xem dữ liệu sản phẩm đã lưu lúc bạn truy cập trước đó; giá và tình trạng còn hàng có thể đã thay đổi.</p>}<div className="product-grid">{products.map((product) => <ProductCard product={product} key={product.id || product._id || product.name} />)}</div>{pagination?.totalPages > 1 && <div className="pagination"><button type="button" disabled={page <= 1} onClick={() => updatePage(page - 1)}>&lt;</button><span>{page} / {pagination.totalPages}</span><button type="button" disabled={page >= pagination.totalPages} onClick={() => updatePage(page + 1)}>&gt;</button></div>}</>}
          </section>
        </div>
      </main>
      <Footer />
      {isDrawerOpen && <div className="drawer-backdrop" role="presentation" onClick={() => setIsDrawerOpen(false)}><aside ref={filterDialogRef} id="filter-dialog" className="filter-drawer" role="dialog" tabIndex={-1} aria-modal="true" aria-labelledby="filter-dialog-title" onClick={(event) => event.stopPropagation()}><FilterPanel {...panelProps} isDrawer onClose={() => setIsDrawerOpen(false)} /></aside></div>}
    </div>
  );
}

export default Products;
