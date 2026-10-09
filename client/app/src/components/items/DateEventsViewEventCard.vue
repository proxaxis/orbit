<script setup>
/**
 * DateEventsView のイベントカード。
 * 1件の予定の表示・長押し/右クリックでのコンテキストメニュー・
 * 詳細/編集/削除/複製の操作を担う。
 */
import { ref } from 'vue';
import { useEventActions } from '@/composables/useEventActions.js';
import DropdownMenu from '@/components/DropdownMenu.vue';
import CalendarRibbon from '@/components/CalendarRibbon.vue';
import InlineEmoji from '@/components/InlineEmoji.vue';
import IconPen from '@/components/icons/IconPen.vue';
import IconTrash from '@/components/icons/IconTrash.vue';
import IconCopy from '@/components/icons/IconCopy.vue';
import IconEllipsisVertical from '@/components/icons/IconEllipsisVertical.vue';
import IconLocationDot from '@/components/icons/IconLocationDot.vue';
import IconArrowsRotate from '@/components/icons/IconArrowsRotate.vue';
import IconCircleInfo from '@/components/icons/IconCircleInfo.vue';
import IconUserGroup from '@/components/icons/IconUserGroup.vue';
import IconAnglesRight from '@/components/icons/IconAnglesRight.vue';

const props = defineProps({
  /** @type {import('vue').PropType<HandyCalendarEvent>} 表示するイベント */
  event: { type: Object, required: true },
});

const emit = defineEmits(['open', 'select']);

const eventActions = useEventActions();

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
    <div class="face">
      <CalendarRibbon :cid="event.calendarId" :useLabel="false" />
      <IconArrowsRotate size="0.7rem" v-if="!!event.raw?.recurrence" />
    </div>
    <div class="info">
      <div>
        <InlineEmoji :emoji="event.icon ?? '📌'" /> {{ event.summary }}
        <IconUserGroup v-if="eventActions.hasOtherAttendees(event)" size="0.8rem" />
      </div>
      <div v-if="eventActions.eventDateText(event).inlineText">
        <span>{{ eventActions.eventDateText(event).inlineText }}</span>
      </div>
      <div v-else>
        <span>{{ eventActions.eventDateText(event).startText }}</span> <IconAnglesRight /> <span>{{ eventActions.eventDateText(event).endText }}</span>
      </div>
      <div v-if="event.location">
        <IconLocationDot size="0.7rem" />
        <span>{{ event.location }}</span>
      </div>
    </div>

    <DropdownMenu ref="rfDropdownMenu">
      <template #button>
        <button class="icon-ellipsis-vertical-wrapper" title="イベントの操作" aria-label="イベントの操作">
          <IconEllipsisVertical />
        </button>
      </template>
      <button @click="onSelectContextMenu('ShowDetail')"><IconCircleInfo />詳細</button>
      <button @click="onSelectContextMenu('EditEvent')"><IconPen />編集</button>
      <button @click="onSelectContextMenu('DeleteEvent')"><IconTrash />削除</button>
      <button @click="onSelectContextMenu('CloneEvent')"><IconCopy />複製</button>
    </DropdownMenu>
  </li>
</template>

<style lang="scss" scoped>
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
  background-color: transparent;
}
</style>
