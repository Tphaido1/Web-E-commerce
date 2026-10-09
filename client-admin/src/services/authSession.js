const AUTH_KEY = 'nova-admin-auth';
const AUTH_CHANGE_EVENT = 'nova-admin-auth-change';
const AUTH_LOGOUT_EVENT = 'nova-admin-logout';

const createSessionId = () => globalThis.crypto?.randomUUID?.()
  || Date.now().toString(36) + Math.random().toString(36).slice(2);

export function getSession() {
  const storedSession = localStorage.getItem(AUTH_KEY);
  if (!storedSession) return null;

  try {
    const session = JSON.parse(storedSession);
    if (
      typeof session?.accessToken === 'string'
      && typeof session.refreshToken === 'string'
      && session.user
      && typeof session.user.email === 'string'
      && typeof session.user.role === 'string'
    ) {
      // Migrate existing stored sessions once, so refreshes keep their identity.
      if (!session.sessionId) {
        session.sessionId = createSessionId();
        localStorage.setItem(AUTH_KEY, JSON.stringify(session));
      }
      return session;
    }
  } catch {
    return null;
  }

  return null;
}

export function isCurrentSession(session) {
  return Boolean(session?.sessionId && getSession()?.sessionId === session.sessionId);
}

function persistSession(session) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}

export function setSession(session) {
  const nextSession = { ...session, sessionId: createSessionId() };
  persistSession(nextSession);
  return nextSession;
}

export function updateSessionIfCurrent(previousSession, session) {
  if (!isCurrentSession(previousSession)
    || getSession()?.refreshToken !== previousSession.refreshToken) return false;
  persistSession({ ...session, sessionId: previousSession.sessionId });
  return true;
}

export function clearSession() {
  localStorage.removeItem(AUTH_KEY);
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}

export function clearSessionIfCurrent(session) {
  if (!isCurrentSession(session)
    || getSession()?.refreshToken !== session.refreshToken) return false;
  clearSession();
  return true;
}

export function notifyLogoutStarting() {
  window.dispatchEvent(new Event(AUTH_LOGOUT_EVENT));
}

export function subscribeToLogout(callback) {
  window.addEventListener(AUTH_LOGOUT_EVENT, callback);
  return () => window.removeEventListener(AUTH_LOGOUT_EVENT, callback);
}

export function subscribeToSession(callback) {
  const handleStorage = (event) => {
    if (event.key === AUTH_KEY || event.key === null) callback(getSession());
  };
  const handleSessionChange = () => callback(getSession());

  window.addEventListener('storage', handleStorage);
  window.addEventListener(AUTH_CHANGE_EVENT, handleSessionChange);

  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(AUTH_CHANGE_EVENT, handleSessionChange);
  };
}
