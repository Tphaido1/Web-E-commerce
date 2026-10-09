import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import axios from 'axios';

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};
globalThis.window = new EventTarget();
let handleRequest;
axios.defaults.adapter = (config) => handleRequest(config);
const { default: api } = await import('../src/services/api.js');
const { authService } = await import('../src/services/authService.js');
const { clearSession, getSession, setSession, updateSessionIfCurrent } = await import('../src/services/authSession.js');

const session = (name = 'admin') => ({
  accessToken: name + '-access', refreshToken: name + '-refresh',
  user: { id: name, email: name + '@example.test', role: 'admin' },
});
const response = (config, data = {}) => ({ config, status: 200, statusText: 'OK', headers: {}, data });
const unauthorized = (config) => Promise.reject(new axios.AxiosError(
  'Unauthorized', 'ERR_BAD_REQUEST', config, {}, { status: 401, data: {}, config },
));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
beforeEach(() => { clearSession(); });

function delayedRefresh() {
  const started = deferred();
  const release = deferred();
  const requests = [];
  handleRequest = async (config) => {
    requests.push(config);
    if (config.url === '/auth/refresh-token') {
      started.resolve(config);
      return release.promise;
    }
    return unauthorized(config);
  };
  return { started, release, requests };
}

test('concurrent expired requests share one refresh and retry with the rotated access token', async () => {
  setSession(session());
  let refreshes = 0;
  let requests = 0;
  handleRequest = async (config) => {
    if (config.url === '/auth/refresh-token') {
      refreshes += 1;
      return response(config, { data: { accessToken: 'rotated', refreshToken: 'rotated-refresh' } });
    }
    requests += 1;
    return config.headers.Authorization === 'Bearer rotated'
      ? response(config, { ok: true }) : unauthorized(config);
  };
  const result = await Promise.all([api.get('/orders'), api.get('/products')]);
  assert.equal(refreshes, 1);
  assert.equal(requests, 4);
  assert.ok(result.every((item) => item.data.ok));
});

test('logout during refresh cannot restore a removed session or retry its request', async () => {
  setSession(session());
  const flow = delayedRefresh();
  const result = api.get('/orders').catch((error) => error);
  const refreshConfig = await flow.started.promise;
  clearSession();
  flow.release.resolve(response(refreshConfig, { data: { accessToken: 'old-rotated', refreshToken: 'old-rotated-refresh' } }));
  assert.ok(axios.isCancel(await result));
  assert.equal(getSession(), null);
  assert.equal(flow.requests.filter((item) => item.url === '/orders').length, 1);
});

test('a refresh success cannot overwrite a newly logged-in account', async () => {
  setSession(session('old'));
  const flow = delayedRefresh();
  const result = api.get('/orders').catch((error) => error);
  const refreshConfig = await flow.started.promise;
  const next = setSession(session('new'));
  flow.release.resolve(response(refreshConfig, { data: { accessToken: 'old-rotated', refreshToken: 'old-rotated-refresh' } }));
  assert.ok(axios.isCancel(await result));
  assert.deepEqual(getSession(), next);
  assert.equal(flow.requests.filter((item) => item.url === '/orders').length, 1);
});

test('a stale refresh rejection cannot clear a newly logged-in account', async () => {
  setSession(session('old'));
  const flow = delayedRefresh();
  const result = api.get('/orders').catch((error) => error);
  const refreshConfig = await flow.started.promise;
  const next = setSession(session('new'));
  flow.release.resolve(unauthorized(refreshConfig));
  assert.equal((await result).response.status, 401);
  assert.deepEqual(getSession(), next);
});

test('an old request 401 cannot be replayed under a different account', async () => {
  setSession(session('old'));
  const started = deferred();
  const release = deferred();
  let requests = 0;
  handleRequest = async (config) => {
    requests += 1;
    started.resolve(config);
    return release.promise;
  };
  const result = api.get('/orders').catch((error) => error);
  const config = await started.promise;
  setSession(session('new'));
  release.resolve(unauthorized(config));
  assert.equal((await result).response.status, 401);
  assert.equal(requests, 1);
});

test('a protected request response from a previous account is discarded', async () => {
  setSession(session('old'));
  const started = deferred();
  const release = deferred();
  handleRequest = async (config) => { started.resolve(config); return release.promise; };
  const result = api.get('/orders').catch((error) => error);
  const config = await started.promise;
  setSession(session('new'));
  release.resolve(response(config, { data: { private: 'old account' } }));
  assert.ok(axios.isCancel(await result));
});

test('a repeated 401 after refresh is rejected without a refresh loop', async () => {
  setSession(session());
  let refreshes = 0;
  let requests = 0;
  handleRequest = async (config) => {
    if (config.url === '/auth/refresh-token') {
      refreshes += 1;
      return response(config, { data: { accessToken: 'rotated', refreshToken: 'rotated-refresh' } });
    }
    requests += 1;
    return unauthorized(config);
  };
  await assert.rejects(api.get('/orders'), (error) => error.response.status === 401);
  assert.equal(refreshes, 1);
  assert.equal(requests, 2);
});

test('logout clears immediately, uses the captured token and does not clear a later login', async () => {
  setSession(session('old'));
  const started = deferred();
  const release = deferred();
  let refreshes = 0;
  handleRequest = async (config) => {
    if (config.url === '/auth/refresh-token') refreshes += 1;
    started.resolve(config);
    return release.promise;
  };
  const result = authService.logout();
  assert.equal(getSession(), null);
  const config = await started.promise;
  assert.equal(config.headers.Authorization, 'Bearer old-access');
  const next = setSession(session('new'));
  release.resolve(unauthorized(config));
  await assert.rejects(result, (error) => error.response.status === 401);
  assert.deepEqual(getSession(), next);
  assert.equal(refreshes, 0);
});

test('logout invalidates a login response that is still in flight', async () => {
  const started = deferred();
  const release = deferred();
  handleRequest = async (config) => { started.resolve(config); return release.promise; };
  const result = authService.login({ email: 'admin@example.test', password: 'test' });
  const config = await started.promise;
  await authService.logout();
  release.resolve(response(config, { data: session() }));
  await assert.rejects(result, /đã được thay thế/);
  assert.equal(getSession(), null);
});

test('latest login wins even if an earlier response arrives last', async () => {
  const started = deferred();
  const release = deferred();
  handleRequest = async (config) => {
    if (JSON.parse(config.data).email === 'old@example.test') {
      started.resolve(config);
      return release.promise;
    }
    return response(config, { data: session('new') });
  };
  const result = authService.login({ email: 'old@example.test', password: 'test' });
  const config = await started.promise;
  await authService.login({ email: 'new@example.test', password: 'test' });
  release.resolve(response(config, { data: session('old') }));
  await assert.rejects(result, /đã được thay thế/);
  assert.equal(getSession().user.id, 'new');
});

test('a refresh rejection cannot erase tokens already rotated by another tab', async () => {
  const previous = setSession(session());
  const flow = delayedRefresh();
  const result = api.get('/orders').catch((error) => error);
  const refreshConfig = await flow.started.promise;
  updateSessionIfCurrent(previous, { ...previous, accessToken: 'other-tab-access', refreshToken: 'other-tab-refresh' });
  flow.release.resolve(unauthorized(refreshConfig));
  assert.equal((await result).response.status, 401);
  assert.equal(getSession().accessToken, 'other-tab-access');
});
