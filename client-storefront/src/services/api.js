import axios from 'axios';
import { clearAuthSession, getAuthSession, saveAuthSession } from './authSession.js';

const apiEnvironment = import.meta.env;
const api = axios.create({
  baseURL: apiEnvironment.VITE_API_BASE_URL || (apiEnvironment.DEV ? 'http://localhost:5000/api/v1' : '/api/v1'),
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
});

const refreshRequests = new Map();

api.interceptors.request.use((config) => {
  if (config.skipSessionAuth) return config;
  const session = getAuthSession();
  const sessionId = session?.sessionId || null;
  if (config.authSessionId !== undefined && config.authSessionId !== sessionId) {
    throw new axios.CanceledError('Phiên đăng nhập đã thay đổi.');
  }
  config.authSessionId = sessionId;
  if (session?.accessToken) {
    config.headers.Authorization = `Bearer ${session.accessToken}`;
    config.authAccessToken = session.accessToken;
  }
  return config;
});

async function refreshSession(session) {
  const { sessionId, refreshToken } = session;
  if (!refreshRequests.has(sessionId)) {
    const request = api.post('/auth/refresh-token', { refreshToken }, {
      skipAuthRefresh: true,
      authSessionId: sessionId,
    }).then((response) => {
      const tokens = response.data?.data;
      const currentSession = getAuthSession();
      if (currentSession?.sessionId !== sessionId || currentSession.refreshToken !== refreshToken) {
        throw new axios.CanceledError('Phiên đăng nhập đã thay đổi trong khi làm mới token.');
      }
      if (!tokens?.refreshToken || !(tokens.accessToken || tokens.token)) {
        throw new Error('Phản hồi làm mới token không hợp lệ.');
      }
      saveAuthSession(tokens, currentSession.user, currentSession.remembered, sessionId);
      return tokens.accessToken || tokens.token;
    }).catch((error) => {
      if (error.response?.status === 401 || error.response?.status === 403) clearAuthSession(sessionId);
      throw error;
    }).finally(() => {
      refreshRequests.delete(sessionId);
    });
    refreshRequests.set(sessionId, request);
  }
  return refreshRequests.get(sessionId);
}

api.interceptors.response.use((response) => response, async (error) => {
  const config = error.config;
  if (error.response?.status !== 401 || !config || config.skipAuthRefresh) return Promise.reject(error);
  const session = getAuthSession();
  // A previous account's request must never be replayed as the current user.
  if (!session || config.authSessionId !== session.sessionId) return Promise.reject(error);
  if (config._authRetried) {
    if (session.accessToken === config.authAccessToken) clearAuthSession(session.sessionId);
    return Promise.reject(error);
  }
  if (!session.refreshToken) {
    clearAuthSession(session.sessionId);
    return Promise.reject(error);
  }
  config._authRetried = true;
  try {
    const accessToken = config.authAccessToken !== session.accessToken
      ? session.accessToken
      : await refreshSession(session);
    config.headers.Authorization = `Bearer ${accessToken}`;
    config.authAccessToken = accessToken;
    return api.request(config);
  } catch (refreshError) {
    return Promise.reject(refreshError);
  }
});

export default api;
