<script setup>
/**
 * 操作フィードバックを表示するトースト。
 * user ストアのローディング中メッセージ・エラー・トーストメッセージを一箇所に描画する。
 * デスクトップでは画面左下、タブレット/モバイルでは画面中央下に表示する。
 */
import { computed, onUnmounted, ref, watch } from 'vue';
import { useUserStore } from '@/stores/user.js';

const userStore = useUserStore();

/** 表示中のテキスト。ローディング > エラー > トーストの優先度で選ぶ */
const text = computed(() => {
  if (userStore.isLoading && userStore.loadingMessage) return userStore.loadingMessage;
  if (userStore.hasError && userStore.error) return userStore.error.message;
  return userStore.toastMessage;
});

/** @type {Ref<boolean>} ローディング表示中かどうか */
const isBusy = computed(() => userStore.isLoading && !!userStore.loadingMessage);

/** @type {number|null} 自動消去タイマー */
let dismissTimer = null;

/** 自動消去タイマーを解除する */
function cancelDismiss() {
  if (dismissTimer !== null) {
    window.clearTimeout(dismissTimer);
    dismissTimer = null;
  }
}

watch(
  () => [userStore.toastMessage, userStore.hasError],
  () => {
    cancelDismiss();
    // エラーとトーストは数秒で自動的に消去する
    const delay = userStore.hasError ? 6000 : 4000;
    if (userStore.hasError) dismissTimer = window.setTimeout(() => userStore.setError(false), delay);
    else if (userStore.toastMessage) dismissTimer = window.setTimeout(() => userStore.clearToast(), delay);
  },
);

onUnmounted(cancelDismiss);
</script>

<template>
  <Transition name="toast">
    <div v-if="text" class="toast-message" role="status" aria-live="polite">
      <span v-if="isBusy" class="spinner" aria-hidden="true"></span>
      <span class="text">{{ text }}</span>
    </div>
  </Transition>
</template>

<style lang="scss" scoped>
.toast-message {
  position: fixed;
  bottom: var(--space-md);
  left: var(--space-md);
  z-index: 1000;
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  max-width: min(24rem, calc(100vw - var(--space-md) * 2));
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--border);
  border-radius: var(--border-radius);
  background-color: var(--bg-3);
  color: var(--text);
  font-size: var(--text-size-xs);
  box-shadow: 0 1px 4px var(--shadow);
}

// タブレット・モバイル ( < 1024px ) は画面中央下に表示する
@media (max-width: 1023px) {
  .toast-message {
    left: 50%;
    transform: translateX(-50%);
  }
}

.text {
  overflow-wrap: anywhere;
}

.spinner {
  flex-shrink: 0;
  width: 0.75rem;
  height: 0.75rem;
  border: 2px solid var(--text-light);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease-in-out;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
}
</style>
