import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  appType: 'spa',
  plugins: [react()],
  server: {
    // dedicated port (5173 is the default vite port many projects squat) so the
    // DEX dev server + e2e never collide with another local app; fail loudly if taken
    // Bind IPv4 explicitly — on some Windows setups Vite listens on ::1 only and
    // localhost/127.0.0.1 then fail to connect.
    host: '127.0.0.1',
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': {
        // Prefer 127.0.0.1 over localhost — on Windows, localhost can resolve to
        // ::1 while the API binds IPv4 only, which surfaces as AggregateError EACCES.
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'http://127.0.0.1:3001',
        ws: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    css: false,
  },
});
