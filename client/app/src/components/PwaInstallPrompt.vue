<script setup>
import { onMounted, onUnmounted, ref } from 'vue';

const deferredPrompt = ref(null);
const isOpen = ref(false);

function handleBeforeInstallPrompt(event) {
  event.preventDefault();
  deferredPrompt.value = event;
  isOpen.value = true;
}

function dismiss() {
  isOpen.value = false;
}

async function install() {
  if (!deferredPrompt.value) return;
  const promptEvent = deferredPrompt.value;
  deferredPrompt.value = null;
  isOpen.value = false;
  await promptEvent.prompt();
  await promptEvent.userChoice;
}

function handleAppInstalled() {
  deferredPrompt.value = null;
  isOpen.value = false;
}

onMounted(() => {
  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  window.addEventListener('appinstalled', handleAppInstalled);
});

onUnmounted(() => {
  window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  window.removeEventListener('appinstalled', handleAppInstalled);
});
</script>

<template>
  <div v-if="isOpen" class="pwa-install" role="dialog" aria-modal="true" aria-labelledby="pwa-install-title">
    <div class="pwa-install__backdrop" @click="dismiss"></div>
    <section class="pwa-install__dialog">
      <h2 id="pwa-install-title">Orbit Calendarをインストール</h2>
      <p>オフラインでもカレンダーを利用できます。</p>
      <div class="pwa-install__actions">
        <button type="button" @click="dismiss">あとで</button>
        <button type="button" data-app-button="primary" @click="install">インストール</button>
      </div>
    </section>
  </div>
</template>

<style lang="scss" scoped>
.pwa-install {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
}

.pwa-install__backdrop {
  position: absolute;
  inset: 0;
  background: rgb(0 0 0 / 45%);
}

.pwa-install__dialog {
  position: relative;
  width: min(28rem, calc(100vw - 2rem));
  padding: var(--space-lg);
  border: 1px solid var(--border);
  border-radius: var(--border-radius);
  background: var(--bg-1);
  box-shadow: 0 1rem 3rem var(--shadow);
}

h2 {
  margin-bottom: var(--space-sm);
}

p {
  color: var(--text-light);
}

.pwa-install__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
  margin-top: var(--space-lg);
}

.pwa-install__actions button {
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--border-radius);
}
</style>