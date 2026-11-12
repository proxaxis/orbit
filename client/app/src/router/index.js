import { createMemoryHistory, createRouter, createWebHashHistory, createWebHistory } from 'vue-router';
import routes from './routes.js';
import { takePendingShareAccept } from '@/services/share-accept.js';
import { trackPageView } from '@/services/analytics.js';

// SSR を使わないためルータインスタンスを直接生成して export する
// (composables からの import router での遷移や vitest での利用を維持するため)
const createHistory = import.meta.env.QUASAR_SERVER ? createMemoryHistory : import.meta.env.QUASAR_VUE_ROUTER_MODE === 'history' ? createWebHistory : createWebHashHistory;

const router = createRouter({
  scrollBehavior: () => ({ left: 0, top: 0 }),
  routes,

  // history モードは quasar.config.js -> build -> vueRouterMode で切り替える
  // (Capacitor は hash, Web は history)
  history: createHistory(import.meta.env.QUASAR_VUE_ROUTER_BASE),
});

// 未ログインで共有受け入れリンクを開いた場合に備え、ログイン後のホーム遷移を受け入れ画面へ戻す
router.beforeEach((to) => {
  if (to.name !== 'Home') return true;
  const pending = takePendingShareAccept();
  if (!pending) return true;
  return { name: 'ShareAccept', query: { cid: pending.cid, ...(pending.mode === 'list' ? { mode: 'list' } : {}) }, replace: true };
});

// SPA のページビュー計測(GA4 未設定時は no-op)
router.afterEach((to) => {
  trackPageView(to.path, String(to.name ?? document.title));
});

export default router;
