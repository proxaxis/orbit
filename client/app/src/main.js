import { createApp } from 'vue';
import { createPinia } from 'pinia';
import router from '@/router/index.js';
import App from '@/App.vue';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');

if (import.meta.env.MODE !== 'development' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((error) => {
      console.warn('Service Worker registration failed.', error);
    });
  });
} else if ('serviceWorker' in navigator) {
  // 開発中は古い Service Worker とそのキャッシュを残さない。
  window.addEventListener('load', async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
    }
  });
}
