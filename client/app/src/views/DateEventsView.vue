<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import dayjs, { toDayjs } from '@/services/dayjs.js';
import { useUserStore } from '@/stores/user.js';
import { useCalendarEvents } from '@/composables/useCalendarEvents.js';
import { useEventActions } from '@/composables/useEventActions.js';
import { moveSelectedDate } from '@/composables/useDateNavigation.js';
import IconXMark from '@/components/icons/IconXMark.vue';
import MenuBar from '@/components/MenuBar.vue';
import DateEventsViewEventCard from '@/components/items/DateEventsViewEventCard.vue';

const router = useRouter();
const userStore = useUserStore();
const eventActions = useEventActions();
const props = defineProps({
  collapseMobileSubPane: { type: Function, default: () => {} },
});

/** @type {ComputedRef<{start: Dayjs, end: Dayjs}>} 選択中の日付の範囲（イベント購読用） */
const visibleRange = computed(() => {
  const date = userStore.nowSelectedDate ? toDayjs(userStore.nowSelectedDate) : toDayjs();
  return { start: date.startOf('day'), end: date.endOf('day') };
});

/** @type {ComputedRef<HandyCalendarEvent[]>} 選択中の日付の全てのカレンダーのイベントリスト（カスタム休日を除く）。取得は composable 側のバックグラウンド処理 */
const { events } = useCalendarEvents(visibleRange);

/** @type {Ref<{x:number,y:number}|null>} 日付移動スワイプの開始位置 */
const swipeStart = ref(null);

/** @param {TouchEvent} evt 日付移動スワイプの開始 */
function startDaySwipe(evt) {
  if ((!userStore.isMobile && !userStore.isTablet) || evt.touches.length !== 1) return;
  const touch = evt.touches[0];
  swipeStart.value = { x: touch.clientX, y: touch.clientY };
}

/** @param {TouchEvent} evt 日付移動スワイプの終了。右スワイプで前日、左スワイプで翌日へ移動する */
function finishDaySwipe(evt) {
  const start = swipeStart.value;
  swipeStart.value = null;
  if (!start || (!userStore.isMobile && !userStore.isTablet) || evt.changedTouches.length !== 1) return;
  const touch = evt.changedTouches[0];
  const deltaX = touch.clientX - start.x;
  const deltaY = touch.clientY - start.y;
  // 横方向に60px以上、かつ縦移動より明確に横方向の場合のみ日付を移動する
  if (Math.abs(deltaX) < 60 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) return;
  moveSelectedDate(deltaX > 0 ? -1 : 1, 'day');
}

/**
 * イベントカードのクリックで詳細画面へ遷移する
 * @param {HandyCalendarEvent} evt イベント情報
 * @returns {void}
 */
function openEventDetail(evt) {
  userStore.setNowSelectedEvent({ eid: evt.id, cid: evt.calendarId });
  router.push({ name: 'EventDetail' });
}

/**
 * イベントカードのコンテキストメニューが選択されたときのハンドラ
 * @param {string} action アクション
 * @param {HandyCalendarEvent} evt 対象のイベント
 * @returns {Promise<void>}
 */
async function onSelectContextMenu(action, evt) {
  switch (action) {
    case 'ShowDetail':
      userStore.setNowSelectedEvent({ eid: evt.id, cid: evt.calendarId });
      router.push({ name: 'EventDetail' });
      break;
    case 'EditEvent':
      userStore.setNowSelectedEvent({ eid: evt.id, cid: evt.calendarId });
      router.push({ name: 'EventEditor' });
      break;
    case 'DeleteEvent':
      await eventActions.confirmAndRemoveEvent(evt.id, evt.calendarId);
      break;
    case 'CloneEvent':
      userStore.setNowSelectedEvent({ eid: evt.id, cid: evt.calendarId });
      router.push({ name: 'EventCloner' });
      break;
    default:
      break;
  }
}

// イベントの取得・再取得は useCalendarEvents が担う（ビューは表示範囲を渡すだけで待機しない）
</script>

<template>
  <div class="date-events-view" @touchstart="startDaySwipe" @touchend="finishDaySwipe" @touchcancel="swipeStart = null">
    <MenuBar :useMobilePadding="userStore.isMobile">
      <template #center>
        <h2 class="title">
          {{ dayjs(userStore.nowSelectedDate ?? undefined).format('YYYY年 MM月 D日 (ddd)') }} <small>{{ events.length }}件</small>
        </h2>
      </template>
      <template #sub>
        <button v-if="userStore.isMobile" type="button" class="icon-x-mark-wrapper" title="下部ペインを閉じる" aria-label="下部ペインを閉じる" @click="props.collapseMobileSubPane">
          <IconXMark />
        </button>
      </template>
    </MenuBar>

    <ul>
      <DateEventsViewEventCard v-for="evt in events" :key="`${evt.calendarId}:${evt.id}`" :event="evt" @open="openEventDetail" @select="onSelectContextMenu" />
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

li.no-event {
  border-radius: var(--border-radius);
  padding: var(--space-sm);
  display: flex;
  justify-content: center;
  margin-top: var(--space-md);
  cursor: default;
}

.icon-x-mark-wrapper {
  background-color: var(--bg-1);
  &:hover {
    background-color: var(--bg-2);
  }
}
</style>
