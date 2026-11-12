import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';

/**
 * Service Worker（src/sw.js）専用のバンドル設定。
 * `vite build` の後に `vite build --config vite.sw.config.js` で実行し、
 * dayjs や共有モジュールを同梱した単一ファイルを dist/sw.js として出力する。
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    // アプリ本体のビルド成果物を消さないよう上書きのみ行う
    emptyOutDir: false,
    copyPublicDir: false,
    minify: 'oxc',
    rollupOptions: {
      input: fileURLToPath(new URL('./src/sw.js', import.meta.url)),
      output: {
        format: 'iife',
        entryFileNames: 'sw.js',
      },
    },
  },
});
