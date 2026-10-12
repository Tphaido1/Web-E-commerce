import api from './api.js';

export async function getCategories({ signal } = {}) {
  try {
    const response = await api.get('/categories', { signal });
    const data = response.data?.data ?? response.data;
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error fetching categories:', error);
    return [];
  }
}

export default {
  getCategories,
};
