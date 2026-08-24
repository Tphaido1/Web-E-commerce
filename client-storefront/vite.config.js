import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Cấu hình Vite cho ứng dụng Storefront (Khách hàng)
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
  },
});
