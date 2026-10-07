/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueDevTools from 'vite-plugin-vue-devtools';

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [vue(), vueDevTools()],
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
    allowedHosts: ['orbit.proxaxis.me', '.trycloudflare.com'],
    ...(mode === 'development' ? { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } } : {}),
  },
}));
