<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import dayjs, { toDayjs } from '@/services/dayjs.js';
import { useEventStore } from '@/stores/event.js';
import { useUserStore } from '@/stores/user.js';
import { useCalendarStore } from '@/stores/calendar.js';
import { useAuthStore } from '@/stores/auth.js';
import { USER_TEXT_SIZE_VALUES } from '@/stores/user.js';
import DropdownMenu from '@/components/DropdownMenu.vue';
import IconCaretLeft from '@/components/icons/IconCaretLeft.vue';
import IconCaretRight from '@/components/icons/IconCaretRight.vue';
import IconBars from '@/components/icons/IconBars.vue';
import IconGear from '@/components/icons/IconGear.vue';
import IconUserGroup from '@/components/icons/IconUserGroup.vue';
import IconBarsStaggered from '@/components/icons/IconBarsStaggered.vue';
import IconArrowRotateLeft from '@/components/icons/IconArrowRotateLeft.vue';
import IconEllipsisVertical from '@/components/icons/IconEllipsisVertical.vue';

const router = useRouter();
const eventStore = useEventStore();
const userStore = useUserStore();
const calendarStore = useCalendarStore();
const authStore = useAuthStore();

const calendarTextSizeStyle = computed(() => Object.fromEntries(Object.entries(USER_TEXT_SIZE_VALUES[userStore.calendarTextSize]).map(([name, value]) => [`--text-size-${name}`, value])));

const props = defineProps({
  selectPane: { type: Function, default: () => {} },
});
const lastWheelNavigationAt = ref(0);
/** @type {Ref<'prev'|'next'|'today'>} 月切り替えアニメーションの方向 */
const monthTransition = ref('next');

/** @type {Ref<{x: number, y: number}|null>} 月移動スワイプの開始位置 */
const swipeStart = ref(null);

/** @type {Ref<number|null>} 日付セル長押しタイマー */
const longPressTimer = ref(null);

/** @type {Ref<boolean>} 長押し後のクリックを抑制するフラグ */
const suppressNextCellClick = ref(false);

/** @type {Ref<{ open: (event: MouseEvent) => void, close: () => void }|null>} コンテキストメニュー表示用のドロップダウンへの直接の参照 */
const rfDropdownForContextMenu = ref(null);

/** @type {Ref<HandyCalendarEvent[]>} 全てのカレンダーに登録されたイベントのうち、指定された月に登録されたもの */
const events = ref([]);

/** @type {Ref<HTMLElement|null>} ツールバー */
const rfToolbar = ref(null);
/** @type {Ref<boolean>} ツールバーが収まらず右ボタン群をメニューに畳む状態か */
const isCompactToolbar = ref(false);
/** 展開時の右ボタン群の自然幅（コンパクト表示中も判定基準として保持する） */
let expandedRightToolbarWidth = 0;
let toolbarObserver = null;

/** @param {HandyCalendarEvent} evt @returns {string} イベント設定またはカレンダー設定に基づくイベントバーの色 */
function getEventBarColor(evt) {
  if (!!evt.calendarBackgroundColor && evt.calendarBackgroundColor.startsWith('#')) return evt.calendarBackgroundColor;
  return '#2196f3'; // デフォルトの青色
}

const relativeYearText = computed(() => {
  const now = dayjs();
  const year = userStore.nowUsingDate.year();
  if (year === now.year()) return '';
  if (year === now.year() - 1) return '去年';
  if (year === now.year() + 1) return '来年';
  if (year < now.year() - 1) return `(${now.year()}-) ${now.year() - year}年前`;
  if (year > now.year() + 1) return `(${now.year()}+) ${year - now.year()}年後`;
  return '';
});

/** @type {ComputedRef<{date: Dayjs, key: string, isToday: boolean, isOtherMonth: boolean, isSelected: boolean}[]>} @description カレンダーメインの日付配列 */
const calDaysArray = computed(() => {
  const today = toDayjs();
  const days = [];
  const year = userStore.nowUsingDate.year();
  const month = userStore.nowUsingDate.month();

  const firstDay = toDayjs(new Date(year, month, 1));
  const lastDay = toDayjs(new Date(year, month + 1, 0));

  const dayOfFirst = firstDay.day();
  const prevPadding = (dayOfFirst - userStore.firstDayOfWeek + 7) % 7;

  // 前月分
  for (let i = prevPadding; i > 0; i--) {
    days.push({
      date: toDayjs(new Date(year, month, 1 - i)),
      key: `prev-${i}`,
      isToday: false,
      isOtherMonth: true,
      isSelected: userStore.nowSelectedDate === toDayjs(new Date(year, month, 1 - i)).format('YYYY-MM-DD'),
    });
  }
  // 当月分
  for (let i = 1; i <= lastDay.date(); i++) {
    days.push({
      date: toDayjs(new Date(year, month, i)),
      key: `curr-${i}`,
      isToday: toDayjs(new Date(year, month, i)).format('YYYY-MM-DD') === today.format('YYYY-MM-DD'),
      isOtherMonth: false,
      isSelected: userStore.nowSelectedDate === toDayjs(new Date(year, month, i)).format('YYYY-MM-DD'),
    });
  }
  // 次月分
  const currentDaysCount = prevPadding + lastDay.date();
  const nextPadding = (7 - (currentDaysCount % 7)) % 7;
  // 横表示の場合は行数を固定せず、必要分だけ埋めるのが一般的
  // ここでは最低 5-6 行確保するロジックを入れても良いが、シンプルに余り分を追加
  for (let i = 1; i <= nextPadding; i++) {
    days.push({
      date: toDayjs(new Date(year, month + 1, i)),
      key: `next-${i}`,
      isToday: false,
      isOtherMonth: true,
      isSelected: userStore.nowSelectedDate === toDayjs(new Date(year, month + 1, i)).format('YYYY-MM-DD'),
    });
  }
  return days;
});

/** @param {Dayjs} date @description 指定された日付のイベントを取得 */
const getMonthDayEvents = (date) => {
  const dateKey = date.format('YYYY-MM-DD');
  return layoutMap.value.get(dateKey) || [];
};

/** @param {Dayjs} date @returns {number} 表示上限により省略されたイベント数 */
function getHiddenEventCount(date) {
  const dayStart = date.startOf('day');
  const dayEnd = date.endOf('day');
  const allEvents = events.value.filter((evt) => evt.startDateTime.isBefore(dayEnd) && evt.endDateTime.isAfter(dayStart));
  const displayedEventIds = new Set(
    getMonthDayEvents(date)
      .filter(Boolean)
      .map((slot) => slot.event.id),
  );
  return Math.max(0, allEvents.filter((evt) => !displayedEventIds.has(evt.id)).length);
}

/** @type {ComputedRef<Map<string, {event: HandyCalendarEvent, isStart: boolean, isEnd: boolean, isLabelStart: boolean, spanDays: number}[]>>} @description イベントの配置情報を保持するマップ */
const layoutMap = computed(() => {
  const map = new Map();
  const days = calDaysArray.value;
  const weeks = [];

  // 1週間ごとに分割
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  weeks.forEach((week, weekIndex) => {
    const weekStart = week[0].date;
    const weekEnd = week[week.length - 1].date.endOf('day');

    // この週に関係するイベントを抽出
    const weekEvents = Array.from(events.value)
      .filter((e) => e.startDateTime.isBefore(weekEnd) && e.endDateTime.isAfter(weekStart))
      .sort((a, b) => {
        // ソート: 開始日時順 > 期間が長い順
        if (a.startDateTime.unix() !== b.startDateTime.unix()) return a.startDateTime.unix() - b.startDateTime.unix();
        const durA = a.endDateTime.unix() - a.startDateTime.unix();
        const durB = b.endDateTime.unix() - b.startDateTime.unix();
        return durB - durA;
      });

    /** @type {boolean[][]} @description スロットの埋まり具合を管理する配列（例: slots[row][dayIndex]）*/
    const slots = [];

    weekEvents.forEach((evt) => {
      // 週内での開始・終了インデックスを計算 (0-6)
      let startIndex = 0;
      let endIndex = 6;

      // 開始日時が週の開始日より後であれば、開始インデックスを計算
      if (evt.startDateTime.isAfter(weekStart)) {
        startIndex = evt.startDateTime.diff(weekStart, 'day');
      }
      if (evt.endDateTime.isBefore(weekEnd)) {
        endIndex = evt.endDateTime.diff(weekStart, 'day');
        // 00:00終了の場合は前日までとする
        if (evt.endDateTime.hour() === 0 && evt.endDateTime.minute() === 0 && evt.endDateTime.isAfter(evt.startDateTime)) {
          endIndex -= 1;
        }
      }

      // 範囲外補正
      startIndex = Math.max(0, startIndex);
      endIndex = Math.min(6, endIndex);
      if (startIndex > endIndex) return;

      // 空いている行を探す
      let row = 0;
      if (userStore.maxEventBarsPerCell <= 0) return;
      while (true) {
        if (row >= userStore.maxEventBarsPerCell) return;
        if (!slots[row]) slots[row] = new Array(7).fill(false);
        let isFree = true;
        for (let i = startIndex; i <= endIndex; i++) {
          if (slots[row][i]) {
            isFree = false;
            break;
          }
        }
        if (isFree) break;
        row++;
      }

      // スロットを埋める
      for (let i = startIndex; i <= endIndex; i++) slots[row][i] = true;

      // マップに登録（各日のセルに表示情報を渡す）
      for (let i = 0; i < 7; i++) {
        const d = week[i];
        if (!d) continue;
        const key = d.date.format('YYYY-MM-DD');

        let daySlots = map.get(key);
        if (!daySlots) {
          daySlots = [];
          map.set(key, daySlots);
        }
        // 必要に応じて配列を拡張
        while (daySlots.length <= row) daySlots.push(null);

        // イベント表示範囲内であれば情報をセット
        if (i >= startIndex && i <= endIndex) {
          daySlots[row] = {
            event: evt,
            isStart: i === startIndex,
            isEnd: i === endIndex || (weekIndex === weeks.length - 1 && i === week.length - 1),
            isLabelStart: i === startIndex || i === 0,
            spanDays: i === startIndex || i === 0 ? endIndex - i + 1 : 1,
          };
        }
      }
    });
  });
  return map;
});

/** @returns {Record<string, string>} 可変セル高時の週ごとの行高 */
const monthGridStyle = computed(() => {
  const rows = [];
  const isVariable = userStore.calendarCellHeightMode === 'VARIABLE';
  for (let index = 0; index < calDaysArray.value.length; index += 7) {
    const week = calDaysArray.value.slice(index, index + 7);
    const eventRowCount = isVariable ? Math.max(...week.map((day) => getMonthDayEvents(day.date).length), 0) : userStore.maxEventBarsPerCell;
    const contentHeight = 24 + eventRowCount * 18 + Math.max(0, eventRowCount - 1) * 2 + 4;
    rows.push(`max(var(--calendar-cell-min-height), ${contentHeight}px)`);
  }
  return { gridTemplateRows: rows.join(' ') };
});

/**
 * イベントクリック時の処理
 * @param {Event} clickEvent - クリックイベント
 * @param {HandyCalendarEvent} evt - イベント情報
 * @param {Dayjs} date - クリックされたイベントバーの日付
 */
const handleEventClick = (clickEvent, evt, date) => {
  clickEvent.stopPropagation();
  if (userStore.isMobile || userStore.isTablet) {
    selectDateCell(date);
    return;
  }
  userStore.setNowSelectedEvent({ eid: evt.id, cid: evt.calendarId });
  router.push({ name: 'EventDetail' });
};

/** @param {Dayjs} date 日付セルをクリックした日付 */
function handleCellClick(date) {
  if (suppressNextCellClick.value) {
    suppressNextCellClick.value = false;
    return;
  }
  selectDateCell(date);
}

/** @param {HandyCalendarEvent} evt @returns {boolean} 自分以外の参加者がいるか */
function hasOtherAttendees(evt) {
  return evt.raw?.attendees?.some((attendee) => !attendee.self) ?? false;
}

/** @param {TouchEvent} evt @param {Dayjs} date 長押し対象の日付 */
function startCellLongPress(evt, date) {
  if (!(userStore.isMobile || userStore.isTablet) || evt.touches.length !== 1) return;
  const touch = evt.touches[0];
  cancelCellLongPress();
  longPressTimer.value = window.setTimeout(() => {
    longPressTimer.value = null;
    suppressNextCellClick.value = true;
    selectDateCell(date);
    const menuEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      clientX: touch.clientX,
      clientY: touch.clientY,
    });
    rfDropdownForContextMenu.value?.open(menuEvent);
  }, 500);
}

/** @param {MouseEvent} evt @param {Dayjs} date セルのコンテキストメニュー */
function handleCellContextMenu(evt, date) {
  evt.preventDefault();
  if (userStore.isMobile || userStore.isTablet) return;
  openContextMenu(evt, date);
}

/** @param {TouchEvent} evt セルのタッチ終了 */
function finishCellTouch(evt) {
  cancelCellLongPress();
  finishMonthSwipe(evt);
}

/** 長押しタイマーを解除 */
function cancelCellLongPress() {
  if (longPressTimer.value !== null) {
    window.clearTimeout(longPressTimer.value);
    longPressTimer.value = null;
  }
}

/** @param {TouchEvent} evt 日付セル上の移動イベント */
function handleCellTouchMove(evt) {
  if (evt.touches.length !== 1) {
    cancelCellLongPress();
    return;
  }
  handleMonthSwipeMove(evt);
}

/** @param {TouchEvent} evt 月表示のタッチ開始イベント */
function startMonthSwipe(evt) {
  if ((!userStore.isMobile && !userStore.isTablet) || evt.touches.length !== 1) return;
  const touch = evt.touches[0];
  swipeStart.value = { x: touch.clientX, y: touch.clientY };
}

/** @param {TouchEvent} evt 横スワイプ中のタッチ移動イベント */
function handleMonthSwipeMove(evt) {
  const start = swipeStart.value;
  if (!start || (!userStore.isMobile && !userStore.isTablet) || evt.touches.length !== 1) return;
  const touch = evt.touches[0];
  const deltaX = touch.clientX - start.x;
  const deltaY = touch.clientY - start.y;
  if (Math.abs(deltaY) > 12 && Math.abs(deltaY) > Math.abs(deltaX) * 1.25) {
    cancelCellLongPress();
    return;
  }
  if (Math.abs(deltaX) > 12 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) {
    cancelCellLongPress();
  }
}

/** @param {TouchEvent} evt 月表示のタッチ終了イベント */
function finishMonthSwipe(evt) {
  const start = swipeStart.value;
  swipeStart.value = null;
  if (!start || (!userStore.isMobile && !userStore.isTablet) || evt.changedTouches.length !== 1) return;

  const touch = evt.changedTouches[0];
  const deltaX = touch.clientX - start.x;
  const deltaY = touch.clientY - start.y;
  if (Math.abs(deltaX) < 60 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) return;
  if (deltaX > 0) goPreviousMonth();
  else goNextMonth();
}

/** 前月へ移動します。 */
function goPreviousMonth() {
  monthTransition.value = 'prev';
  userStore.goPrevMonth();
}

/** 次月へ移動します。 */
function goNextMonth() {
  monthTransition.value = 'next';
  userStore.goNextMonth();
}

/** 今日へ移動します。 */
function goToday() {
  monthTransition.value = 'today';
  userStore.goToday();
}

/** @param {Dayjs} date 日付セルで選択された日付 */
const selectDateCell = (date) => {
  const selectedDate = date.format('YYYY-MM-DD');
  const isDifferentDate = userStore.nowSelectedDate !== selectedDate;

  userStore.setNowSelectedDate(date);
  if (router.currentRoute.value.name === 'EventDetail' && isDifferentDate) {
    router.push({ name: 'Home' });
  }
};

/**
 * 日付セルのコンテキストメニューを開く
 * @param {MouseEvent} evt - 右クリックイベント
 * @param {Dayjs} date - 右クリックされた日付情報
 */
const openContextMenu = (evt, date) => {
  selectDateCell(date);
  rfDropdownForContextMenu.value?.open(evt);
};

/** @param {string} action コンテキストメニューを選択したときのハンドラ */
const onSelectContextMenu = (action) => {
  switch (action) {
    // 選択中の日付で新しい予定を作成
    case 'CreateEvent':
      userStore.setNowSelectedEvent(null);
      router.push({ name: 'EventCreator' });
      break;
    default:
      break;
  }
  rfDropdownForContextMenu.value?.close();
};

/** @param {WheelEvent} evt カレンダー上のホイール操作 */
const handleCalendarWheel = (evt) => {
  if (!userStore.useWheelMonthNavigation || evt.ctrlKey || evt.metaKey || evt.deltaY === 0) return;

  const now = Date.now();
  if (now - lastWheelNavigationAt.value < 400) {
    evt.preventDefault();
    return;
  }

  evt.preventDefault();
  lastWheelNavigationAt.value = now;
  if (evt.deltaY < 0) goPreviousMonth();
  else goNextMonth();
};

/**
 * スタイルクラス計算
 * @param {Object} day - 日付情報
 * @param {boolean} day.isOtherMonth - 他の月の日付かどうか
 * @param {boolean} day.isToday - 今日かどうか
 * @param {boolean} day.isSelected - 選択されているかどうか
 * @returns {string[]} クラス名の配列
 */
const getMonthCellClass = (day) => {
  const classes = ['day-cell'];
  if (day.isOtherMonth) classes.push('other-month');
  if (day.isToday) classes.push('is-today');
  if (day.isSelected) classes.push('is-selected');
  return classes;
};

/**
 * ツールバーの内容が表示幅に収まるかを実測し、収まらない場合はコンパクト表示に切り替える。
 * 展開時は3等分グリッドのため、合計幅に加えてタイトルが中央列に収まることも条件にする
 */
function updateToolbarLayout() {
  const toolbar = rfToolbar.value;
  if (!toolbar || toolbar.clientWidth === 0) return;
  const left = toolbar.querySelector('.toolbar-left');
  const title = toolbar.querySelector('h1');
  const right = toolbar.querySelector('.toolbar-right');
  if (!left || !title || !right) return;
  if (!isCompactToolbar.value) expandedRightToolbarWidth = right.scrollWidth;
  // scrollWidth はセル幅に引きずられるため、Range でテキストの自然幅を測る
  const range = document.createRange();
  range.selectNodeContents(title);
  const titleWidth = range.getBoundingClientRect().width;
  const style = getComputedStyle(toolbar);
  const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  const needed = left.scrollWidth + titleWidth + expandedRightToolbarWidth + padding + 8;
  const thirdWidth = (toolbar.clientWidth - padding) / 3;
  isCompactToolbar.value = needed > toolbar.clientWidth || titleWidth > thirdWidth + 1;
}

// カレンダーリストがロードされたり、月が変わったりしたらイベントを取得または再取得
watch(
  () => [calendarStore.listVisibleCalendars, userStore.nowUsingDate],
  async () => {
    events.value = await eventStore.listEvents(userStore.nowUsingDate.year(), userStore.nowUsingDate.month());
  },
  { immediate: true },
);

// 月タイトルの文字数が変わると必要幅が変わるため再計測する
watch(
  () => userStore.nowUsingDate,
  async () => {
    await nextTick();
    updateToolbarLayout();
  },
);

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined' && rfToolbar.value) {
    toolbarObserver = new ResizeObserver(() => updateToolbarLayout());
    toolbarObserver.observe(rfToolbar.value);
  }
  updateToolbarLayout();
});

onUnmounted(() => {
  toolbarObserver?.disconnect();
});
</script>

<template>
  <div class="calendar-month-horizontal-view" @wheel="handleCalendarWheel" @touchstart="startMonthSwipe" @touchmove="handleMonthSwipeMove" @touchend="finishMonthSwipe" @touchcancel="finishMonthSwipe">
    <header ref="rfToolbar" class="month-toolbar" :class="{ 'is-compact': isCompactToolbar }">
      <div class="toolbar-left">
        <button v-if="userStore.isMobile || userStore.isTablet" type="button" title="カレンダーを開閉" aria-label="カレンダーを開閉" @click="props.selectPane('nav')">
          <IconBars />
        </button>
        <button type="button" title="前月へ戻る" aria-label="前月へ戻る" @click="goPreviousMonth">
          <IconCaretLeft size="1.25rem" />
        </button>
        <button type="button" title="次月へ進む" aria-label="次月へ進む" @click="goNextMonth">
          <IconCaretRight size="1.25rem" />
        </button>
      </div>
      <h1>{{ relativeYearText }} {{ userStore.nowUsingDate.format('YYYY年 M月') }}</h1>
      <div class="toolbar-right">
        <template v-if="!isCompactToolbar">
          <button type="button" title="今日に戻る" aria-label="今日に戻る" @click.prevent="goToday">
            <IconArrowRotateLeft size="1.25rem" />
          </button>
          <button type="button" title="週タイムライン表示に切り替え" aria-label="週タイムライン表示に切り替え" @click="userStore.setMainCalendarView('WEEK')">
            <IconBarsStaggered size="1.25rem" />
          </button>
          <button type="button" title="ユーザー設定" aria-label="ユーザー設定" @click="router.push({ name: 'UserConfig' })">
            <IconGear size="1.25rem" />
          </button>
        </template>
        <DropdownMenu v-else>
          <template #button>
            <button type="button" title="月表示の操作" aria-label="月表示の操作">
              <IconEllipsisVertical size="1.25rem" />
            </button>
          </template>
          <button type="button" @click="goToday"><IconArrowRotateLeft size="1rem" />今日に戻る</button>
          <button type="button" @click="userStore.setMainCalendarView('WEEK')"><IconBarsStaggered size="1rem" />週タイムライン表示に切り替え</button>
          <button type="button" @click="router.push({ name: 'UserConfig' })"><IconGear size="1rem" />ユーザー設定</button>
        </DropdownMenu>
      </div>
    </header>
    <Transition :name="`month-slide-${monthTransition}`" mode="out-in">
      <div :key="userStore.nowUsingDate.format('YYYY-MM')" class="month-content" :style="calendarTextSizeStyle">
        <div class="month-header">
          <div v-for="(map, i) in userStore.daysMap" :key="i" :style="{ color: map.weekendColor ?? undefined }">
            {{ map.label }}
          </div>
        </div>

        <div class="month-grid" :class="{ 'variable-cell-height': userStore.calendarCellHeightMode === 'VARIABLE' }" :style="monthGridStyle">
          <div
            v-for="(day, idx) in calDaysArray"
            :key="day.key || idx"
            :class="getMonthCellClass(day)"
            :style="{ color: userStore.getWeekendColor(day.date.day(), day.isOtherMonth) ?? undefined }"
            @click="handleCellClick(day.date)"
            @contextmenu="handleCellContextMenu($event, day.date)"
            @touchstart="
              startCellLongPress($event, day.date);
              startMonthSwipe($event);
            "
            @touchmove="handleCellTouchMove"
            @touchend="finishCellTouch"
            @touchcancel="finishCellTouch">
            <div class="day-num" :style="{ color: userStore.getWeekendColor(day.date.day(), day.isOtherMonth) ?? undefined }">
              {{ day.date.date() }}
            </div>

            <div class="events-stack">
              <div v-for="(slot, i) in getMonthDayEvents(day.date)" :key="i" class="event-slot">
                <div
                  v-if="slot"
                  class="event-bar"
                  :class="{ 'is-start': slot.isStart, 'is-end': slot.isEnd, 'is-continued': !slot.isStart, 'is-label-start': slot.isLabelStart, 'is-touch-background': userStore.isMobile || userStore.isTablet }"
                  :style="{ backgroundColor: getEventBarColor(slot.event), width: slot.isLabelStart ? `calc(${slot.spanDays * 100}% + ${(slot.spanDays - 1) * 4}px)` : undefined }"
                  @click="(e) => handleEventClick(e, slot.event, day.date)"
                  @mousedown.stop>
                  <span v-if="slot.isLabelStart">
                    {{ slot.event.icon ?? '📌' }}{{ slot.event.summary }}
                    <IconUserGroup v-if="hasOtherAttendees(slot.event)" size="0.75rem" />
                  </span>
                </div>
              </div>
            </div>
            <span v-if="getHiddenEventCount(day.date) > 0" class="hidden-event-count" :aria-label="`非表示の予定 ${getHiddenEventCount(day.date)}件`"> +{{ getHiddenEventCount(day.date) }} </span>
          </div>
        </div>
      </div>
    </Transition>

    <DropdownMenu ref="rfDropdownForContextMenu">
      <button type="button" @click="onSelectContextMenu('CreateEvent')">予定を作成</button>
    </DropdownMenu>
  </div>
</template>

<style lang="scss" scoped>
@use '@/styles/vars.scss' as var;
$event-bar-radius: 4px;

.calendar-month-horizontal-view {
  --calendar-cell-min-height: calc(100px + 2px + 2px + 1px);
  display: flex;
  flex-direction: column;
  overflow: auto;
  height: 100%;
  overflow-y: hidden;
  touch-action: pan-y;
  border-radius: var(--border-radius);

  .month-content {
    display: flex;
    flex: 1 0 auto;
    min-height: calc(100% - 54px);
    max-height: calc(100% - 54px - var(--space-sm) - var(--space-sm) - var(--space-md));
    flex-direction: column;
    overflow-y: auto;
    border-radius: var(--border-radius);
    background-color: var(--bg-1);
    margin: var(--space-sm);
    font-family: var(--calendar-font-family);
  }

  @include var.mdown(sm) {
    &::after {
      display: none;
    }

    .month-content {
      flex: 1 1 auto;
      min-height: 0;
      max-height: calc(100% - 54px - var(--space-sm) - var(--space-sm));
      margin-bottom: 0;
    }
  }

  .month-slide-prev-enter-active,
  .month-slide-prev-leave-active,
  .month-slide-next-enter-active,
  .month-slide-next-leave-active {
    transition:
      transform 0.22s ease,
      opacity 0.22s ease;
  }

  .month-slide-prev-enter-from {
    transform: translateX(-8%);
    opacity: 0;
  }
  .month-slide-prev-leave-to {
    transform: translateX(8%);
    opacity: 0;
  }
  .month-slide-next-enter-from {
    transform: translateX(8%);
    opacity: 0;
  }
  .month-slide-next-leave-to {
    transform: translateX(-8%);
    opacity: 0;
  }

  .month-slide-today-enter-active,
  .month-slide-today-leave-active {
    transition: opacity 0.18s ease;
  }

  .month-slide-today-enter-from,
  .month-slide-today-leave-to {
    opacity: 0;
  }

  .month-toolbar {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    padding: var(--space-sm) var(--space-sm) 0 var(--space-sm);
    background: var(--bg-1);

    button {
      background-color: var(--bg-1);

      &:hover {
        background: var(--bg-2);
      }
    }

    div {
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      @include var.mdown(sm) {
        gap: 0;
      }
      &:nth-child(3) {
        justify-content: flex-end;
      }
    }

    h1 {
      font-size: var(--text-size-xl);
      @include var.mdown(sm) {
        font-size: var(--text-size-lg);
      }
      display: flex;
      align-items: center;
      justify-content: center;
      white-space: nowrap;
      overflow: hidden;
    }

    // 収まらない場合は左右2ブロック構成にし、タイトルは右側のメニューボタンに寄せる
    &.is-compact {
      grid-template-columns: auto 1fr auto;

      h1 {
        justify-content: flex-end;
        padding-right: var(--space-xs);
      }
    }
  }

  .month-actions {
    display: flex;
    align-items: center;
    gap: var(--space-xs);

    button {
      justify-content: center;
      padding: var(--space-xs);
      border-radius: var(--border-radius);

      &:hover {
        background: var(--bg-2);
      }

      &.is-syncing .icon-arrows-rotate {
        animation: calendar-sync-spin 0.8s linear infinite;
      }
    }
  }

  .month-header {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    text-align: center;
    font-weight: bold;
    outline: 1px solid var(--border);
    background: var(--bg-0);
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .month-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    grid-auto-rows: var(--calendar-cell-min-height);
    flex: 1 0 auto;
    min-height: 0;
    overflow: hidden;
    border-radius: 0 0 var(--border-radius) var(--border-radius);

    &.variable-cell-height {
      grid-auto-rows: minmax(var(--calendar-cell-min-height), auto);
    }
  }

  .day-cell {
    min-height: var(--calendar-cell-min-height);
    box-sizing: border-box;
    border-top: 1px solid var(--border);
    position: relative;
    padding: 2px;
    user-select: none;
    background: var(--bg-0);

    &:nth-last-child(7) {
      border-bottom-left-radius: var(--border-radius);
    }

    &:last-child {
      border-bottom-right-radius: var(--border-radius);
    }

    &.other-month {
      background-color: var(--bg-2);

      .day-num {
        color: var(--text-light);
      }
    }

    &.is-today .day-num {
      background: #2b941180;
      color: white;
      border-radius: 50%;
      width: var(--space-lg);
      height: var(--space-lg);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    &.is-selected {
      background-color: var(--selected);
    }

    .day-num {
      position: absolute;
      top: 0;
      left: 2px;
      font-size: var(--text-size-sm);
      font-weight: bold;
      z-index: 1;
    }

    .events-stack {
      margin-top: 24px;
      display: flex;
      flex-direction: column;
      gap: 2px;

      .event-slot {
        height: 18px;
        min-width: 0;
      }

      .event-bar {
        display: flex;
        align-items: center;
        background: var(--primary);
        color: white;
        border-radius: $event-bar-radius;
        font-size: var(--text-size-xs);
        height: 100%;
        box-sizing: border-box;
        cursor: pointer;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;

        &.is-touch-background {
          pointer-events: none;
          cursor: default;
        }

        > span {
          height: 100%;
          line-height: 16px;
        }

        &.is-label-start {
          position: relative;
          z-index: 1;
          border-top-right-radius: $event-bar-radius;
          border-bottom-right-radius: $event-bar-radius;
        }

        &.is-continued {
          border-top-left-radius: 0;
          border-bottom-left-radius: 0;
          margin-left: -4px;
          /* 境界をまたぐ見た目調整 */
          padding-left: 6px;
        }

        &.is-start {
          border-top-left-radius: $event-bar-radius;
          border-bottom-left-radius: $event-bar-radius;
        }

        &.is-end {
          border-top-right-radius: $event-bar-radius;
          border-bottom-right-radius: $event-bar-radius;
        }

        &:not(.is-end):not(.is-label-start) {
          border-top-right-radius: 0;
          border-bottom-right-radius: 0;
          margin-right: -4px;
        }

        &:hover {
          filter: brightness(1.1);
          z-index: 5;
        }
      }
    }

    .hidden-event-count {
      position: absolute;
      right: 4px;
      bottom: 2px;
      padding: 0 var(--space-xs);
      border-radius: var(--border-radius);
      background: var(--bg-2);
      color: var(--danger);
      font-size: var(--text-size-sm);
      font-weight: bold;
      line-height: 1.2;
      opacity: 0.62;
      z-index: 2;
      pointer-events: none;
    }

    &.is-selected .hidden-event-count {
      opacity: 1;
    }

    .cell-icons {
      position: absolute;
      bottom: 2px;
      right: 2px;
      display: flex;
      gap: 4px;
      color: var(--text-light);

      &.bottom-left {
        left: 2px;
        right: auto;
      }
    }
  }
}
</style>
