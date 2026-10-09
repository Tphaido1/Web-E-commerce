import test from 'node:test';
import assert from 'node:assert/strict';
import { createToastStore } from '../src/services/toastStore.js';
import { validateDeploymentApiUrl } from '../scripts/deployment-env.mjs';

function clock() {
  let current = 0;
  let sequence = 0;
  const timers = new Map();
  return {
    now: () => current,
    schedule(fn, delay) { const id = ++sequence; timers.set(id, { fn, due: current + delay }); return id; },
    cancel(id) { timers.delete(id); },
    advance(ms) {
      current += ms;
      for (const [id, timer] of timers) if (timer.due <= current) { timers.delete(id); timer.fn(); }
    },
    pending: () => timers.size,
  };
}

test('toasts automatically expire, deduplicate active/recent messages, and allow new later feedback', () => {
  const time = clock();
  const store = createToastStore(time);
  const updates = [];
  const unsubscribe = store.subscribe((items) => updates.push(items));
  const id = store.success('Added to cart');
  assert.equal(store.success('Added to cart'), id);
  assert.equal(store.getSnapshot().length, 1);
  store.dismiss(id);
  assert.equal(store.success('Added to cart'), null);
  time.advance(2000);
  assert.ok(store.success('Added to cart'));
  time.advance(6000);
  assert.equal(store.getSnapshot().length, 0);
  assert.equal(time.pending(), 0);
  unsubscribe();
  assert.ok(updates.length >= 4);
});

test('hover and keyboard focus independently pause toast dismissal and preserve remaining time', () => {
  const time = clock();
  const store = createToastStore(time);
  const id = store.error('Unable to submit order');
  time.advance(3000);
  store.pause(id, 'hover');
  store.pause(id, 'focus');
  time.advance(20000);
  store.resume(id, 'hover');
  assert.equal(time.pending(), 0);
  assert.equal(store.getSnapshot().length, 1);
  store.resume(id, 'focus');
  time.advance(4999);
  assert.equal(store.getSnapshot().length, 1);
  time.advance(1);
  assert.equal(store.getSnapshot().length, 0);
});

test('toast limits clear evicted timers, manual persistent toasts dismiss, and provider cleanup clears timers', () => {
  const time = clock();
  const store = createToastStore({ ...time, maxVisible: 2 });
  store.info('One');
  store.error('Two');
  const persistent = store.success('Three', { duration: 0 });
  assert.deepEqual(store.getSnapshot().map((item) => item.message), ['Two', 'Three']);
  assert.equal(time.pending(), 1);
  time.advance(10000);
  assert.deepEqual(store.getSnapshot().map((item) => item.id), [persistent]);
  store.dismiss(persistent);
  store.info('Four');
  store.clear();
  assert.equal(time.pending(), 0);
  assert.deepEqual(store.getSnapshot(), []);
});

test('deployment preflight rejects missing, relative, insecure, private, credentialed, and example APIs', () => {
  for (const url of [undefined, '', '/api/v1', 'http://api.shop.vn/api/v1', 'https://localhost/api/v1',
    'https://127.0.0.1/api/v1', 'https://[::1]/api/v1', 'https://10.0.0.1/api/v1',
    'https://192.168.1.3/api/v1', 'https://100.64.1.1/api/v1', 'https://198.18.0.1/api/v1',
    'https://192.0.2.1/api/v1', 'https://198.51.100.1/api/v1', 'https://203.0.113.1/api/v1',
    'https://224.0.0.1/api/v1', 'https://api.local./api/v1', 'https://api.internal/api/v1',
    'https://[::ffff:7f00:1]/api/v1', 'https://[fd00::1]/api/v1', 'https://[2001:db8::1]/api/v1',
    'https://api.example.com/api/v1', 'https://api.invalid/api/v1',
    'https://user:password@api.shop.vn/api/v1', 'https://api.shop.vn/api/v1?token=value', 'https://api.shop.vn/wrong']) {
    assert.throws(() => validateDeploymentApiUrl(url));
  }
  assert.equal(validateDeploymentApiUrl(' https://api.shop.vn/api/v1/ '), 'https://api.shop.vn/api/v1');
});
