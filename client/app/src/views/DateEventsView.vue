<script setup>
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import dayjs, { toDayjs } from '@/services/dayjs.js';
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
import IconAnglesRight from '@/components/icons/IconAnglesRight.vue';
import IconXMark from '@/components/icons/IconXMark.vue';

const router = useRouter();
const calendarStore = useCalendarStore();
const userStore = useUserStore();
const eventStore = useEventStore();
const props = defineProps({
  collapseMobileSubPane: { type: Function, default: () => {} },
});

/** @type {Ref<({ open: (event: MouseEvent) => void, close: () => void }|null)[]>} コンテキストメニュー表示用のドロップダウンへの直接の参照 */
const rfsDrompdownMenu = ref([]);
/** @type {Ref<number|null>} イベントカード長押しタイマー */
const longPressTimer = ref(null);
/** @type {Ref<{x: number, y: number}|null>} イベントカード長押しの開始位置 */
const longPressStart = ref(null);
/** @type {Ref<boolean>} 長押し後のクリックを抑制するフラグ */
const suppressNextCardClick = ref(false);

/** @param {number} index @param {unknown} instance */
function setDropdownRef(index, instance) {
  if (instance === null) {
    rfsDrompdownMenu.value[index] = null;
    return;
  }
  if (typeof instance !== 'object' || !('close' in instance) || typeof instance.close !== 'function') return;
  rfsDrompdownMenu.value[index] = /** @type {{ open: (event: MouseEvent) => void, close: () => void }} */ (instance);
}

/** @param {TouchEvent} event @param {number} index 長押し対象のイベントカード */
function startCardLongPress(event, index) {
  if (event.touches.length !== 1 || (event.target instanceof Element && event.target.closest('.dropdown-button'))) return;
  const touch = event.touches[0];
  longPressStart.value = { x: touch.clientX, y: touch.clientY };
  cancelCardLongPress();
  longPressTimer.value = window.setTimeout(() => {
    longPressTimer.value = null;
    suppressNextCardClick.value = true;
    const menuEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      clientX: touch.clientX,
      clientY: touch.clientY,
    });
    rfsDrompdownMenu.value[index]?.open(menuEvent);
  }, 500);
}

/** @param {TouchEvent} event イベントカード上のタッチ移動 */
function handleCardTouchMove(event) {
  if (event.touches.length !== 1 || !longPressStart.value) {
    cancelCardLongPress();
    return;
  }
  const touch = event.touches[0];
  const deltaX = touch.clientX - longPressStart.value.x;
  const deltaY = touch.clientY - longPressStart.value.y;
  if (Math.abs(deltaX) > 12 || Math.abs(deltaY) > 12) cancelCardLongPress();
}

/** 長押しタイマーを解除 */
function cancelCardLongPress() {
  if (longPressTimer.value !== null) {
    window.clearTimeout(longPressTimer.value);
    longPressTimer.value = null;
  }
  longPressStart.value = null;
}

/** @param {TouchEvent} event イベントカードのタッチ終了 */
function finishCardTouch(event) {
  cancelCardLongPress();
  if (event.changedTouches.length !== 1) return;
}

/** @param {MouseEvent} event @param {number} index 右クリック対象のイベントカード */
function handleCardContextMenu(event, index) {
  if (event.target instanceof Element && event.target.closest('.dropdown-button')) return;
  event.preventDefault();
  event.stopPropagation();
  rfsDrompdownMenu.value[index]?.open(event);
}

/** @type {Ref<HandyCalendarEvent[]>} 選択中の日付の全てのカレンダーのイベントリスト */
const events = ref([]);

/**
 * イベントの日付を文字列に変換
 * @param {HandyCalendarEvent} evt - イベント情報
 * @returns {{ startText?: string, endText?: string, inlineText?: string }} 日付の文字列
 */
function getDateText(evt) {
  if (!evt) return {};
  const now = dayjs();
  let startText = undefined,
    endText = undefined,
    inlineText = undefined;
  // 終日イベントの場合
  if (evt.isAllDay) {
    if (evt.startDateTime.isSame(evt.endDateTime.subtract(1, 'day'), 'day')) {
      inlineText = '終日';
    } else if (evt.startDateTime.isSame(evt.endDateTime.subtract(1, 'day'), 'month')) {
      startText = evt.startDateTime.format('YYYY年 M月 D日 (ddd)');
      endText = dayjs(evt.endDateTime).subtract(1, 'day').format('DD日 (ddd)');
    } else if (evt.startDateTime.isSame(evt.endDateTime.subtract(1, 'day'), 'year')) {
      startText = evt.startDateTime.format('YYYY年 M月 D日 (ddd)');
      endText = evt.endDateTime.subtract(1, 'day').format('M月 D日 (ddd)');
    } else {
      startText = evt.startDateTime.format('YYYY年 M月 D日 (ddd)');
      endText = evt.endDateTime.subtract(1, 'day').format('YYYY年 M月 D日 (ddd)');
    }
  }
  // 時間指定イベントの場合
  else {
    if (evt.startDateTime.isSame(evt.endDateTime, 'day')) {
      startText = evt.startDateTime.format('HH:mm');
      endText = evt.endDateTime.format('HH:mm');
    } else if (evt.startDateTime.isSame(evt.endDateTime.subtract(1, 'day'), 'month')) {
      startText = evt.startDateTime.format('M月 D日 (ddd) HH:mm');
      endText = evt.endDateTime.subtract(1, 'day').format('D日 (ddd) HH:mm');
    } else if (evt.startDateTime.isSame(evt.endDateTime.subtract(1, 'day'), 'year')) {
      startText = evt.startDateTime.format('YYYY年 M月 D日 (ddd) HH:mm');
      endText = evt.endDateTime.subtract(1, 'day').format('M月 D日 (ddd) HH:mm');
    } else {
      startText = evt.startDateTime.format('YYYY年 M月 D日 (ddd) HH:mm');
      endText = evt.endDateTime.subtract(1, 'day').format('YYYY年 M月 D日 (ddd) HH:mm');
    }
  }

  // 日付の文字列から、今日、今月、今週の部分を削除
  const regex = new RegExp(`^(${now.format('YYYY年')}|${now.format('YYYY年 M月')}|${now.format('M月')}|${now.format('D日 (ddd)')})`, 'g');
  startText = startText?.replace(regex, '').trim();
  endText = endText?.replace(regex, '').trim();
  return { startText, endText, inlineText };
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
  if (suppressNextCardClick.value) {
    suppressNextCardClick.value = false;
    return;
  }
  userStore.setNowSelectedEvent({ eid: evt.id, cid: evt.calendarId });
  router.push({ name: 'EventDetail' });
};

/**
 * コンテキストメニューを選択したときのハンドラ
 * @param {number} rfIndex - メニューのインデックス
 * @param {string} action - アクション
 * @param {...*} args - 引数
 */
const onSelectContextMenu = async (rfIndex, action, ...args) => {
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
    // 選択中のイベントを削除
    case 'DeleteEvent':
      if (!args[0] || !args[1]) throw new Error('You do not have an event selected. You must select an event to remove it.');
      if (!(await userStore.confirm({ title: 'イベントの削除', message: '本当にこのイベントを削除しますか？' }))) return;
      userStore.setLoading(true, 'Removing the event...');
      try {
        const res = await eventStore.removeEvent(args[0], args[1]);
        if (!res) throw new Error('Failed to remove the event.');
      } catch (err) {
        userStore.setError(true, err);
      } finally {
        userStore.setLoading(false);
      }
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

watch(
  () => [calendarStore.listVisibleCalendars, userStore.nowSelectedDate],
  async () => {
    if (!userStore.nowSelectedDate) return;
    // カレンダーリストがロードされたり、選択日が変わったりしたらイベントを取得または再取得
    const date = toDayjs(userStore.nowSelectedDate);
    events.value = await eventStore.listEventsByDate(date.year(), date.month(), date.date());
  },
  { immediate: true },
);
</script>

<template>
  <div class="date-events-view">
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
      <li v-for="(evt, i) in events" :key="evt.id" @click.stop="handleEventClick($event, evt)" @contextmenu="handleCardContextMenu($event, i)" @touchstart="startCardLongPress($event, i)" @touchmove="handleCardTouchMove" @touchend="finishCardTouch" @touchcancel="cancelCardLongPress">
        <div class="face">
          <CalendarRibbon :cid="evt.calendarId" :useLabel="false" />
          <IconArrowsRotate size="0.7rem" v-if="!!evt.raw.recurrence" />
        </div>
        <div class="info">
          <div>
            {{ evt.icon ?? '📌' }}{{ evt.summary }}
            <IconUserGroup v-if="hasOtherAttendees(evt)" size="0.8rem" />
          </div>
          <div v-if="getDateText(evt).inlineText">
            <span>{{ getDateText(evt).inlineText }}</span>
          </div>
          <div v-else>
            <span>{{ getDateText(evt).startText }}</span> <IconAnglesRight /> <span>{{ getDateText(evt).endText }}</span>
          </div>
          <div v-if="evt.location">
            <IconLocationDot size="0.7rem" />
            <span>{{ evt.location }}</span>
          </div>
        </div>

        <DropdownMenu :ref="(el) => setDropdownRef(i, el)">
          <template #button>
            <button class="icon-ellipsis-vertical-wrapper">
              <IconEllipsisVertical />
            </button>
          </template>
          <button @click="onSelectContextMenu(i, 'ShowDetail', evt.id, evt.calendarId)"><IconCircleInfo />詳細</button>
          <button @click="onSelectContextMenu(i, 'EditEvent', evt.id, evt.calendarId)"><IconPen />編集</button>
          <button @click="onSelectContextMenu(i, 'DeleteEvent', evt.id, evt.calendarId)"><IconTrash />削除</button>
          <button @click="onSelectContextMenu(i, 'CloneEvent', evt.id, evt.calendarId)"><IconCopy />複製</button>
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
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  // 場所
  div:nth-child(3) {
    font-size: var(--text-size-sm);
  }
}

.icon-ellipsis-vertical-wrapper {
  background-color: var(--bg-2);
  &:hover {
    background-color: var(--bg-4);
  }
}

.icon-x-mark-wrapper {
  background-color: var(--bg-1);
  &:hover {
    background-color: var(--bg-2);
  }
}
</style>
