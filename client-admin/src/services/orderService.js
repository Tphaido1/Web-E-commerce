import api from './api.js';

export const orderService = {
  async list(params, config = {}) {
    const response = await api.get('/orders', { params, ...config });
    return response.data.data;
  },

  async updateStatus(id, payload) {
    const response = await api.patch(`/orders/${id}/status`, payload);
    return response.data.data;
  },
};
