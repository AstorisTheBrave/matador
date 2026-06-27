import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the built SPA works when the control plane serves it from any path.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
  // Dev convenience: proxy API calls to a locally running control plane.
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:4319',
      '/healthz': 'http://127.0.0.1:4319',
      '/readyz': 'http://127.0.0.1:4319',
    },
  },
});
