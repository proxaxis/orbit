<script setup>
/**
 * UserConfigView の通知欄。
 * ブラウザの通知許可状態の表示と許可要求、
 * 終日タスクのまとめ通知時刻の設定を担う。
 */
import { ref, watch } from 'vue';
import { ensureNotificationPermission, notificationPermission, rescheduleNotifications } from '@/composables/useNotifications.js';
import { useUserStore } from '@/stores/user.js';
import IconBell from '@/components/icons/IconBell.vue';
import IconPlus from '@/components/icons/IconPlus.vue';
import IconXMark from '@/components/icons/IconXMark.vue';

const userStore = useUserStore();

/** @type {Ref<'unsupported'|NotificationPermission>} ブラウザーの通知許可状態 */
const notificationPermissionState = ref(notificationPermission());

/** @type {Ref<string[]>} 編集中の終日タスク通知時刻（'HH:mm'） */
const taskNotifyTimes = ref([...userStore.taskNotificationTimes]);

/** ブラウザーの通知許可を要求し、表示中の状態を再取得する */
async function requestNotificationPermission() {
  notificationPermissionState.value = await ensureNotificationPermission();
}

// 通知時刻の変更を保存して通知スケジュールを組み直す（最大5件）
watch(
  taskNotifyTimes,
  (times) => {
    userStore.setTaskNotificationTimes(times.slice(0, 5));
    rescheduleNotifications();
  },
  { deep: true },
);

/** 通知時刻を1行追加する */
function addTaskNotifyTime() {
  if (taskNotifyTimes.value.length >= 5) return;
  taskNotifyTimes.value.push('09:00');
}

/** @param {number} index 削除する通知時刻の番号 */
function removeTaskNotifyTime(index) {
  taskNotifyTimes.value.splice(index, 1);
}
</script>

<template>
  <section class="config-section">
    <p class="hint">予定の通知にはブラウザの通知機能を使います. 通知タイミングは予定の編集画面で設定できます.</p>
    <p class="hint">許可するとプッシュ通知が有効になり、アプリを閉じている間もモバイル端末へ通知が届きます.</p>
    <p v-if="notificationPermissionState === 'unsupported'" class="hint">このブラウザーは通知に対応していません.</p>
    <p v-else-if="notificationPermissionState === 'granted'" class="hint">通知は許可されています.</p>
    <p v-else-if="notificationPermissionState === 'denied'" class="hint">通知がブロックされています. ブラウザの設定から許可してください.</p>
    <button v-if="notificationPermissionState === 'default'" type="button" class="clear-cache-button" @click="requestNotificationPermission"><IconBell />通知を許可する</button>

    <div class="task-notify-times">
      <p class="hint">終日タスクは次の時刻にまとめて通知します（複数指定可・すべて削除すると通知しません）. 時間指定タスクは開始時刻に通知します.</p>
      <div v-for="(time, index) in taskNotifyTimes" :key="index" class="task-notify-row">
        <input v-model="taskNotifyTimes[index]" type="time" :aria-label="`終日タスクの通知時刻${index + 1}`" />
        <button type="button" :aria-label="`通知時刻${index + 1}を削除`" @click="removeTaskNotifyTime(index)"><IconXMark /></button>
      </div>
      <button v-if="taskNotifyTimes.length < 5" type="button" class="add-time-button" @click="addTaskNotifyTime"><IconPlus />通知時刻を追加</button>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.hint {
  font-size: var(--text-size-xs);
}
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

.task-notify-times {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);

  .task-notify-row {
    display: flex;
    align-items: center;
    gap: var(--space-xs);

    > button {
      background-color: var(--bg-2);

      &:hover {
        background-color: var(--bg-3);
      }
    }
  }

  .add-time-button {
    align-self: flex-start;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    border: 1px solid var(--border);
    border-radius: var(--border-radius);
    background-color: var(--bg-2);

    &:hover {
      background-color: var(--bg-3);
    }
  }
}
</style>
