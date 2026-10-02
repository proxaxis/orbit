<script setup>
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import dayjs from 'dayjs';
import { useCalendarStore } from '@/stores/calendar.js';
import { useEventStore } from '@/stores/event.js';
import { useUserStore } from '@/stores/user.js';
import DropdownMenu from '@/components/DropdownMenu.vue';
import IconPen from '@/components/icons/IconPen.vue';
import IconTrash from '@/components/icons/IconTrash.vue';
import IconCopy from '@/components/icons/IconCopy.vue';
import IconEllipsisVertical from '@/components/icons/IconEllipsisVertical.vue';
import MenuBar from '@/components/MenuBar.vue';
import IconLocationDot from '@/components/icons/IconLocationDot.vue';
import IconArrowsRotate from '@/components/icons/IconArrowsRotate.vue';
import IconCircleInfo from '@/components/icons/IconCircleInfo.vue';

const router = useRouter();
const calendarStore = useCalendarStore();
const userStore = useUserStore();
const eventStore = useEventStore();

/** @type {Ref<{ open: (event: MouseEvent) => void, close: () => void }[]>} コンテキストメニュー表示用のドロップダウンへの直接の参照 */
const rfsDrompdownMenu = ref([]);

/** @type {Ref<GoogleEvent[]>} 選択中の日付の全てのカレンダーのイベントリスト */
const events = ref([]);

/** @type {ComputedRef<string>} 表示する日付フォーマット */
const displayDate = computed(() => dayjs(userStore.nowSelectedDate).format(userStore.dateFormat.full));

/**
 * イベントクリック時の処理
 * @param {Event} e - クリックイベント
 * @param {Object} event - イベント情報
 */
const handleEventClick = (e, event) => {
  e.stopPropagation();
  router.push({ name: 'EventDetail', params: { id: event.id } });
};

/**
 * コンテキストメニューを選択したときのハンドラ
 * @param {number} rfIndex - メニューのインデックス
 * @param {string} action - アクション
 * @param {...*} args - 引数
 */
const onSelectContextMenu = (rfIndex, action, ...args) => {
  switch (action) {
    // 選択中の日付で新しい予定を作成
    case 'ShowDetail':
      router.push({ name: 'EventDetail', params: { id: args[0] } });
      break;
    default:
      break;
  }
   rfsDrompdownMenu.value?.[rfIndex]?.close();
};

/**
 * 画面表示用に時間をフォーマット
 * @param {GoogleEvent} event - イベント
 * @returns {string} 時間表示
 */
const formatTime = (event) => {
  if (event.start.date) return '終日';
  const s = dayjs(event.start.dateTime);
  const e = dayjs(event.end.dateTime);
  return `${s.format('HH:mm')} - ${e.format('HH:mm')}`;
};

watch(() => userStore.nowSelectedDate, async (newDate) => {
  // 選択日が変わったら、その日のイベントを取得
  if (!newDate) {
    events.value = [];
    return;
  }
  const selectedDate = dayjs(newDate);
  events.value = await eventStore.listEventsByDate(
    selectedDate.year(),
    selectedDate.month(),
    selectedDate.date(),
  );
}, { immediate: true });
</script>

<template>
  <div class="date-events-view">
    <MenuBar>
      <template #center>
        <h2 class="title">{{ displayDate }}</h2>
      </template>
    </MenuBar>

    <div class="events-list">
      <div v-for="(e, i) in events" :key="e.id" class="event-card">
        <div class="face">
          <div>{{ e.icon }}</div>
          <IconArrowsRotate size="0.7rem" v-if="e.recurrence !== null" />
        </div>
        <div class="info">
          <div class="title">{{ e.summary }}</div>
          <div class="time">{{ formatTime(e) }}</div>
          <div class="loc" v-if="e.location">
            <IconLocationDot size="0.7rem" />
            <span>{{ e.location }}</span>
          </div>
        </div>

        <DropdownMenu :ref="(el) => rfsDrompdownMenu[i] = el">
          <template #button>
            <button>
              <IconEllipsisVertical />
            </button>
          </template>
          <button @click="onSelectContextMenu(i, 'ShowDetail', e.id)">
            <IconCircleInfo />詳細
          </button>
          <button>
            <IconPen />編集
          </button>
          <button>
            <IconTrash />削除
          </button>
          <button>
            <IconCopy />複製
          </button>
        </DropdownMenu>
      </div>
      <div v-if="events.length === 0" class="no-event">予定はありません</div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.date-events-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.events-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.event-card {
  border-radius: var(--border-radius);
  padding: 0.5rem;
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  position: relative;
  cursor: pointer;
  background: var(--bg-2);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);

  &:hover {
    background: var(--bg-3);
  }
}

.face {
  display: flex;
  flex-direction: column;
  align-items: center;

  .icon-arrows-rotate {
    padding: 0.5rem 0 0 0;
  }
}

.info {
  flex: 1;
  display: flex;
  flex-direction: column;

  .title {
    font-weight: bold;
  }

  .time,
  .loc {
    font-size: 0.8rem;
  }

  .icons {
    padding: 0;
  }
}

.no-event {
  text-align: center;
  margin-top: 1rem;
}

.icons:hover {
  background: unset;
}
</style>
