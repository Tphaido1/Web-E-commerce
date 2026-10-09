import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Đăng ký Service Worker cho bản production; Vite dùng URL module chưa có hash.
if ('serviceWorker' in navigator) {
  const workerUrl = new URL('/service-worker.js', window.location.href).href;
  const workerScope = new URL('/', window.location.href).href;

  if (import.meta.env.DEV) {
    navigator.serviceWorker.getRegistrations()
      .then(async (registrations) => {
        const ownRegistrations = registrations.filter((registration) => (
          registration.scope === workerScope
          && [registration.active, registration.waiting, registration.installing]
            .some((worker) => worker?.scriptURL === workerUrl)
        ));
        const removed = await Promise.all(ownRegistrations.map((registration) => registration.unregister()));
        // Unregistering leaves the current document controlled until navigation.
        if (removed.some(Boolean) && navigator.serviceWorker.controller?.scriptURL === workerUrl) {
          window.location.reload();
        }
      })
      .catch((err) => console.warn('[PWA] Unable to remove the development service worker:', err));
  } else if (
    import.meta.env.PROD
    && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ) {
    window.addEventListener('load', () => {
      let hadController = Boolean(navigator.serviceWorker.controller);
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hadController) {
          window.location.reload();
          return;
        }
        hadController = true;
      });

      navigator.serviceWorker
        .register('/service-worker.js', { updateViaCache: 'none' })
        .then((reg) => {
          console.log('[PWA] Service Worker registered:', reg.scope);
          reg.update().catch((err) => {
            console.warn('[PWA] Service Worker update check failed:', err);
          });
        })
        .catch((err) => {
          console.warn('[PWA] Service Worker registration failed:', err);
        });
    });
  }
}
