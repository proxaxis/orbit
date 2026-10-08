<script setup>
/**
 * EventForm の通知設定欄。
 * 開始前に送る通知（分・時間・日）の行の追加・削除と、
 * ブラウザの通知許可が拒否されている場合の警告表示を担う。
 */
import { notificationPermission } from '@/composables/useNotifications.js';
import IconBell from '@/components/icons/IconBell.vue';
import IconXMark from '@/components/icons/IconXMark.vue';
import IconPlus from '@/components/icons/IconPlus.vue';

defineProps({
  /** @type {import('vue').PropType<{value: number, unit: 'minute'|'hour'|'day'}[]>} 通知タイミングの一覧 */
  reminders: { type: Array, required: true },
});

const emit = defineEmits(['add-reminder', 'remove-reminder']);
</script>

<template>
  <section>
    <span><IconBell size="0.8rem" /> 通知</span>
    <div class="notification-rows">
      <div v-for="(reminder, index) in reminders" :key="index" class="notification-row">
        <div>
          <input v-model.number="reminder.value" type="number" min="0" max="40320" :aria-label="`通知${index + 1}の時間`" />
          <select v-model="reminder.unit" :aria-label="`通知${index + 1}の単位`">
            <option value="minute">分</option>
            <option value="hour">時間</option>
            <option value="day">日</option>
          </select>
          <span>前に通知</span>
        </div>
        <button type="button" :aria-label="`通知${index + 1}を削除`" @click="emit('remove-reminder', index)">
          <IconXMark />
        </button>
      </div>
      <button v-if="reminders.length < 5" type="button" @click="emit('add-reminder')"><IconPlus /> 通知を追加</button>
      <p v-if="notificationPermission() === 'denied'" class="notification-warning">ブラウザの通知が拒否されています. ブラウザの設定でこのアプリからの通知を許可してください.</p>
    </div>
  </section>
</template>

<style lang="scss" scoped>
section {
  > span {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    * {
      font-size: var(--font-size-xxs);
    }
  }

  > .notification-rows {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);

    .notification-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border: 1px solid var(--border);
      border-radius: var(--border-radius);
      padding: var(--space-xs) var(--space-sm);

      > div {
        display: flex;
        align-items: center;
        gap: var(--space-xs);

        > span {
          font-size: var(--font-size-xxs);
        }

        input[type='number'] {
          width: 3rem;
        }
      }

      > button {
        background: var(--bg-1);

        &:hover {
          background: var(--bg-2);
        }
      }
    }

    > button {
      align-self: flex-start;
      width: calc(100% - 2px);
      font-size: var(--font-size-xxs);
      padding: var(--space-xs) 0;
      background-color: var(--bg-1);
      border: 1px solid var(--border);
      &:hover {
        background-color: var(--bg-2);
      }
    }

    .notification-warning {
      font-size: var(--font-size-xxs);
      color: var(--danger);
    }
  }
}
</style>
