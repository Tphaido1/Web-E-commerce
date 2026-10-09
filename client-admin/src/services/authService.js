import api from './api.js';
import {
  clearSession,
  getSession,
  notifyLogoutStarting,
  setSession,
  subscribeToSession,
} from './authSession.js';

let loginAttempt = 0;

export const authService = {
  getSession,
  subscribe: subscribeToSession,
  isAuthenticated: () => {
    const session = getSession();
    return Boolean(
      session?.accessToken
      && session.refreshToken
      && ['admin', 'vendor'].includes(session.user.role)
    );
  },
  login: async (credentials) => {
    const attempt = ++loginAttempt;
    const response = await api.post('/auth/login', credentials);
    const data = response.data?.data;
    const accessToken = data?.accessToken || data?.token;
    if (
      typeof accessToken !== 'string'
      || typeof data?.refreshToken !== 'string'
      || typeof data?.user?.email !== 'string'
      || typeof data?.user?.role !== 'string'
    ) {
      throw new Error('Phản hồi đăng nhập không hợp lệ từ máy chủ.');
    }
    if (!['admin', 'vendor'].includes(data.user.role)) {
      throw new Error('Tài khoản này không có quyền truy cập khu vực quản trị.');
    }

    const session = {
      accessToken,
      refreshToken: data.refreshToken,
      user: data.user,
    };
    if (attempt !== loginAttempt) throw new Error('Yêu cầu đăng nhập đã được thay thế.');
    return setSession(session);
  },
  logout: async () => {
    loginAttempt += 1;
    const session = getSession();
    notifyLogoutStarting();
    clearSession();
    if (!session?.accessToken) return;
    await api.post('/auth/logout', undefined, {
      headers: { Authorization: 'Bearer ' + session.accessToken },
    });
  },
};
