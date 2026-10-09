import api from './api.js';

export const inventoryService = {
  async list(params, config = {}) {
    const response = await api.get('/inventory', { params, ...config });
    return response.data.data;
  },
  async restock(id, quantity) {
    const response = await api.post(`/inventory/${id}/restock`, { quantity });
    return response.data.data;
  },
  async updateThreshold(id, lowStockThreshold) {
    const response = await api.patch(`/inventory/${id}/threshold`, { lowStockThreshold });
    return response.data.data;
  },
};
