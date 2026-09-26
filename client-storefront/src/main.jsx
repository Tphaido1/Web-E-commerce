import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Đăng ký Service Worker cho Progressive Web App (PWA)
if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then((reg) => {
        console.log('✅ [PWA] Service Worker đăng ký thành công:', reg.scope);
      })
      .catch((err) => {
        console.warn('⚠️ [PWA] Đăng ký Service Worker thất bại:', err);
      });
  });
}
