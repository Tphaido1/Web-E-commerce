// Mocked transport and hook unit regressions. These do not replace browser integration tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import axios from 'axios';
import { clearAuthSession, getAuthSession, saveAuthSession } from '../src/services/authSession.js';
import { resolveProductPrice } from '../src/utils/currency.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
class Storage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  clear() { this.values.clear(); }
}
function reset() {
  globalThis.localStorage = new Storage();
  globalThis.sessionStorage = new Storage();
  globalThis.window = new EventTarget();
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
}
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function until(predicate) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await tick();
  }
  throw new Error('Expected asynchronous operation did not start');
}
const user = { id: 'account-a', email: 'a@example.test' };
function signIn(label = 'a', remembered = false) {
  saveAuthSession({ accessToken: label + '-old', refreshToken: label + '-refresh' },
    { ...user, id: 'account-' + label }, remembered);
  return getAuthSession();
}
function response(config, data) {
  return { config, status: 200, statusText: 'OK', headers: {}, data: { data } };
}
function unauthorized(config) {
  throw new axios.AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, null,
    { config, status: 401, headers: {}, data: { message: 'Unauthorized' } });
}
let moduleCounter = 0;
function moduleUrl(source) {
  return 'data:text/javascript;base64,' + Buffer.from(source).toString('base64') + '#' + moduleCounter++;
}
async function loadApi() {
  let source = await fs.readFile(path.join(root, 'src/services/api.js'), 'utf8');
  source = source.replace('import.meta.env', '{}')
    .replace("'axios'", JSON.stringify(pathToFileURL(path.join(root, 'node_modules/axios/index.js')).href))
    .replace("'./authSession.js'", JSON.stringify(pathToFileURL(path.join(root, 'src/services/authSession.js')).href));
  const url = moduleUrl(source);
  return { api: (await import(url)).default, url };
}
async function loadLogout(apiUrl) {
  let source = await fs.readFile(path.join(root, 'src/services/authService.js'), 'utf8');
  source = source.replace("'./api.js'", JSON.stringify(apiUrl))
    .replace("'./authSession.js'", JSON.stringify(pathToFileURL(path.join(root, 'src/services/authSession.js')).href));
  return (await import(moduleUrl(source))).logout;
}

test('Remember Me chooses persistence and token rotation keeps the same login identity', () => {
  reset();
  const session = signIn('a', false);
  assert.equal(localStorage.getItem('storefront_token'), null);
  assert.equal(sessionStorage.getItem('storefront_token'), 'a-old');
  saveAuthSession({ accessToken: 'a-new', refreshToken: 'a-refresh-2' }, user, false, session.sessionId);
  assert.equal(getAuthSession().sessionId, session.sessionId);
  signIn('b', true);
  assert.equal(sessionStorage.getItem('storefront_token'), null);
  assert.equal(localStorage.getItem('storefront_token'), 'b-old');
});

test('four concurrent 401 responses share one refresh and retry with the rotated token', async () => {
  reset();
  signIn();
  const { api } = await loadApi();
  const refresh = deferred();
  let refreshCount = 0;
  api.defaults.adapter = async (config) => {
    if (config.url === '/auth/refresh-token') {
      refreshCount += 1;
      await refresh.promise;
      return response(config, { accessToken: 'a-new', refreshToken: 'a-refresh-2' });
    }
    if (config.headers.Authorization === 'Bearer a-old') unauthorized(config);
    assert.equal(config.headers.Authorization, 'Bearer a-new');
    return response(config, { ok: true });
  };
  const requests = Array.from({ length: 4 }, () => api.get('/cart'));
  await until(() => refreshCount === 1);
  refresh.resolve();
  await Promise.all(requests);
  assert.equal(refreshCount, 1);
  assert.equal(getAuthSession().accessToken, 'a-new');
});

test('logout immediately ends local auth and delayed refresh/logout cannot restore or erase a newer login', async () => {
  reset();
  signIn();
  const { api, url } = await loadApi();
  const logout = await loadLogout(url);
  const refresh = deferred();
  const logoutRequest = deferred();
  let refreshing = false;
  let loggingOut = false;
  api.defaults.adapter = async (config) => {
    if (config.url === '/auth/refresh-token') {
      refreshing = true;
      await refresh.promise;
      return response(config, { accessToken: 'a-new', refreshToken: 'a-refresh-2' });
    }
    if (config.url === '/auth/logout') {
      loggingOut = true;
      assert.equal(config.headers.Authorization, 'Bearer a-old');
      await logoutRequest.promise;
      return response(config, {});
    }
    unauthorized(config);
  };
  const oldRequest = api.get('/cart').then(() => assert.fail('Old request unexpectedly succeeded'), (error) => error);
  await until(() => refreshing);
  const leaving = logout();
  assert.equal(getAuthSession(), null);
  await until(() => loggingOut);
  signIn('b');
  refresh.resolve();
  logoutRequest.resolve();
  await oldRequest;
  await leaving;
  assert.equal(getAuthSession().user.id, 'account-b');
  assert.equal(getAuthSession().accessToken, 'b-old');
});

test('a late 401 from the prior account is never replayed with the new account token', async () => {
  reset();
  signIn();
  const { api } = await loadApi();
  const waiting = deferred();
  let requests = 0;
  api.defaults.adapter = async (config) => {
    requests += 1;
    await waiting.promise;
    unauthorized(config);
  };
  const oldRequest = api.get('/cart').then(() => assert.fail('Unexpected replay'), () => undefined);
  await until(() => requests === 1);
  signIn('b');
  waiting.resolve();
  await oldRequest;
  assert.equal(requests, 1);
  assert.equal(getAuthSession().user.id, 'account-b');
});

test('a new login refreshes independently while the old login refresh is in flight', async () => {
  reset();
  signIn();
  const { api } = await loadApi();
  const oldRefresh = deferred();
  let refreshCount = 0;
  api.defaults.adapter = async (config) => {
    if (config.url === '/auth/refresh-token') {
      refreshCount += 1;
      const { refreshToken } = JSON.parse(config.data);
      if (refreshToken === 'a-refresh') {
        await oldRefresh.promise;
        return response(config, { accessToken: 'a-new', refreshToken: 'a-refresh-2' });
      }
      return response(config, { accessToken: 'b-new', refreshToken: 'b-refresh-2' });
    }
    if (config.headers.Authorization.endsWith('-old')) unauthorized(config);
    return response(config, { ok: true });
  };
  const oldRequest = api.get('/cart').then(() => assert.fail('Old account replayed'), () => undefined);
  await until(() => refreshCount === 1);
  signIn('b');
  await api.get('/cart');
  assert.equal(refreshCount, 2);
  assert.equal(getAuthSession().accessToken, 'b-new');
  oldRefresh.resolve();
  await oldRequest;
  assert.equal(getAuthSession().accessToken, 'b-new');
});

test('a repeated 401 stops after one retry and ends that login', async () => {
  reset();
  signIn();
  const { api } = await loadApi();
  let protectedCount = 0;
  let refreshCount = 0;
  api.defaults.adapter = async (config) => {
    if (config.url === '/auth/refresh-token') {
      refreshCount += 1;
      return response(config, { accessToken: 'a-new', refreshToken: 'a-refresh-2' });
    }
    protectedCount += 1;
    unauthorized(config);
  };
  await assert.rejects(api.get('/cart'));
  assert.equal(protectedCount, 2);
  assert.equal(refreshCount, 1);
  assert.equal(getAuthSession(), null);
});

// Compile the actual JSX and drive its handlers with deliberately delayed mocked services.
// Hook mocks leave each handler's render closure unchanged, reproducing same-tick React events.
const reactMock = `
export function useState(initial) {
  let value = typeof initial === 'function' ? initial() : initial;
  if (globalThis.__componentMocks.initializeState) value = globalThis.__componentMocks.initializeState(value);
  const entry = { value };
  if (globalThis.__componentMocks.states) globalThis.__componentMocks.states.push(entry);
  return [value, (next) => { value = typeof next === 'function' ? next(value) : next; entry.value = value; }];
}
export function useRef(value) { return { current: value }; }
export function useEffect(callback) { if (globalThis.__componentMocks.effects) globalThis.__componentMocks.effects.push(callback); }
export function useMemo(fn) { return fn(); }
export function useCallback(fn) { return fn; }
export function createContext() { return { Provider: 'provider' }; }
export function useContext() {}
export const Fragment = 'fragment';
export function createElement(type, props, ...children) { return { type, props: { ...props, children } }; }
export default { createElement };
`;
async function loadComponent(relativeFile, mocks, definitions = {}) {
  mocks = {
    ...(!relativeFile.endsWith('/ToastContext.jsx') && { 'ToastContext.jsx': 'export const useToast = () => globalThis.__componentMocks.toast || { success() {}, error() {}, info() {} };' }),
    ...mocks,
  };
  const result = await build({
    entryPoints: [path.join(root, relativeFile)], bundle: true, write: false, platform: 'node',
    define: definitions,
    format: 'esm', jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment',
    banner: { js: 'const React = globalThis.__componentMocks.React;' },
    plugins: [{
      name: 'regression-mocks',
      setup(builder) {
        builder.onResolve({ filter: /./ }, (args) => {
          if (args.path === 'react') return { path: 'react', namespace: 'test-mock' };
          if (args.path.endsWith('.css')) return { path: args.path, namespace: 'empty-style' };
          const match = Object.keys(mocks).find((name) => args.path.endsWith(name));
          if (match) return { path: match, namespace: 'test-mock' };
        });
        builder.onLoad({ filter: /./, namespace: 'empty-style' }, () => ({ contents: '', loader: 'js' }));
        builder.onLoad({ filter: /./, namespace: 'test-mock' }, (args) => ({
          contents: args.path === 'react' ? reactMock : mocks[args.path], loader: 'js',
        }));
      },
    }],
  });
  return import(moduleUrl(result.outputFiles[0].text));
}
function element(type, props, ...children) { return { type, props: { ...props, children } }; }
function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return null;
  if (predicate(tree)) return tree;
  for (const child of tree.props?.children?.flat(Infinity) || []) {
    const match = find(child, predicate);
    if (match) return match;
  }
  return null;
}

test('Toast provider clears prior-account feedback on logout or account change and disposes timers', async () => {
  reset();
  signIn();
  let sessionListener;
  globalThis.__componentMocks = {
    React: { createElement: element }, effects: [], auth: getAuthSession,
    subscribe: (listener) => { sessionListener = listener; return () => { sessionListener = null; }; },
  };
  const component = await loadComponent('src/context/ToastContext.jsx', {
    'authSession.js': 'export const getAuthSession = () => globalThis.__componentMocks.auth(); export const subscribeAuthSession = (listener) => globalThis.__componentMocks.subscribe(listener);',
  });
  const tree = component.ToastProvider({ children: null });
  const store = tree.props.value;
  const cleanups = globalThis.__componentMocks.effects.map((effect) => effect());
  store.success('Order account-a confirmed');
  signIn('b');
  sessionListener(getAuthSession());
  assert.deepEqual(store.getSnapshot(), []);
  store.info('Account-b feedback');
  sessionListener(null);
  assert.deepEqual(store.getSnapshot(), []);
  cleanups.forEach((cleanup) => cleanup?.());
  assert.equal(sessionListener, null);
});

test('guest rapid adds serialize and stock failure preserves prior successful quantities', async () => {
  reset();
  const snapshots = [];
  const feedback = [];
  const firstWrite = deferred();
  globalThis.__componentMocks = {
    React: { createElement: element },
    auth: () => null,
    toast: {
      success: (message) => feedback.push({ type: 'success', message }),
      info: (message) => feedback.push({ type: 'info', message }),
      error: (message) => feedback.push({ type: 'error', message }),
    },
    save: async (scope, items) => {
      if (snapshots.length === 0) { snapshots.push(items); await firstWrite.promise; }
      else snapshots.push(items);
    },
  };
  const cart = await loadComponent('src/context/CartContext.jsx', {
    'authSession.js': 'export const getAuthSession = () => globalThis.__componentMocks.auth(); export const subscribeAuthSession = () => () => {};',
    'cartService.js': 'export const normalizeCart = x => x.items; export const addCartItem = () => {}; export const clearCart = () => {}; export const getCart = () => {}; export const mergeGuestCart = () => {}; export const removeCartItem = () => {}; export const updateCartItem = () => {};',
    'offlineDb.js': 'export const saveOfflineCartSnapshot = (...args) => globalThis.__componentMocks.save(...args); export const getOfflineCartSyncState = async () => null; export const getOfflineCart = async () => []; export const clearOfflineCart = async () => {};',
  });
  const value = cart.CartProvider({ children: null }).props.value;
  const product = { id: 'product-a', sku: 'sku-a', name: 'A', price: 100, stock: 3 };
  const first = value.addItem(product);
  const second = value.addItem(product);
  await until(() => snapshots.length === 1);
  firstWrite.resolve();
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(snapshots.at(-1)[0].quantity, 2);
  assert.equal(await value.addItem(product, { quantity: 2 }), false);
  assert.equal(feedback.filter((item) => item.type === 'success').length, 2, 'Failed additions must not show a success toast');
  assert.deepEqual(feedback.filter((item) => item.type === 'error').map((item) => item.message), ['Chỉ còn 3 sản phẩm có sẵn.']);
  assert.equal(JSON.parse(localStorage.getItem('storefront_cart'))[0].quantity, 2);
  assert.equal(await value.removeItem('product-a'), true);
  assert.equal(feedback.length, 4);
  assert.deepEqual(JSON.parse(localStorage.getItem('storefront_cart')), []);
});

const guestCartMocks = {
  'authSession.js': 'export const getAuthSession = () => globalThis.__componentMocks.auth(); export const subscribeAuthSession = () => () => {};',
  'cartService.js': 'export const normalizeCart = x => x.items; export const addCartItem = () => {}; export const clearCart = () => {}; export const getCart = () => {}; export const mergeGuestCart = () => {}; export const removeCartItem = () => {}; export const updateCartItem = () => {};',
  'offlineDb.js': 'export const saveOfflineCartSnapshot = (...args) => globalThis.__componentMocks.save(...args); export const getOfflineCartSyncState = async () => null; export const getOfflineCart = async () => []; export const clearOfflineCart = async () => {};',
};

test('concurrent failed cart actions retain their own error feedback and never show success', async () => {
  reset();
  const pending = deferred();
  const feedback = [];
  let writes = 0;
  globalThis.__componentMocks = {
    React: { createElement: element }, auth: getAuthSession,
    save: async (scope, items) => {
      writes += 1;
      if (writes === 1) await pending.promise;
      throw new Error(`Storage failure for ${items[0].sku}`);
    },
    toast: { success: () => assert.fail('Failed mutation showed success'), error: (message) => feedback.push(message) },
  };
  const cart = await loadComponent('src/context/CartContext.jsx', guestCartMocks);
  const value = cart.CartProvider({ children: null }).props.value;
  const first = value.addItem({ id: 'a', sku: 'A', price: 100, stock: 3 });
  const second = value.addItem({ id: 'b', sku: 'B', price: 100, stock: 3 });
  await until(() => writes === 1);
  pending.resolve();
  assert.deepEqual(await Promise.all([first, second]), [false, false]);
  assert.deepEqual(feedback, ['Storage failure for A', 'Storage failure for B']);
});

test('a failed cart action from a previous login does not show that error in the new session', async () => {
  reset();
  const pending = deferred();
  let started = false;
  const feedback = [];
  globalThis.__componentMocks = {
    React: { createElement: element }, auth: getAuthSession,
    save: async () => { started = true; await pending.promise; },
    toast: { success: (message) => feedback.push(message), error: (message) => feedback.push(message) },
  };
  const cart = await loadComponent('src/context/CartContext.jsx', guestCartMocks);
  const value = cart.CartProvider({ children: null }).props.value;
  const action = value.addItem({ id: 'a', sku: 'A', price: 100, stock: 3 });
  await until(() => started);
  signIn('b');
  pending.reject(new Error('Previous-account storage failure'));
  assert.equal(await action, false);
  assert.deepEqual(feedback, []);
});

test('offline cart synchronization failures announce an error and keep pending changes', async () => {
  reset();
  signIn();
  const feedback = [];
  let snapshots = 0;
  globalThis.__componentMocks = {
    React: { createElement: element }, auth: getAuthSession,
    save: async () => { snapshots += 1; },
    toast: { success: () => assert.fail('Failed sync showed success'), error: (message) => feedback.push(message) },
  };
  const cart = await loadComponent('src/context/CartContext.jsx', {
    ...guestCartMocks,
    'cartService.js': 'export const normalizeCart = x => x.items; export const addCartItem = () => {}; export const clearCart = () => {}; export const getCart = async () => { throw new Error("Cannot reach cart server"); }; export const mergeGuestCart = () => {}; export const removeCartItem = () => {}; export const updateCartItem = () => {};',
    'offlineDb.js': 'export const saveOfflineCartSnapshot = (...args) => globalThis.__componentMocks.save(...args); export const getOfflineCartSyncState = async () => ({ pending: true, baseItems: [] }); export const getOfflineCart = async () => [{ sku: "A", quantity: 1 }]; export const clearOfflineCart = async () => {};',
  });
  const value = cart.CartProvider({ children: null }).props.value;
  assert.equal(await value.syncOfflineChanges(), false);
  assert.deepEqual(feedback, ['Cannot reach cart server']);
  assert.equal(snapshots, 0, 'Failure must not clear or overwrite pending offline changes');
});

test('catalog price policy applies valid discounts to the selected price and ignores zero or invalid sales', () => {
  const product = { price: 200, salePrice: 150 };
  assert.equal(resolveProductPrice(product), 150);
  assert.equal(resolveProductPrice(product, { price: 180 }), 150);
  assert.equal(resolveProductPrice(product, { price: 120 }), 120);
  for (const salePrice of [0, -1, 200, 250, 'invalid', Infinity, null, undefined]) {
    assert.equal(resolveProductPrice({ price: 200, salePrice }), 200);
  }
  assert.ok(Number.isNaN(resolveProductPrice({ price: 'invalid', salePrice: 150 })));
  assert.ok(Number.isNaN(resolveProductPrice(product, { price: 'invalid' })));
});

test('actual guest add handler stores the selected sale price and rejects invalid variant prices', async () => {
  reset();
  globalThis.__componentMocks = {
    React: { createElement: element }, auth: () => null, save: async () => {},
  };
  const cart = await loadComponent('src/context/CartContext.jsx', {
    'authSession.js': 'export const getAuthSession = () => globalThis.__componentMocks.auth(); export const subscribeAuthSession = () => () => {};',
    'cartService.js': 'export const normalizeCart = x => x.items; export const addCartItem = () => {}; export const clearCart = () => {}; export const getCart = () => {}; export const mergeGuestCart = () => {}; export const removeCartItem = () => {}; export const updateCartItem = () => {};',
    'offlineDb.js': 'export const saveOfflineCartSnapshot = (...args) => globalThis.__componentMocks.save(...args); export const getOfflineCartSyncState = async () => null; export const getOfflineCart = async () => []; export const clearOfflineCart = async () => {};',
  });
  const value = cart.CartProvider({ children: null }).props.value;
  const product = { id: 'discounted', name: 'Discounted', price: 200, salePrice: 150, stock: 3 };
  assert.equal(await value.addItem(product, { variant: { sku: 'EXPENSIVE', price: 180, stock: 3 } }), true);
  assert.equal(await value.addItem(product, { variant: { sku: 'CHEAPER', price: 120, stock: 3 } }), true);
  assert.equal(await value.addItem({ id: 'zero-sale', sku: 'ZERO-SALE', price: 200, salePrice: 0, stock: 3 }), true);
  assert.equal(await value.addItem(product, { variant: { sku: 'INVALID', price: 'invalid', stock: 3 } }), false);
  const lines = JSON.parse(localStorage.getItem('storefront_cart'));
  assert.deepEqual(lines.map(({ sku, price }) => ({ sku, price })), [
    { sku: 'EXPENSIVE', price: 150 }, { sku: 'CHEAPER', price: 120 }, { sku: 'ZERO-SALE', price: 200 },
  ]);
});

async function checkoutHarness(create) {
  reset();
  signIn();
  globalThis.__componentMocks = {
    React: { createElement: element }, auth: getAuthSession, create,
    clearCount: 0,
    feedback: [],
    toast: {
      success: (message) => globalThis.__componentMocks.feedback.push({ type: 'success', message }),
      error: (message) => globalThis.__componentMocks.feedback.push({ type: 'error', message }),
    },
    cart: {
      items: [{ id: 'line-a', productId: 'product-a', sku: 'sku-a', quantity: 1, price: 100 }],
      subtotal: 100, totalQuantity: 1, status: 'ready', error: '', isMutating: false, syncState: 'idle',
      clearCartAfterOrder: () => { globalThis.__componentMocks.clearCount += 1; },
    },
  };
  const checkout = await loadComponent('src/pages/Checkout/Checkout.jsx', {
    'react-router-dom': 'export const Link = "a";',
    'Header.jsx': 'export default function Header() {}',
    'Footer.jsx': 'export default function Footer() {}',
    'CartItem.jsx': 'export default function CartItem() {}',
    'CartContext.jsx': 'export const useCart = () => globalThis.__componentMocks.cart;',
    'authSession.js': 'export const getAuthSession = () => globalThis.__componentMocks.auth();',
    'orderService.js': 'export const createOrder = (...args) => globalThis.__componentMocks.create(...args); export const applyCoupon = async () => {}; export const createVNPayPaymentUrl = async () => {}; export const getOrderById = async () => {};',
  });
  const form = find(checkout.default(), (node) => node.type === 'form' && node.props.className === 'checkout-layout');
  assert.ok(form);
  return form.props.onSubmit;
}

test('same-tick checkout submits create one order and a failed retry keeps its idempotency key', async () => {
  const pending = deferred();
  const keys = [];
  const submit = await checkoutHarness(async (payload, key) => {
    keys.push(key);
    if (keys.length === 1) return pending.promise;
    return { _id: 'order-a', orderCode: 'ORD-A', finalAmount: 100 };
  });
  const event = { preventDefault() {} };
  const first = submit(event);
  await submit(event);
  assert.equal(keys.length, 1);
  pending.reject(new Error('Network interruption'));
  await first;
  await submit(event);
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
  assert.equal(globalThis.__componentMocks.clearCount, 1);
  assert.deepEqual(globalThis.__componentMocks.feedback.map((item) => item.type), ['error', 'success']);
});

test('checkout completion from a previous login cannot clear the switched account cart', async () => {
  const pending = deferred();
  const submit = await checkoutHarness(() => pending.promise);
  const first = submit({ preventDefault() {} });
  signIn('b');
  pending.resolve({ _id: 'order-a', orderCode: 'ORD-A', finalAmount: 100 });
  await first;
  assert.equal(globalThis.__componentMocks.clearCount, 0);
  assert.deepEqual(globalThis.__componentMocks.feedback, [], 'Previous-account responses must not display success feedback');
  assert.equal(sessionStorage.getItem('storefront_checkout_draft:account-b'), null);
});

async function paymentResultHarness(process, getOrder) {
  reset();
  signIn();
  globalThis.__componentMocks = {
    React: { createElement: element }, effects: [], states: [], auth: getAuthSession,
    query: '?vnp_TxnRef=attempt-a&vnp_SecureHash=signed&vnp_ResponseCode=00', process, getOrder,
  };
  const component = await loadComponent('src/pages/PaymentResult/PaymentResult.jsx', {
    'react-router-dom': 'export const Link = "a"; export const useLocation = () => ({ search: globalThis.__componentMocks.query });',
    'Header.jsx': 'export default function Header() {}',
    'Footer.jsx': 'export default function Footer() {}',
    'authSession.js': 'export const getAuthSession = () => globalThis.__componentMocks.auth();',
    'orderService.js': 'export const processVNPayReturn = (...args) => globalThis.__componentMocks.process(...args); export const getOrderById = (...args) => globalThis.__componentMocks.getOrder(...args); export const createVNPayPaymentUrl = async () => {};',
  });
  component.default();
  const cleanups = globalThis.__componentMocks.effects.map((effect) => effect());
  return () => cleanups.forEach((cleanup) => cleanup?.());
}

test('payment result loads authoritative order state instead of trusting a successful browser return', async () => {
  let orderRequests = 0;
  const cleanup = await paymentResultHarness(async (params) => {
    assert.equal(params.vnp_ResponseCode, '00');
    return { orderId: 'order-a', isSuccess: true };
  }, async (id) => {
    orderRequests += 1;
    assert.equal(id, 'order-a');
    return { _id: id, paymentStatus: 'unpaid', status: 'pending' };
  });
  await until(() => globalThis.__componentMocks.states[2].value === false);
  assert.equal(orderRequests, 1);
  assert.equal(globalThis.__componentMocks.states[0].value.paymentStatus, 'unpaid');
  cleanup();
});

test('rejected VNPay return never fetches or displays an unverified order', async () => {
  let orderRequests = 0;
  const cleanup = await paymentResultHarness(async () => { throw new Error('Invalid signature'); }, async () => { orderRequests += 1; });
  await until(() => globalThis.__componentMocks.states[2].value === false);
  assert.equal(orderRequests, 0);
  assert.equal(globalThis.__componentMocks.states[0].value, null);
  assert.equal(globalThis.__componentMocks.states[1].value, 'Invalid signature');
  cleanup();
});

test('payment verification from an ended login does not fetch or expose that account order', async () => {
  const pending = deferred();
  let orderRequests = 0;
  const cleanup = await paymentResultHarness(() => pending.promise, async () => { orderRequests += 1; });
  signIn('b');
  pending.resolve({ orderId: 'order-a', isSuccess: true });
  await tick();
  assert.equal(orderRequests, 0);
  assert.equal(globalThis.__componentMocks.states[0].value, null);
  cleanup();
});

test('cart controls ignore repeated same-tick quantity clicks while a mutation is pending', async () => {
  reset();
  const pending = deferred();
  let updates = 0;
  globalThis.__componentMocks = {
    React: { createElement: element },
    cart: { isMutating: false, updateQuantity: async () => { updates += 1; await pending.promise; }, removeItem: async () => {} },
  };
  const component = await loadComponent('src/components/CartItem/CartItem.jsx', {
    'CartContext.jsx': 'export const useCart = () => globalThis.__componentMocks.cart;',
  });
  const item = { id: 'line-a', name: 'A', price: 100, quantity: 1, stock: 10 };
  const tree = component.default({ item });
  const increase = find(tree, (node) => node.type === 'button' && node.props['aria-label'] === 'Tăng số lượng A');
  const first = increase.props.onClick();
  await increase.props.onClick();
  assert.equal(updates, 1);
  pending.resolve();
  await first;
});

test('duplicate login submits and a late login response cannot overwrite a newer account', async () => {
  reset();
  const pending = deferred();
  let loginCount = 0;
  let saves = 0;
  globalThis.__componentMocks = {
    React: { createElement: element }, auth: getAuthSession,
    initializeState: (value) => value && typeof value === 'object' && 'confirmPassword' in value
      ? { name: '', email: 'a@example.test', password: 'test-secret', confirmPassword: '' } : value,
    login: async () => { loginCount += 1; return pending.promise; },
    save: (...args) => { saves += 1; saveAuthSession(...args); },
  };
  const component = await loadComponent('src/components/AuthForm/AuthForm.jsx', {
    'react-router-dom': 'export const Link = "a"; export const useNavigate = () => () => {}; export const useLocation = () => ({ state: { from: { pathname: "/my-orders", search: "?page=2", hash: "#history" } } });',
    'authService.js': 'export const login = (...args) => globalThis.__componentMocks.login(...args); export const register = async () => {};',
    'authSession.js': 'export const getAuthSession = () => globalThis.__componentMocks.auth(); export const saveAuthSession = (...args) => globalThis.__componentMocks.save(...args); export const subscribeAuthSession = () => () => {};',
  });
  const form = find(component.default({ mode: 'login' }), (node) => node.type === 'form');
  const first = form.props.onSubmit({ preventDefault() {} });
  await form.props.onSubmit({ preventDefault() {} });
  assert.equal(loginCount, 1);
  signIn('b');
  pending.resolve({ accessToken: 'a-new', refreshToken: 'a-refresh-2', user });
  await first;
  assert.equal(saves, 0);
  assert.equal(getAuthSession().user.id, 'account-b');
});

async function bootstrapHarness(environment, serviceWorker, reload) {
  globalThis.__componentMocks = { React: { createElement: element } };
  globalThis.document = { getElementById: () => ({}) };
  window.location = {
    href: 'http://localhost:5173/', protocol: 'http:', hostname: 'localhost',
    reload,
  };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true, serviceWorker } });
  await loadComponent('src/main.jsx', {
    'react-dom/client': 'export default { createRoot: () => ({ render() {} }) };',
    'App.jsx': 'export default function App() {}',
  }, { 'import.meta.env': JSON.stringify(environment) });
}

test('DEV bootstrap removes only this application worker and releases its controlled page once', async () => {
  reset();
  let ownRemovals = 0;
  let unrelatedRemovals = 0;
  let reloads = 0;
  let registrations = 0;
  const workerUrl = 'http://localhost:5173/service-worker.js';
  const serviceWorker = new EventTarget();
  Object.assign(serviceWorker, {
    controller: { scriptURL: workerUrl },
    register: async () => { registrations += 1; },
    getRegistrations: async () => [
      { scope: 'http://localhost:5173/', active: { scriptURL: workerUrl }, unregister: async () => { ownRemovals += 1; return true; } },
      { scope: 'http://localhost:5173/other/', active: { scriptURL: workerUrl }, unregister: async () => { unrelatedRemovals += 1; return true; } },
      { scope: 'http://localhost:5173/', active: { scriptURL: 'http://localhost:5173/other-worker.js' }, unregister: async () => { unrelatedRemovals += 1; return true; } },
    ],
  });
  await bootstrapHarness({ DEV: true, PROD: false }, serviceWorker, () => { reloads += 1; });
  await until(() => reloads === 1);
  assert.equal(ownRemovals, 1);
  assert.equal(unrelatedRemovals, 0);
  assert.equal(registrations, 0);
});

test('DEV bootstrap with no application worker preserves unrelated registrations without reloading', async () => {
  reset();
  let removals = 0;
  let checks = 0;
  let reloads = 0;
  const serviceWorker = new EventTarget();
  Object.assign(serviceWorker, {
    controller: { scriptURL: 'http://localhost:5173/other-worker.js' },
    getRegistrations: async () => {
      checks += 1;
      return [{ scope: 'http://localhost:5173/', active: serviceWorker.controller, unregister: async () => { removals += 1; return true; } }];
    },
  });
  await bootstrapHarness({ DEV: true, PROD: false }, serviceWorker, () => { reloads += 1; });
  await until(() => checks === 1);
  await tick();
  assert.equal(removals, 0);
  assert.equal(reloads, 0);
});

test('production bootstrap registers and updates the application worker after page load', async () => {
  reset();
  const calls = [];
  let checks = 0;
  let updates = 0;
  let reloads = 0;
  const serviceWorker = new EventTarget();
  Object.assign(serviceWorker, {
    controller: null,
    getRegistrations: async () => { checks += 1; return []; },
    register: async (...args) => {
      calls.push(args);
      return { scope: 'http://localhost:5173/', update: async () => { updates += 1; } };
    },
  });
  await bootstrapHarness({ DEV: false, PROD: true }, serviceWorker, () => { reloads += 1; });
  assert.equal(calls.length, 0);
  window.dispatchEvent(new Event('load'));
  await until(() => updates === 1);
  assert.equal(checks, 0);
  assert.deepEqual(calls, [['/service-worker.js', { updateViaCache: 'none' }]]);
  serviceWorker.dispatchEvent(new Event('controllerchange'));
  assert.equal(reloads, 0);
  serviceWorker.dispatchEvent(new Event('controllerchange'));
  assert.equal(reloads, 1);
});
