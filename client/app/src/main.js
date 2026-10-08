import { createApp } from 'vue';
import { createPinia } from 'pinia';
import router from '@/router/index.js';
import App from '@/App.vue';
import { registerServiceWorker } from '@/composables/useCache.js';
import twemoji from '@twemoji/api';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');

// バックグラウンド処理（通知・オフラインキュー・共有同期）を担う Service Worker を登録する
registerServiceWorker();
