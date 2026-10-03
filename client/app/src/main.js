import { createApp } from 'vue';
import { createPinia } from 'pinia';
import router from '@/router/index.js';
import App from '@/App.vue';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((error) => {
      console.warn('Service Worker registration failed.', error);
    });
  });
}
