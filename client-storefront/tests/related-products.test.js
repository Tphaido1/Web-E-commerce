// These regressions exercise the actual service and compiled React component with
// controlled transport/hooks. Browser acceptance separately checks real API/layout.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let moduleCounter = 0;
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const element = (type, props, ...children) => ({ type, props: { ...props, children } });
function findAll(tree, predicate) {
  if (!tree || typeof tree !== 'object') return [];
  return [
    ...(predicate(tree) ? [tree] : []),
    ...(tree.props?.children?.flat(Infinity) || []).flatMap((child) => findAll(child, predicate)),
  ];
}
function textContent(tree) {
  if (tree === null || tree === undefined || typeof tree === 'boolean') return '';
  if (typeof tree !== 'object') return String(tree);
  return (tree.props?.children?.flat(Infinity) || []).map(textContent).join(' ');
}
const cards = (tree) => findAll(tree, (node) => node.type === 'product-card');
const product = (id, category = 'Shoes', extra = {}) => ({
  _id: id, name: id, category, price: 100, stock: 2, isActive: true, ...extra,
});

async function compile(relativeFile, mocks) {
  const result = await build({
    entryPoints: [path.join(root, relativeFile)], bundle: true, write: false,
    platform: 'node', format: 'esm', jsx: 'transform', jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment', banner: { js: 'const React = globalThis.__relatedMocks.React;' },
    plugins: [{
      name: 'related-products-regression-mocks',
      setup(builder) {
        builder.onResolve({ filter: /./ }, (args) => {
          if (args.kind === 'entry-point') return undefined;
          if (args.path.endsWith('.css')) return { path: args.path, namespace: 'empty-style' };
          const match = Object.keys(mocks).find((name) => args.path === name || args.path.endsWith(name));
          if (match) return { path: match, namespace: 'regression-mock' };
        });
        builder.onLoad({ filter: /./, namespace: 'empty-style' }, () => ({ contents: '', loader: 'js' }));
        builder.onLoad({ filter: /./, namespace: 'regression-mock' }, (args) => ({
          contents: mocks[args.path], loader: 'js',
        }));
      },
    }],
  });
  const url = 'data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64') + '#' + moduleCounter++;
  return import(url);
}

async function serviceHarness({ request, cached = null, auth = null } = {}) {
  const calls = [];
  const reads = [];
  const writes = [];
  globalThis.__relatedMocks = {
    auth,
    get: async (url, options) => {
      calls.push({ url, ...options });
      return request?.(url, options) ?? { data: { data: { products: [] } }, headers: {} };
    },
    read: async (key) => { reads.push(key); return cached; },
    write: async (key, data) => { writes.push({ key, data }); },
  };
  const service = await compile('src/services/productService.js', {
    'api.js': 'export default { get: (...args) => globalThis.__relatedMocks.get(...args) };',
    'authSession.js': 'export const getAuthSession = () => globalThis.__relatedMocks.auth;',
    'offlineDb.js': `
      export const cacheProductQuery = (...args) => globalThis.__relatedMocks.write(...args);
      export const cacheProducts = async () => {};
      export const getCachedProductQuery = (...args) => globalThis.__relatedMocks.read(...args);
      export const getCachedProducts = async () => [];
    `,
  });
  return { service, calls, reads, writes };
}

test('related service bounds the category request and filters current/duplicate/inactive/unrelated results', async () => {
  const rows = [
    product('current'), product('same'), product('same'), product('inactive', 'Shoes', { isActive: false }),
    product('unrelated', 'Bags'), { category: 'Shoes' },
    ...Array.from({ length: 8 }, (_, index) => product(`candidate-${index}`, index === 0 ? ' shoes ' : 'Shoes')),
  ];
  const { service, calls } = await serviceHarness({
    request: async () => ({ data: { data: { products: rows } }, headers: {} }),
  });
  const controller = new AbortController();
  const result = await service.getRelatedProducts(product('current', ' Shoes '), { signal: controller.signal });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/products');
  assert.deepEqual(calls[0].params, { category: 'Shoes', page: 1, limit: 7 });
  assert.equal(calls[0].signal, controller.signal);
  assert.deepEqual(result.products.map((entry) => entry._id), [
    'same', 'candidate-0', 'candidate-1', 'candidate-2', 'candidate-3', 'candidate-4',
  ]);
  assert.equal(result.isCached, false);
});

test('related service makes no catalog request without both product identity and category', async () => {
  const { service, calls } = await serviceHarness();
  for (const value of [null, {}, product('current', ''), product('current', '   '), { category: 'Shoes' }]) {
    assert.deepEqual(await service.getRelatedProducts(value), { products: [], isCached: false });
  }
  assert.equal(calls.length, 0);
});

test('related service uses the existing exact category-query cache on network failure and filters cached rows', async () => {
  const failure = new Error('Network unavailable');
  const { service, reads } = await serviceHarness({
    request: async () => { throw failure; },
    cached: { data: { products: [product('current'), product('cached'), product('inactive', 'Shoes', { isActive: false }), product('other', 'Bags')] } },
  });
  const result = await service.getRelatedProducts(product('current'));
  assert.equal(reads.length, 1);
  assert.equal(reads[0], 'products:category=Shoes&limit=7&page=1');
  assert.deepEqual(result.products.map((entry) => entry._id), ['cached']);
  assert.equal(result.isCached, true);
});

test('related service preserves service-worker cache status for successful bounded requests', async () => {
  const { service } = await serviceHarness({
    request: async () => ({ data: { data: { products: [product('related')] } }, headers: { 'x-offline-cache': 'hit' } }),
  });
  const result = await service.getRelatedProducts(product('current'));
  assert.equal(result.products[0]._id, 'related');
  assert.equal(result.isCached, true);
});

test('related service propagates HTTP failures and offline cache misses instead of downloading the whole catalog', async () => {
  const httpFailure = Object.assign(new Error('Unavailable'), { response: { status: 500 } });
  const http = await serviceHarness({ request: async () => { throw httpFailure; }, cached: { data: { products: [product('cached')] } } });
  await assert.rejects(http.service.getRelatedProducts(product('current')), (error) => error === httpFailure);
  assert.equal(http.reads.length, 0);
  assert.equal(http.calls.length, 1);
  const offlineFailure = new Error('Network unavailable');
  const offline = await serviceHarness({ request: async () => { throw offlineFailure; } });
  await assert.rejects(offline.service.getRelatedProducts(product('current')), (error) => error === offlineFailure && error.offlineCacheMiss === true);
  assert.equal(offline.calls.length, 1);
});

test('related service does not turn a canceled request into cached recommendations', async () => {
  const canceled = Object.assign(new Error('Canceled'), { name: 'CanceledError', code: 'ERR_CANCELED' });
  const { service, reads } = await serviceHarness({ request: async () => { throw canceled; }, cached: { data: { products: [product('cached')] } } });
  await assert.rejects(service.getRelatedProducts(product('current')), (error) => error === canceled);
  assert.equal(reads.length, 0);
});

test('authenticated related requests do not reuse guest IndexedDB query data on a network failure', async () => {
  const failure = new Error('Network unavailable');
  const { service, reads } = await serviceHarness({
    request: async () => { throw failure; }, auth: { user: { id: 'account' } },
    cached: { data: { products: [product('guest-cache')] } },
  });
  await assert.rejects(service.getRelatedProducts(product('current')), (error) => error === failure);
  assert.equal(reads.length, 0);
});

// A small persistent hook driver runs the actual compiled component across
// renders, effect cleanup, URL/product changes, and deliberately late promises.
const reactMock = `
  export const useState = (...args) => globalThis.__relatedMocks.hooks.state(...args);
  export const useRef = (...args) => globalThis.__relatedMocks.hooks.ref(...args);
  export const useEffect = (...args) => globalThis.__relatedMocks.hooks.effect(...args);
  export const useMemo = (factory) => factory();
  export const useCallback = (callback) => callback;
`;
async function componentHarness(request, entry = 'src/components/RelatedProducts/RelatedProducts.jsx', extraMocks = {}) {
  const calls = [];
  const slots = [];
  let cursor = 0;
  let queued = [];
  let dirty = false;
  let updates = 0;
  const hooks = {
    state(initial) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, (next) => {
        slots[index].value = typeof next === 'function' ? next(slots[index].value) : next;
        updates += 1;
        dirty = true;
      }];
    },
    ref(initial) {
      const index = cursor++;
      slots[index] ??= { current: initial };
      return slots[index];
    },
    effect(callback, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || !deps || deps.some((value, position) => !Object.is(value, previous.deps?.[position]))) {
        queued.push({ index, callback, deps });
      }
    },
  };
  globalThis.__relatedMocks = {
    React: { createElement: element, Fragment: 'fragment' }, hooks,
    getRelated: (value, options) => { calls.push({ product: value, ...options }); return request(value, options); },
  };
  const component = await compile(entry, {
    react: reactMock,
    'ProductCard.jsx': 'export default "product-card";',
    'productService.js': 'export const getRelatedProducts = (...args) => globalThis.__relatedMocks.getRelated(...args);',
    ...extraMocks,
  });
  const renderOnly = (props) => {
    cursor = 0;
    queued = [];
    dirty = false;
    return component.default(props);
  };
  const commit = () => {
    for (const { index, callback, deps } of queued) {
      slots[index]?.cleanup?.();
      slots[index] = { deps, cleanup: callback() };
    }
    queued = [];
  };
  return {
    calls, renderOnly, commit,
    get updates() { return updates; },
    render(props) {
      let tree;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        tree = renderOnly(props);
        commit();
        if (!dirty) return tree;
      }
      throw new Error('Component effect repeatedly changed state');
    },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

test('related component shows skeletons, then the Vietnamese title and reusable cards', async () => {
  const waiting = deferred();
  const harness = await componentHarness(() => waiting.promise);
  const props = { product: product('current') };
  const loading = harness.render(props);
  assert.match(textContent(loading), /Sản phẩm cùng loại/);
  assert.equal(cards(loading).length, 0);
  assert.ok(findAll(loading, (node) => /skeleton/.test(node.props.className || '')).length > 0);
  assert.equal(harness.calls.length, 1);
  waiting.resolve({ products: [product('related')], isCached: false });
  await tick();
  const ready = harness.render(props);
  assert.equal(cards(ready).length, 1);
  assert.equal(cards(ready)[0].props.product._id, 'related');
  assert.equal(findAll(ready, (node) => /skeleton/.test(node.props.className || '')).length, 0);
  harness.unmount();
});

test('related component hides missing-category and successfully empty recommendations', async () => {
  const missing = await componentHarness(async () => { assert.fail('Missing category fetched recommendations'); });
  assert.equal(missing.render({ product: product('current', '') }), null);
  assert.equal(missing.calls.length, 0);
  missing.unmount();
  const empty = await componentHarness(async () => ({ products: [], isCached: false }));
  const props = { product: product('current') };
  empty.render(props);
  await tick();
  assert.equal(empty.render(props), null);
  empty.unmount();
});

test('related component isolates failures and retry loads recommendations successfully', async () => {
  let count = 0;
  const harness = await componentHarness(async () => {
    count += 1;
    if (count === 1) throw new Error('Recommendations unavailable');
    return { products: [product('recovered')], isCached: false };
  });
  const props = { product: product('current') };
  harness.render(props);
  await tick();
  const failed = harness.render(props);
  assert.equal(cards(failed).length, 0);
  const retry = findAll(failed, (node) => node.type === 'button')[0];
  assert.ok(retry, 'Recommendation errors must offer an isolated retry');
  retry.props.onClick();
  harness.render(props);
  await tick();
  const recovered = harness.render(props);
  assert.equal(harness.calls.length, 2);
  assert.equal(cards(recovered)[0].props.product._id, 'recovered');
  harness.unmount();
});

test('changing products hides previous cards immediately and ignores late old-category responses', async () => {
  const oldRequest = deferred();
  const newRequest = deferred();
  const harness = await componentHarness((value) => value._id === 'first' ? oldRequest.promise : newRequest.promise);
  const first = { product: product('first', 'Shoes') };
  const second = { product: product('second', 'Bags') };
  harness.render(first);
  const changed = harness.renderOnly(second);
  assert.equal(cards(changed).length, 0);
  harness.commit();
  assert.equal(harness.calls[0].signal.aborted, true);
  assert.equal(harness.calls[1].product._id, 'second');
  newRequest.resolve({ products: [product('new-related', 'Bags')], isCached: false });
  await tick();
  assert.equal(cards(harness.render(second))[0].props.product._id, 'new-related');
  oldRequest.resolve({ products: [product('stale-related')], isCached: false });
  await tick();
  assert.deepEqual(cards(harness.render(second)).map((card) => card.props.product._id), ['new-related']);
  harness.unmount();
});

test('ready recommendations are never shown for a newly selected product before its effect runs', async () => {
  const harness = await componentHarness(async (value) => ({ products: [product(`related-${value._id}`, value.category)], isCached: false }));
  const first = { product: product('first') };
  harness.render(first);
  await tick();
  assert.equal(cards(harness.render(first))[0].props.product._id, 'related-first');
  const changed = harness.renderOnly({ product: product('second') });
  assert.equal(cards(changed).length, 0);
  harness.unmount();
});

test('recommendation cleanup aborts requests and prevents post-unmount state updates', async () => {
  const pending = deferred();
  const harness = await componentHarness(() => pending.promise);
  harness.render({ product: product('current') });
  harness.unmount();
  assert.equal(harness.calls[0].signal.aborted, true);
  const updates = harness.updates;
  pending.resolve({ products: [product('late')], isCached: false });
  await tick();
  assert.equal(harness.updates, updates);
});

test('canceled recommendation errors do not produce retry/error UI after a product change', async () => {
  const previous = deferred();
  const harness = await componentHarness((value) => value._id === 'first'
    ? previous.promise : Promise.resolve({ products: [product('second-related')], isCached: false }));
  harness.render({ product: product('first') });
  const second = { product: product('second') };
  harness.render(second);
  previous.reject(Object.assign(new Error('Canceled old request'), { name: 'CanceledError', code: 'ERR_CANCELED' }));
  await tick();
  const tree = harness.render(second);
  assert.equal(cards(tree)[0].props.product._id, 'second-related');
  assert.equal(findAll(tree, (node) => node.type === 'button').length, 0);
  harness.unmount();
});

test('actual product detail mounts recommendations only for the product loaded for the current route', async () => {
  const firstRequest = deferred();
  const secondRequest = deferred();
  const detailRequests = [];
  const harness = await componentHarness(async () => ({ products: [], isCached: false }), 'src/pages/ProductDetail/ProductDetail.jsx', {
    'react-router-dom': 'export const Link = "a"; export const useParams = () => ({ id: globalThis.__relatedMocks.routeId });',
    'Header.jsx': 'export default "header";',
    'Footer.jsx': 'export default "footer";',
    'ProductReviews.jsx': 'export default "product-reviews";',
    'RelatedProducts.jsx': 'export default "related-products";',
    'CartContext.jsx': 'export const useCart = () => ({ addItem: async () => true });',
    'productService.js': 'export const getProductById = (...args) => globalThis.__relatedMocks.getDetail(...args);',
  });
  globalThis.__relatedMocks.routeId = 'first';
  globalThis.__relatedMocks.getDetail = (id, options) => {
    detailRequests.push({ id, ...options });
    return id === 'first' ? firstRequest.promise : secondRequest.promise;
  };
  assert.equal(findAll(harness.render(), (node) => node.type === 'related-products').length, 0);
  firstRequest.resolve({ product: product('first'), isCached: false });
  await tick();
  const ready = harness.render();
  assert.equal(findAll(ready, (node) => node.type === 'related-products')[0].props.product._id, 'first');
  globalThis.__relatedMocks.routeId = 'second';
  const changed = harness.renderOnly();
  assert.equal(findAll(changed, (node) => node.type === 'related-products').length, 0);
  harness.commit();
  assert.equal(detailRequests[0].signal.aborted, true);
  secondRequest.resolve({ product: product('second', 'Bags'), isCached: false });
  await tick();
  const next = harness.render();
  assert.equal(findAll(next, (node) => node.type === 'related-products')[0].props.product._id, 'second');
  harness.unmount();
});
