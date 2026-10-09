import api from './api.js';

export const reviewService = {
  list: async (status = '', page = 1, limit = 20, config = {}) => {
    const params = { page, limit };
    if (status) params.status = status;
    const response = await api.get('/reviews', { params, ...config });
    return response.data.data;
  },

  updateStatus: async (id, status, adminFeedback = '') => {
    const response = await api.patch(`/reviews/${id}/status`, { status, adminFeedback });
    return response.data.data;
  },
};
