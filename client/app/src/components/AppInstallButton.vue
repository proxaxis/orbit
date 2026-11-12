<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import IconDownload from '@/components/icons/IconDownload.vue';

/** @type {Ref<Event|null>} */
const deferredPrompt = ref(null);

/** @param {Event} event インストールプロンプトが表示される前に発生するイベント */
function handleBeforeInstallPrompt(event) {
  event.preventDefault();
  deferredPrompt.value = event;
}

/** インストールボタンがクリックされたときの処理 */
async function install() {
  if (!deferredPrompt.value) return;
  const promptEvent = deferredPrompt.value;
  deferredPrompt.value = null;
  await promptEvent.prompt();
  await promptEvent.userChoice;
}

/** アプリがインストールされたときの処理 */
function handleAppInstalled() {
  deferredPrompt.value = null;
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
  <button @click="install">
    <span> <IconDownload />アプリをインストール </span>
    <small>アプリはオフラインでも使用できます</small>
  </button>
</template>

<style lang="scss" scoped>
button {
  display: flex;
  flex-direction: column;
  width: calc(100% - var(--space-sm) * 2);
  padding: var(--space-xs) var(--space-sm);
  background-color: var(--bg-2);
  border-radius: var(--border-radius);

  &:hover {
    background-color: var(--bg-3);
  }

  span {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    font-size: var(--text-size-lg);
  }

  small {
    font-size: var(--text-size-xs);
  }
}
</style>
