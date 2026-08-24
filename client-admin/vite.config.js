import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Cấu hình Vite cho ứng dụng Admin Dashboard
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    open: true,
  },
});
