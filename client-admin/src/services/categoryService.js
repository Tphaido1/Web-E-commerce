import api from './api.js';

const getPayload = ({ name, description, status }) => ({
  name,
  description: description || '',
  isActive: status === 'Active',
});

export const categoryService = {
  async list(config = {}) {
    const response = await api.get('/categories', { ...config, params: { all: true } });
    return response.data.data;
  },

  async listActive(config = {}) {
    const response = await api.get('/categories', config);
    return response.data.data;
  },

  async create(values) {
    const { name, description } = getPayload(values);
    const response = await api.post('/categories', { name, description });
    return response.data.data;
  },

  async update(id, values) {
    const response = await api.put(`/categories/${id}`, getPayload(values));
    return response.data.data;
  },

  async remove(id) {
    const response = await api.delete(`/categories/${id}`);
    return response.data.data;
  },
};
