import { defineBoot } from '#q-app';
import { registerServiceWorker } from '@/composables/useCache.js';
import { initAnalytics } from '@/services/analytics.js';

/**
 * アプリ起動時の初期化。
 * - アクセス解析(GTM/GA4, 未設定時は no-op)
 * - バックグラウンド処理(通知・オフラインキュー・共有同期)を担う Service Worker の登録
 */
export default defineBoot(() => {
  initAnalytics();
  registerServiceWorker();
});
