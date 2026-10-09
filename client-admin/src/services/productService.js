import api from './api.js';

export const productService = {
  async list(params, config = {}) {
    const response = await api.get('/products/managed', { params, ...config });
    return response.data.data;
  },

  async get(id, config = {}) {
    const response = await api.get(`/products/${id}`, config);
    return response.data.data;
  },

  async create(values) {
    const response = await api.post('/products', values);
    return response.data.data;
  },

  async update(id, values) {
    const response = await api.put(`/products/${id}`, values);
    return response.data.data;
  },

  async remove(id) {
    const response = await api.delete(`/products/${id}`);
    return response.data.data;
  },
};
