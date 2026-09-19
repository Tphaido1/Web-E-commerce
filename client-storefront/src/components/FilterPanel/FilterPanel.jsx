function FilterPanel({ filters, categories, onChange, onApply, onReset, onClose, isDrawer = false }) {
  return (
    <div className={isDrawer ? 'filter-drawer-content' : 'filter-panel-content'}>
      <div className="filter-heading"><h2>Bộ lọc</h2>{isDrawer && <button type="button" className="drawer-close" onClick={onClose} aria-label="Đóng bộ lọc">×</button>}</div>
      <label className="filter-field">Danh mục
        <select value={filters.category} onChange={(event) => onChange('category', event.target.value)}><option value="">Tất cả danh mục</option>{categories.map((category) => <option value={category} key={category}>{category}</option>)}</select>
      </label>
      <div className="filter-price"><span>Khoảng giá</span><div><input type="number" min="0" placeholder="Từ" value={filters.minPrice} onChange={(event) => onChange('minPrice', event.target.value)} /><input type="number" min="0" placeholder="Đến" value={filters.maxPrice} onChange={(event) => onChange('maxPrice', event.target.value)} /></div></div>
      <label className="filter-field">Sắp xếp
        <select value={filters.sort} onChange={(event) => onChange('sort', event.target.value)}><option value="">Mặc định</option><option value="price_asc">Giá tăng dần</option><option value="price_desc">Giá giảm dần</option></select>
      </label>
      <div className="filter-actions"><button type="button" className="filter-apply" onClick={onApply}>Áp dụng</button><button type="button" className="filter-reset" onClick={onReset}>Xóa bộ lọc</button></div>
    </div>
  );
}

export default FilterPanel;