<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { toDayjs } from '@/services/dayjs.js';
import { useCalendarEvents } from '@/composables/useCalendarEvents.js';
import { useEvents } from '@/composables/useEvents.js';
import { useCalendarStore } from '@/stores/calendar.js';
import { useUserStore } from '@/stores/user.js';
import { USER_TEXT_SIZE_VALUES } from '@/stores/user.js';
import { useCalendarToolbar } from '@/composables/useCalendarToolbar.js';
import { buildMonthLayout } from '@/composables/useMonthLayout.js';
import { isDotEventBar, getEventBarStyle, getEventDotColor } from '@/composables/useEventBarStyle.js';
import { buildCustomHolidayBody, holidayDatesOf } from '@/services/custom-holidays.js';
import { isJapaneseHoliday } from '@/services/japanese-holidays.js';
import DropdownMenu from '@/components/DropdownMenu.vue';
import IconCaretLeft from '@/components/icons/IconCaretLeft.vue';
import IconCaretRight from '@/components/icons/IconCaretRight.vue';
import IconBars from '@/components/icons/IconBars.vue';
import IconGear from '@/components/icons/IconGear.vue';
import IconUserGroup from '@/components/icons/IconUserGroup.vue';
import IconBarsStaggered from '@/components/icons/IconBarsStaggered.vue';
import IconArrowsUpDown from '@/components/icons/IconArrowsUpDown.vue';
import IconArrowRotateLeft from '@/components/icons/IconArrowRotateLeft.vue';
import IconEllipsisVertical from '@/components/icons/IconEllipsisVertical.vue';
import IconMagnifyingGlass from '@/components/icons/IconMagnifyingGlass.vue';
import IconWandMagicSparkles from '@/components/icons/IconWandMagicSparkles.vue';
import InlineEmoji from '@/components/InlineEmoji.vue';

const router = useRouter();
const userStore = useUserStore();
const calendarStore = useCalendarStore();
const eventsService = useEvents();

const calendarTextSizeStyle = computed(() => Object.fromEntries(Object.entries(USER_TEXT_SIZE_VALUES[userStore.calendarTextSize]).map(([name, value]) => [`--text-size-${name}`, value])));

const props = defineProps({
  selectPane: { type: Function, default: () => {} },
  /** 日付ピッカーモード。true の場合、セルのクリックは pick イベントを発行し、コンテキストメニューやドラッグ作成は無効化される */
  pickMode: { type: Boolean, default: false },
});
const emit = defineEmits(['pick']);
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

/** @type {Ref<Dayjs|null>} 日付範囲ドラッグの開始日 */
const dragStartDate = ref(null);
/** @type {Ref<Dayjs|null>} 日付範囲ドラッグの現在位置の日 */
const dragEndDate = ref(null);
/** @type {Ref<boolean>} 範囲ドラッグが有効になっているか */
const isRangeDragging = ref(false);
/** @type {Ref<{start: Dayjs, end: Dayjs}|null>} コンテキストメニューが対象とする日付範囲 */
const contextMenuRange = ref(null);
/** @type {ComputedRef<boolean>} イベントフォームからの日付選択要求中かどうか */
const isFormPicking = computed(() => !!userStore.formDatePick);
/** @type {ComputedRef<string>} フォーム日付ピック中の案内文 */
const pickBannerText = computed(() => {
  const field = userStore.formDatePick?.field ?? '';
  if (field === 'expiryDate') return `有効期限を選択してください（セルをクリック/タップ）`;
  const label = field === 'endDate' || field === 'rangeEnd' ? '終了日' : '開始日';
  return `${label}を選択してください（セルをクリック/タップ、ドラッグで期間選択）`;
});
/** @type {Ref<boolean>} 範囲ドラッグで終了したタッチを月スワイプとして扱わないためのフラグ */
const suppressSwipeOnRelease = ref(false);
/** @type {{date: Dayjs}|null} マウスダウンしたセル（ドラッグ開始判定用） */
let mouseDownCell = null;

/** @type {Ref<HTMLElement|null>} ツールバー */
const rfToolbar = ref(null);
/** ツールバーのコンパクト表示状態・週/月タイトルは週表示ビューと共有ロジック */
const { isCompactToolbar, monthTitle } = useCalendarToolbar(rfToolbar);

/** @type {ComputedRef<{date: Dayjs, key: string, isToday: boolean, isOtherMonth: boolean, isSelected: boolean}[]>} @description カレンダーメインの日付配列 */
const calDaysArray = computed(() => {
  const today = toDayjs();
  const days = [];
  const year = userStore.nowUsingDate.year();
  const month = userStore.nowUsingDate.month();

  const firstDay = toDayjs(year, month, 1);
  const lastDay = toDayjs(year, month + 1, 0);

  const dayOfFirst = firstDay.day();
  const prevPadding = (dayOfFirst - userStore.firstDayOfWeek + 7) % 7;

  // 前月分
  for (let i = prevPadding; i > 0; i--) {
    days.push({
      date: toDayjs(year, month, 1 - i),
      key: `prev-${i}`,
      isToday: false,
      isOtherMonth: true,
      isSelected: userStore.nowSelectedDate === toDayjs(year, month, 1 - i).format('YYYY-MM-DD'),
    });
  }
  // 当月分
  for (let i = 1; i <= lastDay.date(); i++) {
    days.push({
      date: toDayjs(year, month, i),
      key: `curr-${i}`,
      isToday: toDayjs(year, month, i).format('YYYY-MM-DD') === today.format('YYYY-MM-DD'),
      isOtherMonth: false,
      isSelected: userStore.nowSelectedDate === toDayjs(year, month, i).format('YYYY-MM-DD'),
    });
  }
  // 次月分
  const currentDaysCount = prevPadding + lastDay.date();
  const nextPadding = (7 - (currentDaysCount % 7)) % 7;
  // 横表示の場合は行数を固定せず、必要分だけ埋めるのが一般的
  // ここでは最低 5-6 行確保するロジックを入れても良いが、シンプルに余り分を追加
  for (let i = 1; i <= nextPadding; i++) {
    days.push({
      date: toDayjs(year, month + 1, i),
      key: `next-${i}`,
      isToday: false,
      isOtherMonth: true,
      isSelected: userStore.nowSelectedDate === toDayjs(year, month + 1, i).format('YYYY-MM-DD'),
    });
  }
  return days;
});

/** @type {ComputedRef<{start: Dayjs, end: Dayjs}>} グリッドに表示している日付範囲（イベント購読用） */
const visibleRange = computed(() => ({
  start: calDaysArray.value[0]?.date.startOf('day') ?? toDayjs().startOf('day'),
  end: calDaysArray.value[calDaysArray.value.length - 1]?.date.endOf('day') ?? toDayjs().endOf('day'),
}));

/** 表示範囲のイベント・カスタム休日。取得は composable 側のバックグラウンド処理 */
const { events, customHolidays, customHolidayDates } = useCalendarEvents(visibleRange);

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

/** @type {ComputedRef<Map<string, (import('@/composables/useMonthLayout.js').MonthEventSlot|null)[]>>} @description イベントの配置情報を保持するマップ */
const layoutMap = computed(() => buildMonthLayout(calDaysArray.value, events.value, userStore.maxEventBarsPerCell));

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
  if (suppressNextCellClick.value) {
    suppressNextCellClick.value = false;
    return;
  }
  if (isFormPicking.value) {
    resolveFormDatePick(date, date);
    return;
  }
  if (props.pickMode) {
    emit('pick', date);
    return;
  }
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
  if (isFormPicking.value) {
    resolveFormDatePick(date, date);
    return;
  }
  if (props.pickMode) {
    emit('pick', date);
    return;
  }
  selectDateCell(date);
}

// #region 日付範囲ドラッグ選択

/**
 * フォームの日付ピック要求へ選択結果を返す
 * @param {Dayjs} start 範囲の開始日
 * @param {Dayjs} end 範囲の終了日（含む側）
 */
function resolveFormDatePick(start, end) {
  const pick = userStore.formDatePick ?? { target: 'eventForm', field: 'startDate' };
  userStore.resolveFormDatePick({ target: pick.target, field: pick.field, start: start.format('YYYY-MM-DD'), end: end.format('YYYY-MM-DD') });
}

/** @param {Dayjs} date @returns {boolean} ドラッグ選択中、またはメニュー表示中の確定済み範囲に含まれるか */
function isInDragRange(date) {
  let start, end;
  if (isRangeDragging.value && dragStartDate.value) {
    start = dragStartDate.value;
    end = dragEndDate.value ?? start;
  } else if (contextMenuRange.value) {
    // ドロップ後のコンテキストメニューが開いている間は確定範囲を表示し続ける
    ({ start, end } = contextMenuRange.value);
  } else {
    return false;
  }
  const [first, last] = start.isAfter(end, 'day') ? [end, start] : [start, end];
  return !date.isBefore(first, 'day') && !date.isAfter(last, 'day');
}

/**
 * ドラッグ確定後にコンテキストメニューを開く
 * @param {{x: number, y: number}} position メニューの表示位置
 * @returns {void}
 */
function finalizeDragRange(position) {
  const anchor = dragStartDate.value;
  const end = dragEndDate.value ?? anchor;
  isRangeDragging.value = false;
  mouseDownCell = null;
  dragStartDate.value = null;
  dragEndDate.value = null;
  if (!anchor || !end) return;
  suppressNextCellClick.value = true;
  // このタッチの終了を横スワイプ（月移動）として処理しない
  suppressSwipeOnRelease.value = true;
  const range = anchor.isAfter(end, 'day') ? { start: end, end: anchor } : { start: anchor, end };
  if (isFormPicking.value) {
    // フォームの日付ピック中はメニューを開かず、選択範囲をフォームへ返す
    resolveFormDatePick(range.start, range.end);
    return;
  }
  contextMenuRange.value = range;
  // mouseup/touchend 直後に発火する click を DropdownMenu が外側クリックと判定して
  // 即座に閉じてしまうため、click ディスパッチ完了後にメニューを開く
  window.setTimeout(() => {
    rfDropdownForContextMenu.value?.open({ clientX: position.x, clientY: position.y });
  }, 0);
}

/** @param {MouseEvent} evt @param {Dayjs} date セルのマウス押下（ドラッグ選択の起点） */
function handleCellMouseDown(evt, date) {
  if (props.pickMode || userStore.isMobile || userStore.isTablet || evt.button !== 0) return;
  mouseDownCell = { date };
  window.addEventListener('mouseup', handleGlobalMouseUp, { once: true });
}

/** @param {Dayjs} date セルへのマウス進入（ドラッグ中は範囲を更新） */
function handleCellMouseEnter(date) {
  if (!mouseDownCell) return;
  if (!isRangeDragging.value && !date.isSame(mouseDownCell.date, 'day')) {
    isRangeDragging.value = true;
    dragStartDate.value = mouseDownCell.date;
  }
  if (isRangeDragging.value) dragEndDate.value = date;
}

/** @param {MouseEvent} evt グローバルのマウス解放（ドロップ検知） */
function handleGlobalMouseUp(evt) {
  const wasDragging = isRangeDragging.value;
  mouseDownCell = null;
  if (wasDragging) finalizeDragRange({ x: evt.clientX, y: evt.clientY });
}

/** @param {TouchEvent} evt タッチ位置から日付セルを解決してドラッグ終端を更新する */
function updateTouchDragEnd(evt) {
  const touch = evt.touches?.[0] ?? evt.changedTouches?.[0];
  if (!touch) return;
  const cell = document.elementFromPoint(touch.clientX, touch.clientY)?.closest?.('.day-cell');
  const dateKey = cell?.getAttribute('data-date');
  if (dateKey) dragEndDate.value = toDayjs(dateKey);
}

// #endregion

/** @param {HandyCalendarEvent} evt @returns {boolean} 自分以外の参加者がいるか */
function hasOtherAttendees(evt) {
  return evt.raw?.attendees?.some((attendee) => !attendee.self) ?? false;
}

/** @param {TouchEvent} evt @param {Dayjs} date 長押し対象の日付 */
function startCellLongPress(evt, date) {
  if (props.pickMode || !(userStore.isMobile || userStore.isTablet) || evt.touches.length !== 1) return;
  cancelCellLongPress();
  longPressTimer.value = window.setTimeout(() => {
    longPressTimer.value = null;
    suppressNextCellClick.value = true;
    // 長押しを検知したらドラッグ中フラグを立て、開始日を記録する（終了日はタッチが離された位置）
    isRangeDragging.value = true;
    dragStartDate.value = date;
    dragEndDate.value = date;
  }, 500);
}

/** @param {MouseEvent} evt @param {Dayjs} date セルのコンテキストメニュー */
function handleCellContextMenu(evt, date) {
  evt.preventDefault();
  if (props.pickMode || isFormPicking.value || userStore.isMobile || userStore.isTablet) return;
  contextMenuRange.value = { start: date, end: date };
  openContextMenu(evt, date);
}

/** @param {TouchEvent} evt セルのタッチ終了 */
function finishCellTouch(evt) {
  cancelCellLongPress();
  if (isRangeDragging.value) {
    updateTouchDragEnd(evt);
    const touch = evt.changedTouches?.[0];
    finalizeDragRange({ x: touch?.clientX ?? 0, y: touch?.clientY ?? 0 });
  }
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
  if (isRangeDragging.value) {
    // 範囲ドラッグ中はスクロールを抑止しつつ、指の下のセルへ終端を追従させる
    evt.preventDefault();
    updateTouchDragEnd(evt);
    return;
  }
  if (evt.touches.length !== 1) {
    cancelCellLongPress();
    return;
  }
  handleMonthSwipeMove(evt);
}

/** @param {TouchEvent} evt 月表示のタッチ開始イベント */
function startMonthSwipe(evt) {
  suppressSwipeOnRelease.value = false;
  if ((!userStore.isMobile && !userStore.isTablet) || evt.touches.length !== 1) return;
  const touch = evt.touches[0];
  swipeStart.value = { x: touch.clientX, y: touch.clientY };
}

/** @param {TouchEvent} evt 横スワイプ中のタッチ移動イベント */
function handleMonthSwipeMove(evt) {
  const start = swipeStart.value;
  if (isRangeDragging.value || !start || (!userStore.isMobile && !userStore.isTablet) || evt.touches.length !== 1) return;
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
  if (suppressSwipeOnRelease.value || isRangeDragging.value || !start || (!userStore.isMobile && !userStore.isTablet) || evt.changedTouches.length !== 1) return;

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

/** @type {ComputedRef<string|null>} カスタム休日の作成先カレンダー ID（既定カレンダーが書き込み可ならそれ、なければ先頭の書き込み可カレンダー） */
const holidayCalendarId = computed(() => {
  const writable = calendarStore.listWritableCalendars;
  if (writable.some((/** @type {any} */ cal) => cal.id === userStore.defaultCalendarId)) return userStore.defaultCalendarId;
  return writable[0]?.id ?? null;
});

/** @type {ComputedRef<boolean>} コンテキストメニュー対象の範囲がすべてカスタム休日かどうか */
const isContextRangeHoliday = computed(() => {
  const range = contextMenuRange.value;
  if (!range) return false;
  for (let day = range.start; !day.isAfter(range.end, 'day'); day = day.add(1, 'day')) {
    if (!customHolidayDates.value.has(day.format('YYYY-MM-DD'))) return false;
  }
  return true;
});

/** メニュー対象範囲をカスタム休日に設定する（1件の期間イベントとして作成） */
async function setCustomHoliday() {
  const range = contextMenuRange.value;
  const calendarId = holidayCalendarId.value;
  if (!range || !calendarId) return;
  if (isContextRangeHoliday.value) {
    userStore.showToast('この日はすでに休日です');
    return;
  }
  try {
    await eventsService.createEvent(buildCustomHolidayBody(range.start.format('YYYY-MM-DD'), range.end.format('YYYY-MM-DD')), calendarId);
    userStore.showToast('休日に設定しました');
  } catch {
    userStore.showToast('休日の設定に失敗しました');
  }
}

/** メニュー対象範囲にかかるカスタム休日イベントを削除する */
async function unsetCustomHoliday() {
  const range = contextMenuRange.value;
  if (!range) return;
  const keys = new Set();
  for (let day = range.start; !day.isAfter(range.end, 'day'); day = day.add(1, 'day')) keys.add(day.format('YYYY-MM-DD'));
  const targets = customHolidays.value.filter((evt) => holidayDatesOf(evt).some((key) => keys.has(key)));
  await Promise.all(targets.map((evt) => eventsService.removeEvent(evt.id, evt.calendarId)));
  if (targets.length > 0) userStore.showToast('休日を解除しました');
}

/** @param {string} action コンテキストメニューを選択したときのハンドラ */
const onSelectContextMenu = (action) => {
  switch (action) {
    // 選択中の日付範囲で新しい予定を作成（終日、終了日は含む側で渡す）
    case 'CreateEvent': {
      userStore.setNowSelectedEvent(null);
      const start = contextMenuRange.value?.start ?? toDayjs(userStore.nowSelectedDate ?? undefined);
      const end = contextMenuRange.value?.end ?? start;
      router.push({ name: 'EventCreator', query: { start: start.format('YYYY-MM-DD'), end: end.format('YYYY-MM-DD'), allday: '1' } });
      break;
    }
    // テンプレート一覧を開き、選択したテンプレートで予定を作成
    case 'CreateFromTemplate':
      userStore.setNowSelectedEvent(null);
      router.push({ name: 'EventTemplatePicker' });
      break;
    // 選択中の日付をカスタム休日に設定
    case 'SetCustomHoliday':
      void setCustomHoliday();
      break;
    // 選択中の日付のカスタム休日を解除
    case 'UnsetCustomHoliday':
      void unsetCustomHoliday();
      break;
    default:
      break;
  }
  rfDropdownForContextMenu.value?.close();
};

/** @param {WheelEvent} evt カレンダー上のホイール操作 */
const handleCalendarWheel = (evt) => {
  if (!userStore.useWheelMonthNavigation || evt.ctrlKey || evt.metaKey || evt.deltaY === 0) return;

  const now = toDayjs().valueOf();
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
  if (isInDragRange(day.date)) classes.push('is-in-drag-range');
  return classes;
};

/**
 * 日付数字の色。祝日・カスタム休日はユーザ設定の休日色、それ以外は曜日設定の色
 * @param {Object} day 日付情報
 * @returns {string|undefined} 適用する色
 */
const getDayNumberColor = (day) => {
  if (isJapaneseHoliday(day.date)) return userStore.getHolidayColor(day.isOtherMonth);
  if (customHolidayDates.value.has(day.date.format('YYYY-MM-DD'))) return userStore.getCustomHolidayColor(day.isOtherMonth);
  return userStore.getWeekendColor(day.date.day(), day.isOtherMonth) ?? undefined;
};

// イベントの取得・再取得は useCalendarEvents が担う（ビューは表示範囲を渡すだけで待機しない）
</script>

<template>
  <div class="calendar-month-horizontal-view" :class="{ 'is-dragging': isRangeDragging }" @wheel="handleCalendarWheel" @touchstart="startMonthSwipe" @touchmove="handleMonthSwipeMove" @touchend="finishMonthSwipe" @touchcancel="finishMonthSwipe">
    <div v-if="isFormPicking" class="form-pick-banner" role="status">
      <span>{{ pickBannerText }}</span>
      <button type="button" @click="userStore.cancelFormDatePick()">キャンセル</button>
    </div>
    <header ref="rfToolbar" class="month-toolbar" :class="{ 'is-compact': isCompactToolbar }">
      <div class="toolbar-left">
        <button v-if="userStore.isMobile || userStore.isTablet" type="button" title="カレンダーを開閉" aria-label="カレンダーを開閉" @click="props.selectPane('nav')">
          <IconBars size="1.25rem" />
        </button>
        <button type="button" title="前月へ戻る" aria-label="前月へ戻る" v-if="userStore.isDesktop" @click="goPreviousMonth">
          <IconCaretLeft size="1.25rem" />
        </button>
        <button type="button" title="次月へ進む" aria-label="次月へ進む" v-if="userStore.isDesktop" @click="goNextMonth">
          <IconCaretRight size="1.25rem" />
        </button>
      </div>
      <h1>{{ monthTitle }}</h1>
      <div class="toolbar-right">
        <template v-if="!props.pickMode">
          <template v-if="!isCompactToolbar">
            <button type="button" title="今日に戻る" aria-label="今日に戻る" @click.prevent="goToday">
              <IconArrowRotateLeft size="1.25rem" />
            </button>
            <button type="button" title="イベントを検索" aria-label="イベントを検索" @click="router.push({ name: 'EventSearch' })">
              <IconMagnifyingGlass size="1.25rem" />
            </button>
            <button type="button" title="自然言語で登録" aria-label="自然言語で登録" @click="router.push({ name: 'EventQuickAdd' })">
              <IconWandMagicSparkles size="1.25rem" />
            </button>
            <button type="button" title="縦スクロール表示にする" aria-label="縦スクロール表示にする" @click="userStore.setMainCalendarView('MONTH_VERTICAL')">
              <IconArrowsUpDown size="1.25rem" />
            </button>
            <button type="button" title="タイムライン表示にする" aria-label="タイムライン表示にする" @click="userStore.setMainCalendarView('WEEK')">
              <IconBarsStaggered size="1.25rem" />
            </button>
            <button type="button" title="個人設定" aria-label="個人設定" @click="router.push({ name: 'UserConfig' })">
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
            <button type="button" @click="router.push({ name: 'EventSearch' })"><IconMagnifyingGlass size="1rem" />イベント検索</button>
            <button type="button" @click="router.push({ name: 'EventQuickAdd' })"><IconWandMagicSparkles size="1rem" />自然言語登録</button>
            <button type="button" @click="userStore.setMainCalendarView('MONTH_VERTICAL')"><IconArrowsUpDown size="1rem" />スクロール表示にする</button>
            <button type="button" @click="userStore.setMainCalendarView('WEEK')"><IconBarsStaggered size="1rem" />タイムライン表示にする</button>
            <button type="button" @click="router.push({ name: 'UserConfig' })"><IconGear size="1rem" />個人設定</button>
          </DropdownMenu>
        </template>
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
            :style="{ color: getDayNumberColor(day) }"
            :data-date="day.date.format('YYYY-MM-DD')"
            @click="handleCellClick(day.date)"
            @contextmenu="handleCellContextMenu($event, day.date)"
            @mousedown="handleCellMouseDown($event, day.date)"
            @mouseenter="handleCellMouseEnter(day.date)"
            @touchstart="
              startCellLongPress($event, day.date);
              startMonthSwipe($event);
            "
            @touchmove="handleCellTouchMove"
            @touchend="finishCellTouch"
            @touchcancel="finishCellTouch">
            <div class="day-num" :style="{ color: getDayNumberColor(day) }">
              {{ day.date.date() }}
            </div>

            <div class="events-stack">
              <div v-for="(slot, i) in getMonthDayEvents(day.date)" :key="i" class="event-slot">
                <div
                  v-if="slot"
                  class="event-bar"
                  :class="{ 'is-start': slot.isStart, 'is-end': slot.isEnd, 'is-continued': !slot.isStart, 'is-label-start': slot.isLabelStart, 'is-touch-background': userStore.isMobile || userStore.isTablet, 'is-dot': isDotEventBar(slot.event) }"
                  :style="{ ...getEventBarStyle(slot.event), width: slot.isLabelStart ? `calc(${slot.spanDays * 100}% + ${(slot.spanDays - 1) * 4}px)` : undefined }"
                  @click="(e) => handleEventClick(e, slot.event, day.date)"
                  @mousedown.stop>
                  <span v-if="slot.isLabelStart">
                    <i v-if="isDotEventBar(slot.event)" class="event-dot" :style="{ backgroundColor: getEventDotColor(slot.event) }"></i>
                    <InlineEmoji :emoji="slot.event.icon" /> {{ slot.event.summary }}
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

    <DropdownMenu ref="rfDropdownForContextMenu" @close="contextMenuRange = null">
      <button type="button" @click="onSelectContextMenu('CreateEvent')">予定を作成</button>
      <button type="button" @click="onSelectContextMenu('CreateFromTemplate')">テンプレートから作成</button>
      <button v-if="isContextRangeHoliday" type="button" @click="onSelectContextMenu('UnsetCustomHoliday')">休日から解除</button>
      <button v-else type="button" @click="onSelectContextMenu('SetCustomHoliday')">休日にする</button>
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

  // 範囲ドラッグ中はブラウザの縦スクロールを止めてセル追従を優先する
  &.is-dragging,
  &.is-dragging .month-content {
    touch-action: none;
  }

  .form-pick-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
    padding: var(--space-xs) var(--space-sm);
    background: color-mix(in srgb, var(--primary) 15%, var(--bg-1));
    border-bottom: 1px solid var(--border);
    font-size: var(--text-size-sm);

    > button {
      flex: 0 0 auto;
      padding: var(--space-xs) var(--space-sm);
      background: var(--bg-2);
      border: 1px solid var(--border);

      &:hover {
        background: var(--bg-3);
      }
    }
  }

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

    &.is-in-drag-range {
      background-color: var(--selected);
      outline: 1px dashed var(--primary);
      outline-offset: -1px;
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

        &.is-dot {
          background: transparent;
          color: var(--text);

          .event-dot {
            display: inline-block;
            width: 7px;
            height: 7px;
            margin-right: 2px;
            border-radius: 50%;
            vertical-align: middle;
          }
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
