const ACCESS_TOKEN_KEY = 'storefront_token';
const REFRESH_TOKEN_KEY = 'storefront_refresh_token';
const USER_KEY = 'storefront_user';
const SESSION_ID_KEY = 'storefront_session_id';
const AUTH_CHANGE_EVENT = 'storefront-auth-change';

function getStorages() {
  return [
    { storage: localStorage, remembered: true },
    { storage: sessionStorage, remembered: false },
  ];
}

function readSession(storage, remembered) {
  const accessToken = storage.getItem(ACCESS_TOKEN_KEY);
  if (!accessToken) return null;

  let user = null;
  try {
    user = JSON.parse(storage.getItem(USER_KEY) || 'null');
  } catch {
    storage.removeItem(ACCESS_TOKEN_KEY);
    storage.removeItem(REFRESH_TOKEN_KEY);
    storage.removeItem(USER_KEY);
    storage.removeItem(SESSION_ID_KEY);
    return null;
  }

  return {
    accessToken,
    refreshToken: storage.getItem(REFRESH_TOKEN_KEY),
    user,
    remembered,
    sessionId: storage.getItem(SESSION_ID_KEY) || `legacy:${storage.getItem(REFRESH_TOKEN_KEY) || accessToken}`,
  };
}

function notifyAuthChange() {
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}

export function getAuthSession() {
  for (const { storage, remembered } of getStorages()) {
    const session = readSession(storage, remembered);
    if (session) return session;
  }
  return null;
}

export function saveAuthSession(tokens, user, remembered = false, sessionId) {
  const accessToken = tokens.accessToken || tokens.token;
  if (!accessToken || !tokens.refreshToken) {
    throw new Error('Phản hồi đăng nhập thiếu access token hoặc refresh token.');
  }
  if (!user || typeof user !== 'object') {
    throw new Error('Phản hồi đăng nhập thiếu thông tin tài khoản.');
  }

  for (const { storage } of getStorages()) {
    storage.removeItem(ACCESS_TOKEN_KEY);
    storage.removeItem(REFRESH_TOKEN_KEY);
    storage.removeItem(USER_KEY);
    storage.removeItem(SESSION_ID_KEY);
  }
  const storage = remembered ? localStorage : sessionStorage;
  storage.setItem(ACCESS_TOKEN_KEY, accessToken);
  storage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  storage.setItem(USER_KEY, JSON.stringify(user));
  storage.setItem(SESSION_ID_KEY, sessionId || globalThis.crypto?.randomUUID?.() || `session-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  notifyAuthChange();
}

export function clearAuthSession(expectedSessionId) {
  if (expectedSessionId && getAuthSession()?.sessionId !== expectedSessionId) return;
  for (const { storage } of getStorages()) {
    storage.removeItem(ACCESS_TOKEN_KEY);
    storage.removeItem(REFRESH_TOKEN_KEY);
    storage.removeItem(USER_KEY);
    storage.removeItem(SESSION_ID_KEY);
  }
  notifyAuthChange();
}

export function subscribeAuthSession(listener) {
  const handleChange = (event) => {
    if (
      event.type === 'storage'
      && event.key !== null
      && ![ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY, SESSION_ID_KEY].includes(event.key)
    ) {
      return;
    }
    listener(getAuthSession());
  };
  window.addEventListener(AUTH_CHANGE_EVENT, handleChange);
  window.addEventListener('storage', handleChange);
  return () => {
    window.removeEventListener(AUTH_CHANGE_EVENT, handleChange);
    window.removeEventListener('storage', handleChange);
  };
}
