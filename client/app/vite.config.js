/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueDevTools from 'vite-plugin-vue-devtools';
const isProduction = process.env.NODE_ENV === 'production';

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [...(isProduction ? [] : [vueDevTools()]), vue()],
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
    ...(isProduction ? {} : { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }),
    host: true,
    port: isProduction ? 15173 : 5173,
  },
}));
