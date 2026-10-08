<script setup>
/**
 * UserConfigView の通知欄。
 * ブラウザの通知許可状態の表示と許可要求を担う。
 */
import { ref } from 'vue';
import { ensureNotificationPermission, notificationPermission } from '@/composables/useNotifications.js';
import IconBell from '@/components/icons/IconBell.vue';

/** @type {Ref<'unsupported'|NotificationPermission>} ブラウザーの通知許可状態 */
const notificationPermissionState = ref(notificationPermission());

/** ブラウザーの通知許可を要求し、表示中の状態を再取得する */
async function requestNotificationPermission() {
  notificationPermissionState.value = await ensureNotificationPermission();
}
</script>

<template>
  <section class="config-section">
    <h2>通知</h2>
    <p class="hint">予定の通知にはブラウザの通知機能を使います. 通知タイミングは予定の編集画面で設定できます.</p>
    <p v-if="notificationPermissionState === 'unsupported'" class="hint">このブラウザーは通知に対応していません.</p>
    <p v-else-if="notificationPermissionState === 'granted'" class="hint">通知は許可されています.</p>
    <p v-else-if="notificationPermissionState === 'denied'" class="hint">通知がブロックされています. ブラウザの設定から許可してください.</p>
    <button v-if="notificationPermissionState === 'default'" type="button" class="clear-cache-button" @click="requestNotificationPermission"><IconBell />通知を許可する</button>
  </section>
</template>

<style lang="scss" scoped>
.clear-cache-button {
  align-self: flex-start;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--border);
  border-radius: var(--border-radius);

  &:hover {
    background-color: var(--bg-2);
  }
}
</style>
