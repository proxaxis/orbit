<script setup>
/**
 * UserConfigView の同期欄。
 * 保留中のオフライン操作の再送・カレンダー一覧とイベントの即時更新を担う。
 */
import { ref } from 'vue';
import { useUserStore } from '@/stores/user.js';
import { useAuthStore } from '@/stores/auth.js';
import { useCalendars } from '@/composables/useCalendars.js';
import { useEvents, notifyEventDataChanged } from '@/composables/useEvents.js';
import { useEventStore } from '@/stores/event.js';
import { rescheduleNotifications } from '@/composables/useNotifications.js';
import IconArrowsRotate from '@/components/icons/IconArrowsRotate.vue';

const userStore = useUserStore();
const authStore = useAuthStore();
const calendars = useCalendars();
const events = useEvents();

/** @type {Ref<boolean>} 同期処理の実行中フラグ */
const isSyncing = ref(false);

/** 保留キューの再送・カレンダー一覧・イベントの変更確認をまとめて即時実行する */
async function syncNow() {
  if (isSyncing.value) return;
  isSyncing.value = true;
  try {
    if (!authStore.isAuthenticated || userStore.isOffline) {
      userStore.showToast('オフラインまたは未ログインのため同期できません.');
      return;
    }
    await events.syncPendingOperations();
    await calendars.loadCalendars();
    // メモリキャッシュを破棄してビューへ再読込を通知（他デバイスの変更も取り込まれる）
    useEventStore().clearEventCache();
    notifyEventDataChanged();
    // 通知スケジュール・プッシュ購読も最新化する
    await rescheduleNotifications();
    userStore.showToast('同期しました.');
  } catch (error) {
    console.warn('Manual sync failed.', error);
    userStore.showToast('同期に失敗しました.');
  } finally {
    isSyncing.value = false;
  }
}
</script>

<template>
  <section class="config-section">
    <p class="hint">他のデバイスでの変更を今すぐ取り込み、保留中の操作を再送します.</p>
    <button type="button" class="sync-button" :disabled="isSyncing" @click="syncNow"><IconArrowsRotate :class="{ 'is-spinning': isSyncing }" />{{ isSyncing ? '同期中...' : '今すぐ同期' }}</button>
  </section>
</template>

<style lang="scss" scoped>
.hint {
  font-size: var(--text-size-xs);
}
.sync-button {
  align-self: flex-start;
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--border);
  border-radius: var(--border-radius);

  &:hover:not(:disabled) {
    background-color: var(--bg-2);
  }

  &:disabled {
    opacity: 0.6;
  }
}

.is-spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
