import api from './api.js';

export const analyticsService = {
  async get(params, config = {}) {
    const response = await api.get('/analytics', { params, ...config });
    return response.data.data;
  },
};
