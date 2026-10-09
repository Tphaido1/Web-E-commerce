import axios from 'axios';
import {
  clearSessionIfCurrent,
  getSession,
  isCurrentSession,
  updateSessionIfCurrent,
} from './authSession.js';

const baseURL = import.meta.env?.VITE_API_BASE_URL
  || (import.meta.env?.PROD ? '/api/v1' : 'http://localhost:5000/api/v1');
const clientOptions = {
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
};
const api = axios.create(clientOptions);
const refreshClient = axios.create(clientOptions);
const authPaths = ['/auth/login', '/auth/refresh-token', '/auth/logout'];
const sessionChanged = () => new axios.CanceledError('Phiên đăng nhập đã thay đổi.');
let refreshRequest;

async function refreshAccessToken(session) {
  if (!isCurrentSession(session)) throw sessionChanged();
  if (refreshRequest?.sessionId === session.sessionId) return refreshRequest.promise;

  const pending = { sessionId: session.sessionId };
  pending.promise = refreshClient
    .post('/auth/refresh-token', { refreshToken: session.refreshToken })
    .then((response) => {
      const tokens = response.data?.data;
      const accessToken = tokens?.accessToken || tokens?.token;
      if (typeof accessToken !== 'string' || typeof tokens?.refreshToken !== 'string') {
        throw new Error('Phản hồi làm mới phiên đăng nhập không hợp lệ.');
      }
      const refreshedSession = { ...session, accessToken, refreshToken: tokens.refreshToken };
      if (!updateSessionIfCurrent(session, refreshedSession)) throw sessionChanged();
      return refreshedSession;
    })
    .catch((error) => {
      if (error.response?.status === 401) clearSessionIfCurrent(session);
      throw error;
    })
    .finally(() => {
      // A refresh started by another session owns its own pending request.
      if (refreshRequest === pending) refreshRequest = null;
    });
  refreshRequest = pending;
  return pending.promise;
}

api.interceptors.request.use((config) => {
  if (authPaths.includes(config.url)) return config;
  const session = getSession();
  if (config.authSessionId && config.authSessionId !== session?.sessionId) {
    throw sessionChanged();
  }
  if (session?.accessToken) {
    config.authSessionId = session.sessionId;
    config.headers.Authorization = 'Bearer ' + session.accessToken;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    if (response.config.authSessionId
      && response.config.authSessionId !== getSession()?.sessionId) throw sessionChanged();
    return response;
  },
  async (error) => {
    const request = error.config;
    if (error.response?.status !== 401 || !request
      || authPaths.includes(request.url) || request.authRetried) return Promise.reject(error);

    const session = getSession();
    if (!session?.refreshToken || request.authSessionId !== session.sessionId) {
      return Promise.reject(error);
    }
    request.authRetried = true;
    const authorization = request.headers?.Authorization || request.headers?.authorization;
    if (authorization !== 'Bearer ' + session.accessToken) return api(request);

    try {
      await refreshAccessToken(session);
      return api(request);
    } catch (refreshError) {
      return Promise.reject(refreshError);
    }
  },
);

export default api;
