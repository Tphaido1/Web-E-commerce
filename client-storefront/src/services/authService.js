import api from './api.js';
import { clearAuthSession, getAuthSession } from './authSession.js';

const getApiErrorMessage = (error, fallback) => (
  error.response?.data?.message || error.message || fallback
);

export async function login(credentials) {
  try {
    const response = await api.post('/auth/login', credentials, { skipAuthRefresh: true });
    return response.data?.data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Không thể đăng nhập. Vui lòng thử lại.'));
  }
}

export async function register(payload) {
  try {
    const response = await api.post('/auth/register', payload, { skipAuthRefresh: true });
    return response.data?.data;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Đăng ký chưa khả dụng. Vui lòng thử lại sau.'));
  }
}

export async function logout() {
  const session = getAuthSession();
  const sessionId = session?.sessionId;
  if (!sessionId) return;
  clearAuthSession(sessionId);
  let requestError;
  try {
    await api.post('/auth/logout', undefined, { skipAuthRefresh: true, skipSessionAuth: true, headers: { Authorization: `Bearer ${session.accessToken}` } });
  } catch (error) {
    requestError = new Error(getApiErrorMessage(error, 'Không thể đăng xuất khỏi máy chủ.'));
  } finally {
    clearAuthSession(sessionId);
  }
  if (requestError) throw requestError;
}