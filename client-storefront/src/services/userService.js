import api from './api.js';

export async function getProfile({ signal } = {}) {
  const response = await api.get('/users/profile', { signal });
  return response.data?.data ?? response.data;
}

export async function updateProfile(data, { signal } = {}) {
  const response = await api.put('/users/profile', data, { signal });
  return response.data?.data ?? response.data;
}

export async function changePassword(data, { signal } = {}) {
  const response = await api.put('/users/change-password', data, { signal });
  return response.data?.data ?? response.data;
}

export async function getWishlist({ signal } = {}) {
  const response = await api.get('/users/wishlist', { signal });
  return response.data?.data ?? response.data;
}

export async function toggleWishlist(productId, { signal } = {}) {
  const response = await api.post(`/users/wishlist/${encodeURIComponent(productId)}`, {}, { signal });
  return response.data?.data ?? response.data;
}

export async function getRecommendations({ categories, signal } = {}) {
  const params = categories && categories.length > 0
    ? { categories: Array.isArray(categories) ? categories.join(',') : categories }
    : undefined;
  const response = await api.get('/users/recommendations', { params, signal });
  return response.data?.data ?? response.data;
}
