import api from './api.js';

const getProductData = (response) => {
  const data = response.data?.data ?? response.data;
  if (Array.isArray(data)) return { products: data, pagination: null };
  return { products: data?.products ?? data?.items ?? [], pagination: data?.pagination ?? null };
};

export async function getProducts(params = {}) {
  const response = await api.get('/products', { params });
  return getProductData(response);
}