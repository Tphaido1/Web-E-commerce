// Giả lập Google Identity Services (nút Google + One Tap) cho trang Đăng nhập/Đăng ký storefront.
// Chạy: npm test (cần devDependency jsdom: npm i -D jsdom). Đặt tại client-storefront/tests/.
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import axios from 'axios';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT_ID = 'test-client.apps.googleusercontent.com';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:5173/login', pretendToBeVisual: true });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
globalThis.Event = dom.window.Event; // jsdom chỉ nhận Event của chính nó khi dispatchEvent
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;

// Mọi request tới API đi qua adapter giả
const requests = [];
let respond = () => ({ status: 200, data: {} });
axios.defaults.adapter = async (config) => {
  requests.push({ method: config.method, url: config.url, body: config.data ? JSON.parse(config.data) : undefined });
  const r = respond(config);
  const response = { config, headers: {}, statusText: String(r.status), ...r };
  if (r.status >= 400) throw new axios.AxiosError('failed', 'ERR_BAD_REQUEST', config, {}, response);
  return response;
};

async function loadAuthForm(clientId) {
  const out = path.join(root, `tests/.tmp-authform-${clientId ? 'id' : 'noid'}.mjs`);
  const result = await build({
    entryPoints: [path.join(root, 'src/components/AuthForm/AuthForm.jsx')], bundle: true, write: false,
    platform: 'node', format: 'esm', jsx: 'automatic', loader: { '.css': 'empty' },
    external: ['react', 'react-dom', 'react-router-dom', 'axios', 'react/jsx-runtime'],
    define: { 'import.meta.env': JSON.stringify({ VITE_API_BASE_URL: 'http://localhost:5000/api/v1', VITE_GOOGLE_CLIENT_ID: clientId }) },
  });
  await fs.writeFile(out, result.outputFiles[0].text);
  const mod = await import(pathToFileURL(out).href);
  await fs.rm(out);
  return mod.default;
}

const React = await import('react');
const { act } = React;
const { createRoot } = await import('react-dom/client');
const { MemoryRouter, Routes, Route } = await import('react-router-dom');
const { getAuthSession } = await import('../src/services/authSession.js');
const AuthForm = await loadAuthForm(CLIENT_ID);
const AuthFormNoId = await loadAuthForm('');

function installGoogle() {
  const calls = { initialize: [], renderButton: [], prompt: 0, cancel: 0 };
  window.google = { accounts: { id: {
    initialize: (options) => calls.initialize.push(options),
    renderButton: (element, options) => calls.renderButton.push({ element, options }),
    prompt: () => { calls.prompt += 1; },
    cancel: () => { calls.cancel += 1; },
    disableAutoSelect: () => {},
  } } };
  return calls;
}

async function mount(Component = AuthForm, mode = 'login') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const rootNode = createRoot(container);
  const h = React.createElement;
  await act(async () => {
    rootNode.render(h(MemoryRouter, { initialEntries: ['/login'] }, h(Routes, null,
      h(Route, { path: '/login', element: h(Component, { mode }) }),
      h(Route, { path: '/', element: h('p', { id: 'home' }, 'HOME') }))));
  });
  return { container, unmount: () => act(async () => rootNode.unmount()) };
}

const googleOk = () => ({ status: 200, data: { data: {
  user: { id: 'u1', email: 'student@gmail.com', name: 'Student', role: 'customer' },
  accessToken: 'access-1', refreshToken: 'refresh-1' } } });

beforeEach(() => {
  document.body.innerHTML = '';
  delete window.google;
  localStorage.clear(); sessionStorage.clear();
  requests.length = 0;
  respond = () => ({ status: 200, data: {} });
});

test('OT-01: Hiện nút Google và bật One Tap đúng 1 lần với đúng Client ID', async () => {
  const calls = installGoogle();
  const view = await mount();
  assert.equal(calls.initialize.length, 1);
  assert.equal(calls.initialize[0].client_id, CLIENT_ID);
  assert.equal(typeof calls.initialize[0].callback, 'function');
  assert.equal(calls.renderButton.length, 1);
  assert.ok(view.container.contains(calls.renderButton[0].element), 'nút Google phải nằm trong form đăng nhập');
  assert.equal(calls.prompt, 1);
});

test('OT-02: Nhận credential từ One Tap -> gọi POST /auth/google, lưu phiên, chuyển về trang chủ', async () => {
  const calls = installGoogle();
  respond = googleOk;
  const view = await mount();
  await act(async () => { await calls.initialize[0].callback({ credential: 'GOOGLE.ID.TOKEN' }); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); }); // chờ router chuyển trang
  assert.deepEqual(requests.map((r) => [r.method, r.url, r.body]), [['post', '/auth/google', { idToken: 'GOOGLE.ID.TOKEN' }]]);
  assert.equal(getAuthSession()?.accessToken, 'access-1');
  assert.ok(view.container.querySelector('#home'), 'phải điều hướng tới trang chủ');
});

test('OT-03: Callback bị gọi 2 lần liên tiếp (One Tap + nút) -> chỉ gửi 1 request', async () => {
  const calls = installGoogle();
  respond = googleOk;
  await mount();
  await act(async () => {
    const cb = calls.initialize[0].callback;
    await Promise.all([cb({ credential: 't' }), cb({ credential: 't' })]);
  });
  assert.equal(requests.length, 1);
});

test('OT-04: Server từ chối (403 tài khoản bị khóa) -> hiện lỗi, KHÔNG lưu phiên, không chuyển trang', async () => {
  const calls = installGoogle();
  respond = () => ({ status: 403, data: { message: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.' } });
  const view = await mount();
  await act(async () => { await calls.initialize[0].callback({ credential: 't' }); });
  assert.match(view.container.querySelector('[role="alert"]')?.textContent || '', /bị khóa/);
  assert.equal(getAuthSession(), null);
  assert.equal(view.container.querySelector('#home'), null);
});

test('OT-05: Callback không có credential (người dùng đóng One Tap) -> không gửi request', async () => {
  const calls = installGoogle();
  await mount();
  await act(async () => { await calls.initialize[0].callback({}); });
  assert.equal(requests.length, 0);
});

test('OT-06: Chưa tải script Google -> tự chèn thẻ script gsi/client, tải xong mới khởi tạo', async () => {
  await mount();
  const script = document.getElementById('google-gsi-script');
  assert.ok(script, 'phải chèn script');
  assert.equal(script.src, 'https://accounts.google.com/gsi/client');
  const calls = installGoogle();
  await act(async () => { script.onload(); });
  assert.equal(calls.initialize.length, 1);
  assert.equal(calls.prompt, 1);
});

test('OT-07: Không có VITE_GOOGLE_CLIENT_ID -> không tải script, không hiện One Tap', async () => {
  const calls = installGoogle();
  await mount(AuthFormNoId);
  assert.equal(calls.initialize.length, 0);
  assert.equal(calls.prompt, 0);
  assert.equal(document.getElementById('google-gsi-script'), null);
});

test('OT-08: Tick/bỏ tick "Ghi nhớ đăng nhập" KHÔNG được khởi tạo lại Google hay bật lại One Tap', async () => {
  const calls = installGoogle();
  const view = await mount();
  const checkbox = view.container.querySelector('input[type="checkbox"]');
  await act(async () => { checkbox.click(); });
  await act(async () => { checkbox.click(); });
  assert.equal(calls.initialize.length, 1, `initialize bị gọi ${calls.initialize.length} lần`);
  assert.equal(calls.prompt, 1, `prompt (One Tap) bị gọi ${calls.prompt} lần`);
});

test('OT-09: Rời trang đăng nhập phải đóng One Tap (google.accounts.id.cancel)', async () => {
  const calls = installGoogle();
  const view = await mount();
  await view.unmount();
  assert.ok(calls.cancel >= 1, 'One Tap vẫn còn treo sau khi rời trang');
});

