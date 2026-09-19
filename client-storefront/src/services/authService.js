import api from './api.js';

const getApiErrorMessage = (error, fallback) => (
  error.response?.data?.message || fallback
);

export async function login(credentials) {
  try {
    const response = await api.post('/auth/login', credentials);
    return response.data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Không thể đăng nhập. Vui lòng thử lại.'));
  }
}

export async function register(payload) {
  try {
    const response = await api.post('/auth/register', payload);
    return response.data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Đăng ký chưa khả dụng. Vui lòng thử lại sau.'));
  }
}