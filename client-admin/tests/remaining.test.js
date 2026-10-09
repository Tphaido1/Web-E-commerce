import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNotificationHistory } from '../src/services/notificationHistory.js';
import { validateDeploymentEnv } from '../scripts/deployment-env.mjs';

test('order notifications remain deduplicated across token refresh and reconnect, but clear for another login', () => {
  const history = createNotificationHistory();
  assert.equal(history.setSession('vendor-login-one'), true);
  assert.equal(history.accept({ orderId: 'order-one' }), true);
  assert.equal(history.setSession('vendor-login-one'), false);
  assert.equal(history.accept({ orderId: 'order-one' }), false);
  assert.equal(history.setSession('vendor-login-two'), true);
  assert.equal(history.accept({ orderId: 'order-one' }), true);
  assert.equal(history.setSession(null), true);
  assert.equal(history.setSession('vendor-login-two'), true);
  assert.equal(history.accept({ orderId: 'order-one' }), true);
});

test('notification history rejects unidentified events and bounds memory without forgetting recent duplicates', () => {
  const history = createNotificationHistory(2);
  history.setSession('admin-login');
  assert.equal(history.accept({}), false);
  assert.equal(history.accept(null), false);
  assert.equal(history.accept({ orderCode: 'first' }), true);
  assert.equal(history.accept({ orderCode: 'second' }), true);
  assert.equal(history.accept({ orderCode: 'third' }), true);
  assert.equal(history.accept({ orderCode: 'second' }), false);
  assert.equal(history.accept({ orderCode: 'first' }), true);
});

test('deployment accepts a public HTTPS API and an optional separate Socket.io origin', () => {
  assert.doesNotThrow(() => validateDeploymentEnv({ VITE_API_BASE_URL: 'https://nova-backend.onrender.com/api/v1' }));
  assert.doesNotThrow(() => validateDeploymentEnv({ VITE_API_BASE_URL: 'https://nova-backend.onrender.com/api/v1/', VITE_SOCKET_URL: 'https://nova-socket.onrender.com' }));
});

test('deployment blocks missing, insecure, local and placeholder API endpoints', () => {
  for (const endpoint of [undefined, '', '/api/v1', 'http://nova-backend.onrender.com/api/v1', 'https://localhost/api/v1', 'https://127.0.0.1/api/v1', 'https://10.0.0.2/api/v1', 'https://172.16.0.1/api/v1', 'https://192.168.1.20/api/v1', 'https://100.64.0.1/api/v1', 'https://198.51.100.3/api/v1', 'https://[::1]/api/v1', 'https://[::ffff:7f00:1]/api/v1', 'https://[2001:db8::1]/api/v1', 'https://api.example.com/api/v1', 'https://service.test/api/v1', 'https://api.local/api/v1', 'https://api.internal/api/v1']) {
    assert.throws(() => validateDeploymentEnv({ VITE_API_BASE_URL: endpoint }), Error, String(endpoint));
  }
});

test('deployment blocks embedded secrets, malformed prefixes and unsupported Socket.io paths', () => {
  for (const endpoint of ['https://user:secret@nova-backend.onrender.com/api/v1', 'https://nova-backend.onrender.com', 'https://nova-backend.onrender.com/api/v1?token=secret', 'https://nova-backend.onrender.com/api/v1#fragment']) assert.throws(() => validateDeploymentEnv({ VITE_API_BASE_URL: endpoint }));
  assert.throws(() => validateDeploymentEnv({ VITE_API_BASE_URL: 'https://nova-backend.onrender.com/api/v1', VITE_SOCKET_URL: 'http://localhost:5000' }));
  assert.throws(() => validateDeploymentEnv({ VITE_API_BASE_URL: 'https://nova-backend.onrender.com/api/v1', VITE_SOCKET_URL: 'https://nova-backend.onrender.com/socket.io' }));
});
