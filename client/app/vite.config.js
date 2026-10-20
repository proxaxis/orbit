/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueDevTools from 'vite-plugin-vue-devtools';

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [...(mode === 'development' ? [vueDevTools()] : []), vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.js'],
  },
  server: {
    allowedHosts: ['orbit.proxaxis.me'],
    ...(mode === 'development' ? { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } } : {}),
    host: true,
    port: (mode === 'production') ? 15173 : 15173,
  },
}));
