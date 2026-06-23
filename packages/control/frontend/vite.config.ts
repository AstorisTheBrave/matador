import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the built SPA works when the control plane serves it from any path.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
});
