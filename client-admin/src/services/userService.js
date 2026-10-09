import api from './api.js';

export const userService = {
  async list(params, config = {}) {
    const response = await api.get('/users', { params, ...config });
    return response.data.data;
  },
  async get(id, config = {}) {
    const response = await api.get(`/users/${id}`, config);
    return response.data.data;
  },
  async update(id, values) {
    const response = await api.patch(`/users/${id}`, values);
    return response.data.data;
  },
};
