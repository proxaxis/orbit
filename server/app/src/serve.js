/**
 * サーバー起動エントリ。常に HTTP サーバーを起動する。
 * dev（vite-node --watch）と本番（vite build → dist/index.js）の
 * 両方からこのファイルをエントリとして使う。
 * アプリだけを import したい場合（テスト等）は ./index.js を使う
 */
import { serve } from '@hono/node-server';
import { env } from '@/assets/constants.js';
import { app } from '@/index.js';

const port = env.BFF_APP_PORT || 8787;

console.log(`Server is running on ${port}`);

serve({
  fetch: app.fetch,
  port,
  hostname: '0.0.0.0',
});
