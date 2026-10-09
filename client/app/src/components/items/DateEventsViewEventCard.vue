<script setup>
/**
 * DateEventsView のイベントカード。
 * 1件の予定の表示・長押し/右クリックでのコンテキストメニュー・
 * 詳細/編集/削除/複製の操作を担う。
 */
import { computed, ref } from 'vue';
import dayjs, { toDayjs } from '@/services/dayjs.js';
import { useEventActions } from '@/composables/useEventActions.js';
import { useCalendarStore } from '@/stores/calendar.js';
import { useUserStore } from '@/stores/user.js';
import DropdownMenu from '@/components/DropdownMenu.vue';
import CalendarRibbon from '@/components/CalendarRibbon.vue';
import InlineEmoji from '@/components/InlineEmoji.vue';
import IconPen from '@/components/icons/IconPen.vue';
import IconTrash from '@/components/icons/IconTrash.vue';
import IconCopy from '@/components/icons/IconCopy.vue';
import IconEllipsisVertical from '@/components/icons/IconEllipsisVertical.vue';
import IconLocationDot from '@/components/icons/IconLocationDot.vue';
import IconArrowUp from '@/components/icons/IconArrowUp.vue';
import IconArrowDown from '@/components/icons/IconArrowDown.vue';
import IconCircleInfo from '@/components/icons/IconCircleInfo.vue';

const props = defineProps({
  /** @type {import('vue').PropType<HandyCalendarEvent>} 表示するイベント */
  event: { type: Object, required: true },
});

const emit = defineEmits(['open', 'select']);

const eventActions = useEventActions();
const calendarStore = useCalendarStore();
const userStore = useUserStore();

/** @type {ComputedRef<boolean>} イベントの属するカレンダーに書き込み権限があるか（ない場合は編集・削除を表示しない） */
const canWriteCalendar = computed(() => calendarStore.listWritableCalendars.some((calendar) => calendar.id === props.event.calendarId));

/**
 * 左側の時間列に上から下へ時間が流れるよう縦積みで表示するパーツ。
 * 表示中の日付がイベントの開始日・中日・終了日のどれかで構成を変える。
 * - 終日: 継続を縦バーで示す（開始日=下にバー、中日=上下にバー、終了日=上にバー）
 * - 時間指定の日またぎ: 前日からの継続を上矢印・翌日への継続を下矢印で示す
 *   （開始日=「17:00 ↓」、中日=「| 終日 |」、終了日=「↑ 19:00」）
 * @type {ComputedRef<{type: 'text'|'bar'|'arrow-up'|'arrow-down', value?: string}[]>}
 */
const timeParts = computed(() => {
  const evt = props.event;
  const day = userStore.nowSelectedDate ? toDayjs(userStore.nowSelectedDate) : dayjs();
  const text = (/** @type {string} */ value) => ({ type: 'text', value });
  if (evt.isAllDay) {
    // 終日イベントの raw end は排他のため、最終表示日は end - 1日
    const lastDay = evt.endDateTime?.isValid?.() ? evt.endDateTime.subtract(1, 'day') : evt.startDateTime;
    if (evt.startDateTime.isSame(lastDay, 'day')) return [text('終日')];
    if (day.isSame(evt.startDateTime, 'day')) return [text('終日'), { type: 'bar' }];
    if (day.isSame(lastDay, 'day')) return [{ type: 'bar' }, text('終日')];
    return [{ type: 'bar' }, text('終日'), { type: 'bar' }];
  }
  if (evt.startDateTime.isSame(evt.endDateTime, 'day')) return [text(evt.startDateTime.format('HH:mm')), text(evt.endDateTime.format('HH:mm'))];
  // 0:00 ちょうど終了のイベントはその日付には表示されないため、最終表示日は end - 1日
  const lastDay = evt.endDateTime.format('HH:mm') === '00:00' ? evt.endDateTime.subtract(1, 'day') : evt.endDateTime;
  if (day.isSame(evt.startDateTime, 'day')) return [text(evt.startDateTime.format('HH:mm')), { type: 'arrow-down' }];
  if (day.isSame(lastDay, 'day')) return [{ type: 'arrow-up' }, text(evt.endDateTime.format('HH:mm'))];
  return [{ type: 'bar' }, text('終日'), { type: 'bar' }];
});

/** @type {Ref<{ open: (event: MouseEvent) => void, close: () => void }|null>} コンテキストメニュー表示用のドロップダウン */
const rfDropdownMenu = ref(null);
/** @type {Ref<number|null>} イベントカード長押しタイマー */
const longPressTimer = ref(null);
/** @type {Ref<{x: number, y: number}|null>} イベントカード長押しの開始位置 */
const longPressStart = ref(null);
/** @type {Ref<boolean>} 長押し後のクリックを抑制するフラグ */
const suppressNextCardClick = ref(false);

/**
 * カードのクリックを処理する。長押し直後のクリックは抑制する。
 * @param {MouseEvent} e クリックイベント
 * @returns {void}
 */
function handleCardClick(e) {
  e.stopPropagation();
  if (suppressNextCardClick.value) {
    suppressNextCardClick.value = false;
    return;
  }
  emit('open', props.event);
}

/**
 * タッチ開始時に長押しタイマーを開始する
 * @param {TouchEvent} event タッチイベント
 * @returns {void}
 */
function startCardLongPress(event) {
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
    rfDropdownMenu.value?.open(menuEvent);
  }, 500);
}

/**
 * カード上のタッチ移動を処理する。移動量が大きければ長押しをキャンセルする。
 * @param {TouchEvent} event タッチイベント
 * @returns {void}
 */
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

/** @param {TouchEvent} _event イベントカードのタッチ終了 */
function finishCardTouch(_event) {
  cancelCardLongPress();
}

/**
 * 右クリックでコンテキストメニューを開く
 * @param {MouseEvent} event コンテキストメニューイベント
 * @returns {void}
 */
function handleCardContextMenu(event) {
  if (event.target instanceof Element && event.target.closest('.dropdown-button')) return;
  event.preventDefault();
  event.stopPropagation();
  rfDropdownMenu.value?.open(event);
}

/**
 * コンテキストメニューの選択を親へ通知してメニューを閉じる
 * @param {string} action 選択されたアクション
 * @returns {void}
 */
function onSelectContextMenu(action) {
  emit('select', action, props.event);
  rfDropdownMenu.value?.close();
}
</script>

<template>
  <li @click.stop="handleCardClick" @contextmenu="handleCardContextMenu" @touchstart="startCardLongPress" @touchmove="handleCardTouchMove" @touchend="finishCardTouch" @touchcancel="cancelCardLongPress">
    <div class="time-col">
      <template v-for="(part, i) in timeParts" :key="i">
        <span v-if="part.type === 'bar'" class="time-bar"></span>
        <span v-else-if="part.type === 'arrow-up'" class="time-arrow"><IconArrowUp /></span>
        <span v-else-if="part.type === 'arrow-down'" class="time-arrow"><IconArrowDown /></span>
        <span v-else class="time-text">{{ part.value }}</span>
      </template>
    </div>
    <div class="face">
      <CalendarRibbon :cid="event.calendarId" :useLabel="false" />
    </div>
    <div class="info">
      <div class="title">
        <InlineEmoji :emoji="event.icon" />
        <span class="text">{{ event.summary }}</span>
      </div>
      <div v-if="event.description" class="meta">
        <span class="text">{{ event.description }}</span>
      </div>
      <div v-else-if="event.location" class="meta">
        <IconLocationDot size="0.7rem" />
        <span class="text">{{ event.location }}</span>
      </div>
    </div>

    <DropdownMenu ref="rfDropdownMenu">
      <template #button>
        <button class="icon-ellipsis-vertical-wrapper" title="イベントの操作" aria-label="イベントの操作">
          <IconEllipsisVertical />
        </button>
      </template>
      <button @click="onSelectContextMenu('ShowDetail')"><IconCircleInfo />詳細</button>
      <button v-if="canWriteCalendar" @click="onSelectContextMenu('EditEvent')"><IconPen />編集</button>
      <button v-if="canWriteCalendar" @click="onSelectContextMenu('DeleteEvent')"><IconTrash />削除</button>
      <button @click="onSelectContextMenu('CloneEvent')"><IconCopy />複製</button>
    </DropdownMenu>
  </li>
</template>

<style lang="scss" scoped>
li {
  border-radius: var(--border-radius);
  padding: var(--space-xs) var(--space-sm);
  display: flex;
  gap: var(--space-xs);
  align-items: center;
  cursor: pointer;
  background: var(--bg-2);
  transition: background-color 0.2s ease;
  height: 4.2rem;

  &:hover {
    background-color: var(--bg-3);
  }
}

.time-col {
  flex: 0 0 3.2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.3;
  overflow: hidden;

  > span {
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .time-text {
    font-variant-numeric: tabular-nums;
  }

  .time-bar {
    width: 1.3px;
    height: 0.6rem;
    background: var(--text-light);
    border-radius: 1px;
    &:first-child {
      margin-bottom: 2px;
    }
    &:last-child {
      margin-top: 6px;
    }
  }

  .time-arrow {
    display: flex;
    line-height: 1;
    color: var(--text-light);

    svg {
      fill: var(--text-light);
      width: 0.8rem;
      height: 1.4rem;
    }
  }
}

.face {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;

  > div {
    display: flex;
    align-items: center;
    gap: var(--space-xxs);
    min-width: 0;
  }

  .text {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .title {
    font-size: var(--text-size-sm);
  }

  .meta {
    font-size: var(--text-size-xs);
    color: var(--text-light);
  }
}

.icon-ellipsis-vertical-wrapper {
  background-color: transparent;
}
</style>
