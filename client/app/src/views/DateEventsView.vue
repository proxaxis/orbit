<script setup>
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import dayjs from 'dayjs';
import { toDayjs } from '@/services/dayjs.js';
import { useCalendarStore } from '@/stores/calendar.js';
import { useEventStore } from '@/stores/event.js';
import { useUserStore } from '@/stores/user.js';
import DropdownMenu from '@/components/DropdownMenu.vue';
import CalendarRibbon from '@/components/CalendarRibbon.vue';
import IconPen from '@/components/icons/IconPen.vue';
import IconTrash from '@/components/icons/IconTrash.vue';
import IconCopy from '@/components/icons/IconCopy.vue';
import IconEllipsisVertical from '@/components/icons/IconEllipsisVertical.vue';
import MenuBar from '@/components/MenuBar.vue';
import IconLocationDot from '@/components/icons/IconLocationDot.vue';
import IconArrowsRotate from '@/components/icons/IconArrowsRotate.vue';
import IconCircleInfo from '@/components/icons/IconCircleInfo.vue';
import IconUserGroup from '@/components/icons/IconUserGroup.vue';

const router = useRouter();
const calendarStore = useCalendarStore();
const userStore = useUserStore();
const eventStore = useEventStore();

/** @type {Ref<({ open: (event: MouseEvent) => void, close: () => void }|null)[]>} コンテキストメニュー表示用のドロップダウンへの直接の参照 */
const rfsDrompdownMenu = ref([]);

/** @param {number} index @param {unknown} instance */
function setDropdownRef(index, instance) {
  if (instance === null) {
    rfsDrompdownMenu.value[index] = null;
    return;
  }
  if (typeof instance !== 'object' || !('close' in instance) || typeof instance.close !== 'function') return;
  rfsDrompdownMenu.value[index] = /** @type {{ open: (event: MouseEvent) => void, close: () => void }} */ (instance);
}

/** @type {Ref<HandyCalendarEvent[]>} 選択中の日付の全てのカレンダーのイベントリスト */
const events = ref([]);

/**
 * イベントの日付を文字列に変換
 * @param {HandyCalendarEvent} evt - イベント情報
 * @returns {string} 日付の文字列
 */
function getDateText(evt) {
  if (!evt) return '';
  if (evt.isAllDay) return `${evt.startDateTime.format('YYYY-MM-DD')} - ${dayjs(evt.endDateTime).subtract(1, 'day').format('YYYY-MM-DD')}`;
  return `${dayjs(evt.startDateTime).format('YYYY-MM-DD HH:mm')} - ${dayjs(evt.endDateTime).format('YYYY-MM-DD HH:mm')}`;
}

/** @param {HandyCalendarEvent} evt @returns {boolean} 自分以外の参加者がいるか */
function hasOtherAttendees(evt) {
  return evt.raw?.attendees?.some((attendee) => !attendee.self) ?? false;
}

/**
 * イベントクリック時の処理
 * @param {Event} e - クリックイベント
 * @param {HandyCalendarEvent} evt - イベント情報
 */
const handleEventClick = (e, evt) => {
  e.stopPropagation();
  userStore.setNowSelectedEvent({ eid: evt.id, cid: evt.calendarId });
  router.push({ name: 'EventDetail' });
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
      userStore.setNowSelectedEvent({ eid: args[0], cid: args[1] });
      router.push({ name: 'EventDetail' });
      break;
    // 選択中の日付で新しい予定を作成
    case 'EditEvent':
      userStore.setNowSelectedEvent({ eid: args[0], cid: args[1] });
      router.push({ name: 'EventEditor' });
      break;
    case 'DeleteEvent':
      userStore.setNowSelectedEvent({ eid: args[0], cid: args[1] });
      router.push({ name: 'EventDeleter' });
      break;
    case 'CloneEvent':
      userStore.setNowSelectedEvent({ eid: args[0], cid: args[1] });
      router.push({ name: 'EventCloner' });
      break;
    default:
      break;
  }
  rfsDrompdownMenu.value?.[rfIndex]?.close();
};

watch(() => [calendarStore.listVisibleCalendars, userStore.nowSelectedDate], async () => {
  if (!userStore.nowSelectedDate) return;
  // カレンダーリストがロードされたり、選択日が変わったりしたらイベントを取得または再取得
  const date = toDayjs(userStore.nowSelectedDate);
  events.value = await eventStore.listEventsByDate(date.year(), date.month(), date.date());
}, { immediate: true });
</script>

<template>
  <div class="date-events-view">
    <MenuBar>
      <template #center>
        <h2 class="title">{{ dayjs(userStore.nowSelectedDate ?? undefined).format('YYYY年 MM月 D日 (ddd)') }}</h2>
      </template>
    </MenuBar>

    <ul>
      <li v-for="(evt, i) in events" :key="evt.id" @click.stop="handleEventClick($event, evt)">
        <div class="face">
          <CalendarRibbon :gCalendarId="evt.calendarId" :useLabel="false" />
          <IconArrowsRotate size="0.7rem" v-if="!!evt.raw.recurrence" />
        </div>
        <div class="info">
          <div>{{ evt.icon ?? '📌' }}{{ evt.summary }}
            <IconUserGroup v-if="hasOtherAttendees(evt)" size="0.8rem" />
          </div>
          <div>{{ getDateText(evt) }}</div>
          <div v-if="evt.location">
            <IconLocationDot size="0.7rem" />
            <span>{{ evt.location }}</span>
          </div>
        </div>

        <DropdownMenu :ref="(el) => setDropdownRef(i, el)">
          <template #button>
            <button>
              <IconEllipsisVertical />
            </button>
          </template>
          <button @click="onSelectContextMenu(i, 'ShowDetail', evt.id, evt.calendarId)">
            <IconCircleInfo />詳細
          </button>
          <button @click="onSelectContextMenu(i, 'EditEvent', evt.id, evt.calendarId)">
            <IconPen />編集
          </button>
          <button @click="onSelectContextMenu(i, 'DeleteEvent', evt.id, evt.calendarId)">
            <IconTrash />削除
          </button>
          <button @click="onSelectContextMenu(i, 'CloneEvent', evt.id, evt.calendarId)">
            <IconCopy />複製
          </button>
        </DropdownMenu>
      </li>
      <li v-if="events.length === 0" class="no-event">予定はありません</li>
    </ul>
  </div>
</template>

<style lang="scss" scoped>
.date-events-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

ul {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

li {
  border-radius: var(--border-radius);
  padding: var(--space-sm);
  display: flex;
  gap: var(--space-sm);
  align-items: flex-start;
  cursor: pointer;
  background: var(--bg-2);
  box-shadow: 0 1px 3px var(--shadow);

  &:hover {
    background-color: var(--bg-3);
  }

  &.no-event {
    justify-content: center;
    margin-top: var(--space-md);
    background-color: inherit;
    box-shadow: none;
    cursor: default;

    &:hover {
      background-color: inherit;
    }
  }
}

.face {
  display: flex;
  flex-direction: column;
  align-items: center;

  .calendar-ribbon {
    margin-top: var(--space-xs);
  }

  .icon-arrows-rotate {
    margin-top: var(--space-sm);
  }
}

.info {
  flex: 1;
  display: flex;
  flex-direction: column;

  // タイトル
  div:nth-child(1) {
    font-weight: bold;
    border-bottom: 1px solid var(--border);
    padding-bottom: var(--space-xxs);
  }

  // 時間
  div:nth-child(2) {
    font-weight: bold;
  }

  // 場所
  div:nth-child(3) {
    font-size: var(--text-size-sm);
  }
}
</style>
