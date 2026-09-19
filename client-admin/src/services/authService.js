const AUTH_KEY = 'nova-admin-auth';

export const authService = {
  isAuthenticated: () => localStorage.getItem(AUTH_KEY) === 'true',
  login: () => {
    localStorage.setItem(AUTH_KEY, 'true');
  },
  logout: () => {
    localStorage.removeItem(AUTH_KEY);
  },
};
