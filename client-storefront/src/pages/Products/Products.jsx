import { useEffect, useState } from 'react';
import Header from '../../components/Header/Header.jsx';
import Footer from '../../components/Footer/Footer.jsx';
import ProductCard from '../../components/ProductCard/ProductCard.jsx';
import FilterPanel from '../../components/FilterPanel/FilterPanel.jsx';
import { getProducts } from '../../services/productService.js';
import './Products.css';

const emptyFilters = { category: '', minPrice: '', maxPrice: '', sort: '' };
const categories = ['Thời trang', 'Đồ gia dụng', 'Phụ kiện'];

function Products() {
  const [products, setProducts] = useState([]);
  const [filters, setFilters] = useState(emptyFilters);
  const [draftFilters, setDraftFilters] = useState(emptyFilters);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    const loadProducts = async () => {
      setStatus('loading');
      setError('');
      try {
        const result = await getProducts({ search: search || undefined, ...filters, page });
        if (!isCurrent) return;
        setProducts(result.products);
        setPagination(result.pagination);
        setStatus(result.products.length ? 'ready' : 'empty');
      } catch (requestError) {
        if (!isCurrent) return;
        setError(requestError.response?.data?.message || 'Không thể tải danh sách sản phẩm. Vui lòng thử lại.');
        setStatus('error');
      }
    };
    loadProducts();
    return () => { isCurrent = false; };
  }, [search, filters, page, retryCount]);

  const changeFilter = (key, value) => setDraftFilters((current) => ({ ...current, [key]: value }));
  const applyFilters = () => { setFilters(draftFilters); setPage(1); setIsDrawerOpen(false); };
  const resetFilters = () => { setFilters(emptyFilters); setDraftFilters(emptyFilters); setSearch(''); setPage(1); setIsDrawerOpen(false); };
  const submitSearch = (event) => { event.preventDefault(); setPage(1); setSearch(event.currentTarget.elements.search.value.trim()); };

  return (
    <div className="storefront-page">
      <Header />
      <main className="products-page">
        <div className="products-heading"><div><p className="section-kicker">Khám phá NovaMart</p><h1>Sản phẩm</h1><p>Những lựa chọn được chọn lọc cho cuộc sống mỗi ngày.</p></div><button className="mobile-filter-button" type="button" onClick={() => setIsDrawerOpen(true)}>Bộ lọc</button></div>
        <div className="products-layout">
          <aside className="desktop-filter"><FilterPanel filters={draftFilters} categories={categories} onChange={changeFilter} onApply={applyFilters} onReset={resetFilters} /></aside>
          <section className="product-results" aria-live="polite">
            <form className="products-search" onSubmit={submitSearch}><input name="search" defaultValue={search} placeholder="Tìm theo tên sản phẩm" aria-label="Tìm theo tên sản phẩm" /><button type="submit">Tìm kiếm</button></form>
            {status === 'loading' && <div className="product-grid loading-grid">{[1, 2, 3, 4].map((item) => <div className="product-skeleton" key={item} />)}</div>}
            {status === 'error' && <div className="state-box"><h2>Không thể tải danh sách sản phẩm.</h2><p>{error}</p><button type="button" onClick={() => setRetryCount((current) => current + 1)}>Thử lại</button></div>}
            {status === 'empty' && <div className="state-box"><h2>Không tìm thấy sản phẩm phù hợp.</h2><button type="button" onClick={resetFilters}>Xóa bộ lọc</button></div>}
            {status === 'ready' && <><div className="product-grid">{products.map((product) => <ProductCard product={product} key={product.id || product._id || product.name} />)}</div>{pagination?.totalPages > 1 && <div className="pagination"><button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>&lt;</button><span>{page} / {pagination.totalPages}</span><button type="button" disabled={page >= pagination.totalPages} onClick={() => setPage((current) => current + 1)}>&gt;</button></div>}</>}
          </section>
        </div>
      </main>
      <Footer />
      {isDrawerOpen && <div className="drawer-backdrop" role="presentation" onClick={() => setIsDrawerOpen(false)}><aside className="filter-drawer" role="dialog" aria-modal="true" aria-label="Bộ lọc sản phẩm" onClick={(event) => event.stopPropagation()}><FilterPanel isDrawer filters={draftFilters} categories={categories} onChange={changeFilter} onApply={applyFilters} onReset={resetFilters} onClose={() => setIsDrawerOpen(false)} /></aside></div>}
    </div>
  );
}

export default Products;