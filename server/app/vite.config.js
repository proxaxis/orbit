import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Node.js (SSR) 向けビルド。`@` は ./src を指す
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    ssr: true,
    target: 'es2022',
    outDir: 'dist',
    rollupOptions: {
      // エントリは起動専用の serve.js（出力名は index.js に固定）
      input: { index: 'src/serve.js' },
      output: {
        entryFileNames: '[name].js',
      },
    },
  },
  ssr: {
    // node_modules はバンドルせずランタイム解決に任せる
    // （realm はネイティブモジュールを含むため必須）
    external: [
      '@hono/node-server',
      'googleapis',
      'hono',
      'ioredis',
      'realm',
      'web-push',
    ],
  },
});
