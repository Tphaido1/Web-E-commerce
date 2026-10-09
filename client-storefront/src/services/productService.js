import api from './api.js';
import { getAuthSession } from './authSession.js';
import { cacheProductQuery, cacheProducts, getCachedProductQuery, getCachedProducts } from './offlineDb.js';

function createCacheKey(prefix, values) {
  const params = new URLSearchParams();
  Object.entries(values).sort(([left], [right]) => left.localeCompare(right)).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  return `${prefix}:${params.toString()}`;
}

function isNetworkFailure(error) {
  return (
    (!error.response || (error.response.status === 503 && error.response.data?.offline))
    && error.name !== 'CanceledError'
    && error.code !== 'ERR_CANCELED'
  );
}

async function storeProductQuery(key, result) {
  await Promise.all([
    cacheProductQuery(key, result),
    cacheProducts(result.products.filter((product) => product?._id)),
  ]);
}

const getProductData = (response) => {
  const data = response.data?.data ?? response.data;
  if (Array.isArray(data)) return { products: data, pagination: null };
  return { products: data?.products ?? data?.items ?? [], pagination: data?.pagination ?? null };
};

export async function getProducts(params = {}, { signal } = {}) {
  const cacheKey = createCacheKey('products', params);
  const canUseLocalCache = !getAuthSession();
  try {
    const response = await api.get('/products', { params, signal });
    const result = getProductData(response);
    if (canUseLocalCache) {
      try {
        await storeProductQuery(cacheKey, result);
      } catch (cacheError) {
        console.warn('Unable to cache public product list:', cacheError);
      }
    }
    return { ...result, isCached: response.headers['x-offline-cache'] === 'hit' };
  } catch (error) {
    if (!canUseLocalCache || !isNetworkFailure(error)) throw error;
    const cached = await getCachedProductQuery(cacheKey);
    if (!cached?.data) {
      error.offlineCacheMiss = true;
      throw error;
    }
    return { ...cached.data, isCached: true };
  }
}

// Seven public catalog entries leave room to exclude the currently viewed product.
export async function getRelatedProducts(product, { signal } = {}) {
  const category = typeof product?.category === 'string' ? product.category.trim() : '';
  const productId = String(product?._id || product?.id || '');
  if (!category || !productId) return { products: [], isCached: false };

  const result = await getProducts({ category, page: 1, limit: 7 }, { signal });
  if (signal?.aborted) {
    const error = new Error('Related product request was canceled.');
    error.name = 'AbortError';
    throw error;
  }

  const seenIds = new Set([productId]);
  const categoryKey = category.toLocaleLowerCase('vi');
  const products = result.products.filter((entry) => {
    const id = String(entry?._id || entry?.id || '');
    const entryCategory = typeof entry?.category === 'string' ? entry.category.trim() : '';
    if (!id || seenIds.has(id) || entry?.isActive === false
      || entryCategory.toLocaleLowerCase('vi') !== categoryKey) return false;
    seenIds.add(id);
    return true;
  }).slice(0, 6);

  return { products, isCached: Boolean(result.isCached) };
}

export async function getProductCategories({ signal } = {}) {
  const response = await api.get('/products/categories', { signal });
  const categories = response.data?.data ?? response.data;
  if (!Array.isArray(categories) || categories.some((category) => typeof category !== 'string')) {
    throw new Error('Phản hồi danh mục sản phẩm không hợp lệ.');
  }
  return categories;
}

export async function getProductById(id, { signal } = {}) {
  const cacheKey = createCacheKey('product', { id });
  const canUseLocalCache = !getAuthSession();
  try {
    const response = await api.get(`/products/${encodeURIComponent(id)}`, { signal });
    const product = response.data?.data ?? response.data;
    if (!product || typeof product !== 'object' || Array.isArray(product)) {
      throw new Error('Phản hồi chi tiết sản phẩm không hợp lệ.');
    }
    if (canUseLocalCache && product._id) {
      try {
        await Promise.all([
          cacheProductQuery(cacheKey, product),
          cacheProducts([product]),
        ]);
      } catch (cacheError) {
        console.warn('Unable to cache public product details:', cacheError);
      }
    }
    return { product, isCached: response.headers['x-offline-cache'] === 'hit' };
  } catch (error) {
    if (!canUseLocalCache || !isNetworkFailure(error)) throw error;
    const cached = await getCachedProductQuery(cacheKey);
    if (cached?.data) return { product: cached.data, isCached: true };
    const cachedProducts = await getCachedProducts();
    const product = cachedProducts.find((entry) => String(entry._id) === String(id) || entry.slug === id);
    if (product) return { product, isCached: true };
    error.offlineCacheMiss = true;
    throw error;
  }
}
