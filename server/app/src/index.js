/**
 * Orbit Calendar BFF — アプリのエントリポイント。
 * 役割は Hono アプリの生成、CORS、ルート登録、バックグラウンド
 * スケジューラの起動、および直接実行時のサーバー起動のみ。
 * 定数は src/assets/constants.js、共有ロジックは src/services/、
 * ルートは src/routes/、共有型は src/env.d.ts を参照
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { env, SESSION_SECRET } from '@/assets/constants.js';
import { redis } from '@/services/redis.js';
import { realm, createSession, upsertUser, upsertGrant, getGrant } from '@/services/realm.js';
import { drainDuePushNotifications, schedulePushDrain } from '@/services/push.js';
import { drainApiRequests, scheduleApiRequestDrain } from '@/services/api-request-queue.js';

import { registerLoginRoutes } from '@/routes/login.js';
import { registerLoginResultRoutes } from '@/routes/login-result.js';
import { registerAuthRoutes } from '@/routes/auth.js';
import { registerEnableRoutes } from '@/routes/enable.js';
import { registerApiTokenRoutes } from '@/routes/api-token.js';
import { registerRequestRoutes } from '@/routes/request.js';
import { registerPushRoutes } from '@/routes/push.js';
import { registerLocationRoutes } from '@/routes/location.js';
import { registerLogoutRoutes } from '@/routes/logout.js';

/** @type {AppHono} */
const app = new Hono();

// CORS 設定（Vite 開発サーバーからの Cookie 送信を許可）
app.use(
  '*',
  cors({
    origin: env.VITE_CLIENT_APP_BASE_URL,
    credentials: true,
  })
);

registerLoginRoutes(app);
registerLoginResultRoutes(app);
registerAuthRoutes(app);
registerEnableRoutes(app);
registerApiTokenRoutes(app);
registerRequestRoutes(app);
registerPushRoutes(app);
registerLocationRoutes(app);
registerLogoutRoutes(app);

// バックグラウンドワーカー起動（Push 送信スケジューラ / API リクエストキュー）
schedulePushDrain(0);
scheduleApiRequestDrain(0);

// テストからルーティングと REALM を検証できるようエクスポート
export {
  app,
  redis,
  realm,
  SESSION_SECRET,
  drainDuePushNotifications,
  drainApiRequests,
  createSession,
  upsertUser,
  upsertGrant,
  getGrant,
};

// サーバー起動は src/serve.js が担う（このモジュールは import されても起動しない）
