<script setup>
/**
 * 月カレンダーの縦スクロールビュー。
 * 上下のスクロール・スワイプで前後の月へ移動する。
 * フォーカス中の月を基準に前後2ヶ月分のグリッドを1枚の大きなカレンダーとして生成する。
 * 下スクロールではグリッド末尾の月（2ヶ月後）の最後から1段上の行が、上スクロールでは
 * グリッド先頭の月（2ヶ月前）の最初から1段下の行がビューに入った時点で、
 * フォーカスを隣の月へ移し、グリッドを再生成してスクロール位置を調整する。
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import dayjs, { toDayjs } from '@/services/dayjs.js';
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
import IconCalendarDays from '@/components/icons/IconCalendarDays.vue';
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
});

/** @type {Ref<HTMLElement|null>} 縦スクロール領域 */
const rfScroll = ref(null);
/** @type {Ref<HTMLElement|null>} ツールバー */
const rfToolbar = ref(null);
/** @type {Ref<{ open: (event: MouseEvent) => void, close: () => void }|null>} コンテキストメニュー表示用のドロップダウンへの直接の参照 */
const rfDropdownForContextMenu = ref(null);
/** @type {Ref<number|null>} 日付セル長押しタイマー */
const longPressTimer = ref(null);
/** @type {Ref<boolean>} 長押し後のクリックを抑制するフラグ */
const suppressNextCellClick = ref(false);

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
/** @type {{date: Dayjs}|null} マウスダウンしたセル（ドラッグ開始判定用） */
let mouseDownCell = null;

/** ツールバーのコンパクト表示状態・月タイトルは他のビューと共有ロジック */
const { isCompactToolbar, monthTitle } = useCalendarToolbar(rfToolbar);

/** @type {Ref<Dayjs>} フォーカス中の月（月初め） */
const focusedMonth = ref(userStore.nowUsingDate.startOf('month'));

/**
 * @typedef {Object} GridDay
 * @property {Dayjs} date 日付（レイアウト計算用。空白セルでも配置計算のため保持する）
 * @property {string} key セルキー
 * @property {boolean} isPadding 週の先頭・末尾の曜日位置合わせ用の空白セルかどうか（描画しない）
 * @property {boolean} isToday 今日かどうか
 * @property {boolean} isSelected 選択中の日付かどうか
 */

/**
 * フォーカス中の月と前後2ヶ月を連結した連続した日付配列を生成する。
 * 月の切れ目に空白を挟まず（30日の次には翌月1日が続く）、先頭と末尾のみ曜日位置合わせの空白セルを入れる。
 * @returns {GridDay[]} 7 の倍数個のセル
 */
function buildScrollDays() {
  const today = toDayjs();
  const rangeStart = focusedMonth.value.subtract(2, 'month').startOf('month');
  const rangeEnd = focusedMonth.value.add(2, 'month').endOf('month');
  const days = [];

  const leadCount = (rangeStart.day() - userStore.firstDayOfWeek + 7) % 7;
  for (let i = 0; i < leadCount; i++) {
    days.push({ date: rangeStart.subtract(leadCount - i, 'day'), key: `lead-${i}`, isPadding: true, isToday: false, isSelected: false });
  }
  for (let date = rangeStart; !date.isAfter(rangeEnd); date = date.add(1, 'day')) {
    days.push({ date, key: `day-${date.format('YYYY-MM-DD')}`, isPadding: false, isToday: date.isSame(today, 'day'), isSelected: userStore.nowSelectedDate === date.format('YYYY-MM-DD') });
  }
  const trailCount = (7 - (days.length % 7)) % 7;
  for (let i = 1; i <= trailCount; i++) {
    days.push({ date: rangeEnd.add(i, 'day'), key: `trail-${i}`, isPadding: true, isToday: false, isSelected: false });
  }
  return days;
}

/** @type {ComputedRef<GridDay[]>} フォーカス中の月と前後2ヶ月を連結した連続グリッド */
const days = computed(() => buildScrollDays());

/** @type {ComputedRef<{start: Dayjs, end: Dayjs}>} イベントを取得する範囲（グリッドは軸月±2ヶ月だが、データ取得は±1ヶ月） */
const visibleRange = computed(() => ({
  start: focusedMonth.value.subtract(1, 'month').startOf('month'),
  end: focusedMonth.value.add(1, 'month').endOf('month'),
}));

/** 表示範囲のイベント・カスタム休日。取得は composable 側のバックグラウンド処理 */
const { events, customHolidays, customHolidayDates } = useCalendarEvents(visibleRange);

/** @type {ComputedRef<Map<string, (import('@/composables/useMonthLayout.js').MonthEventSlot|null)[]>>} 日付ごとのイベント配置マップ */
const layout = computed(() => buildMonthLayout(days.value, events.value, userStore.maxEventBarsPerCell));

/**
 * 指定日のイベントスロットを取得する
 * @param {Dayjs} date 日付
 * @returns {(import('@/composables/useMonthLayout.js').MonthEventSlot|null)[]}
 */
function getDayEvents(date) {
  return layout.value.get(date.format('YYYY-MM-DD')) ?? [];
}

/**
 * 表示上限により省略されたイベント数
 * @param {Dayjs} date 日付
 * @returns {number}
 */
function getHiddenEventCount(date) {
  const dayStart = date.startOf('day');
  const dayEnd = date.endOf('day');
  const allEvents = events.value.filter((evt) => evt.startDateTime.isBefore(dayEnd) && evt.endDateTime.isAfter(dayStart));
  const displayedEventIds = new Set(
    getDayEvents(date)
      .filter(Boolean)
      .map((slot) => slot.event.id),
  );
  return Math.max(0, allEvents.filter((evt) => !displayedEventIds.has(evt.id)).length);
}

/** @type {ComputedRef<Record<string, string>>} 可変セル高時の週ごとの行高を含むグリッドスタイル */
const gridStyle = computed(() => {
  const rows = [];
  const isVariable = userStore.calendarCellHeightMode === 'VARIABLE';
  for (let index = 0; index < days.value.length; index += 7) {
    const week = days.value.slice(index, index + 7);
    const eventRowCount = isVariable ? Math.max(...week.map((day) => (day.isPadding ? 0 : getDayEvents(day.date).length)), 0) : userStore.maxEventBarsPerCell;
    const contentHeight = 24 + eventRowCount * 18 + Math.max(0, eventRowCount - 1) * 2 + 4;
    rows.push(`max(var(--calendar-cell-min-height), ${contentHeight}px)`);
  }
  return { gridTemplateRows: rows.join(' ') };
});

/** @param {HandyCalendarEvent} evt @returns {boolean} 自分以外の参加者がいるか */
function hasOtherAttendees(evt) {
  return evt.raw?.attendees?.some((attendee) => !attendee.self) ?? false;
}

/** @type {{key: string, delta: number|null, smooth: boolean}|null} グリッド再生成後に復元するスクロール位置 */
let pendingScroll = null;

/** @type {number} 前回の scrollTop（スクロール方向の判定用） */
let lastScrollTop = 0;

/** @type {boolean} ツールバー等からのプログラムによるスムーズスクロール実行中かどうか */
let isProgrammaticScrolling = false;

/** @type {number|null} スクロールイベント間引き用の requestAnimationFrame ID */
let scrollRafId = null;

/**
 * フォーカス中の月を変更してグリッドを再生成する。
 * 再生成後は対象月ブロックの視覚位置を維持するようスクロール位置を自動調整する。
 * @param {Dayjs} date フォーカス対象の日付
 * @param {{smooth?: boolean, alignTop?: boolean}} [options={}] alignTop 時は月ブロック先頭へ移動する
 * @returns {void}
 */
function focusMonth(date, { smooth = false, alignTop = false } = {}) {
  const target = date.startOf('month');
  if (target.isSame(focusedMonth.value, 'month')) return;
  const scroller = rfScroll.value;
  const monthEl = scroller?.querySelector(`[data-month="${target.format('YYYY-MM')}"]`);
  // グリッド再生成前の、対象月ブロックの見かけ上のオフセットを記録する
  pendingScroll = { key: target.format('YYYY-MM'), delta: !alignTop && monthEl ? monthEl.offsetTop - scroller.scrollTop : null, smooth };
  focusedMonth.value = target;
  userStore.setNowUsingDate(target);
}

/** グリッド再生成後にスクロール位置を調整し、対象月の見かけ上の位置を維持する */
async function adjustScrollPosition() {
  await nextTick();
  const pending = pendingScroll;
  pendingScroll = null;
  const scroller = rfScroll.value;
  if (!pending || !scroller) return;
  const monthEl = scroller.querySelector(`[data-month="${pending.key}"]`);
  if (!monthEl) return;
  const top = pending.delta === null ? monthEl.offsetTop : monthEl.offsetTop - pending.delta;
  if (pending.smooth) {
    // スムーズスクロール中は端検出を止める。スクロール終了（scrollend）またはユーザー操作で解除する
    isProgrammaticScrolling = true;
    scroller.scrollTo({ top, behavior: 'smooth' });
  } else {
    scroller.scrollTop = top;
    lastScrollTop = top;
  }
}

watch(focusedMonth, adjustScrollPosition);

/**
 * スクロール/スワイプ時のグリッドウィンドウ更新（requestAnimationFrame で間引く）。
 * @returns {void}
 */
function handleScroll() {
  if (scrollRafId !== null) return;
  scrollRafId = requestAnimationFrame(() => {
    scrollRafId = null;
    const scroller = rfScroll.value;
    if (!scroller) return;
    // グリッド再生成のスクロール補正待ち、またはプログラムによるスクロール中は判定しない
    if (pendingScroll || isProgrammaticScrolling) {
      lastScrollTop = scroller.scrollTop;
      return;
    }
    const scrollTop = scroller.scrollTop;
    if (scrollTop === lastScrollTop) return;
    const direction = scrollTop > lastScrollTop ? 1 : -1;
    lastScrollTop = scrollTop;
    updateScrollWindow(direction);
  });
}

/**
 * スクロール方向に応じてフォーカス月を1つ進める/戻し、グリッドを再生成する。
 * 判定はグリッドの端の月（下なら2ヶ月後・上なら2ヶ月前）の行を見る。フォーカス月の行だと
 * ビューポート内に常に閾値行が映ってしまい、スクロールのたびに月が進みすぎるため。
 * @param {number} direction スクロール方向（1: 下 / -1: 上）
 * @returns {void}
 */
function updateScrollWindow(direction) {
  const scroller = rfScroll.value;
  if (!scroller) return;
  const cells = scroller.querySelectorAll('.day-cell');
  /** @param {number} rowIndex @returns {HTMLElement|null} グリッド内の指定行の先頭セル */
  const rowCell = (rowIndex) => {
    const cell = cells[rowIndex * 7];
    return cell instanceof HTMLElement ? cell : null;
  };
  if (direction > 0) {
    // 下スクロール：グリッド末尾の月（2ヶ月後）の最後から1段上の行がビューに入ったら翌月へ更新する
    const lastIndex = days.value.findIndex((day) => !day.isPadding && day.date.isSame(focusedMonth.value.add(2, 'month').endOf('month'), 'day'));
    const cell = rowCell(Math.floor(lastIndex / 7) - 1);
    if (cell && cell.offsetTop <= scroller.scrollTop + scroller.clientHeight) focusMonth(focusedMonth.value.add(1, 'month'));
  } else {
    // 上スクロール：グリッド先頭の月（2ヶ月前）の最初から1段下の行がビューに入ったら前月へ更新する
    const firstIndex = days.value.findIndex((day) => !day.isPadding && day.date.isSame(focusedMonth.value.subtract(2, 'month').startOf('month'), 'day'));
    const cell = rowCell(Math.floor(firstIndex / 7) + 1);
    if (cell && scroller.scrollTop <= cell.offsetTop) focusMonth(focusedMonth.value.subtract(1, 'month'));
  }
}

/** プログラムによるスムーズスクロールの終了・中断時に端検出を再開する */
function resumeScrollDetection() {
  isProgrammaticScrolling = false;
  lastScrollTop = rfScroll.value?.scrollTop ?? lastScrollTop;
}

/**
 * イベントクリック時の処理
 * @param {Event} clickEvent - クリックイベント
 * @param {HandyCalendarEvent} evt - イベント情報
 * @param {Dayjs} date - クリックされたイベントバーの日付
 */
function handleEventClick(clickEvent, evt, date) {
  clickEvent.stopPropagation();
  if (suppressNextCellClick.value) {
    suppressNextCellClick.value = false;
    return;
  }
  if (isFormPicking.value) {
    resolveFormDatePick(date, date);
    return;
  }
  if (userStore.isMobile || userStore.isTablet) {
    selectDateCell(date);
    return;
  }
  userStore.setNowSelectedEvent({ eid: evt.id, cid: evt.calendarId });
  router.push({ name: 'EventDetail' });
}

/** @param {Dayjs} date 日付セルをクリック/タップした日付 */
function handleCellClick(date) {
  if (suppressNextCellClick.value) {
    suppressNextCellClick.value = false;
    return;
  }
  if (isFormPicking.value) {
    resolveFormDatePick(date, date);
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
  if (userStore.isMobile || userStore.isTablet || evt.button !== 0) return;
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

/** @param {Dayjs} date 日付セルで選択された日付 */
function selectDateCell(date) {
  const selectedDate = date.format('YYYY-MM-DD');
  const isDifferentDate = userStore.nowSelectedDate !== selectedDate;

  userStore.setNowSelectedDate(date);
  if (router.currentRoute.value.name === 'EventDetail' && isDifferentDate) {
    router.push({ name: 'Home' });
  }
}

/** @param {TouchEvent} evt @param {Dayjs} date 長押し対象の日付 */
function startCellLongPress(evt, date) {
  if (!(userStore.isMobile || userStore.isTablet) || evt.touches.length !== 1) return;
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

/** @param {TouchEvent} evt セルのタッチ移動。スクロール時は長押しを解除する */
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
  // 縦スクロール用のタッチ移動が検出されたら長押しをキャンセルする
  if (evt.target instanceof Element && evt.target.closest('.vertical-scroll')) cancelCellLongPress();
}

/** @param {TouchEvent} evt セルのタッチ終了 */
function finishCellTouch(evt) {
  cancelCellLongPress();
  if (isRangeDragging.value) {
    updateTouchDragEnd(evt);
    const touch = evt.changedTouches?.[0];
    finalizeDragRange({ x: touch?.clientX ?? 0, y: touch?.clientY ?? 0 });
  }
}

/** 長押しタイマーを解除 */
function cancelCellLongPress() {
  if (longPressTimer.value !== null) {
    window.clearTimeout(longPressTimer.value);
    longPressTimer.value = null;
  }
}

/** @param {MouseEvent} evt @param {Dayjs} date セルのコンテキストメニュー */
function handleCellContextMenu(evt, date) {
  evt.preventDefault();
  if (isFormPicking.value || userStore.isMobile || userStore.isTablet) return;
  contextMenuRange.value = { start: date, end: date };
  openContextMenu(evt, date);
}

/**
 * 日付セルのコンテキストメニューを開く
 * @param {MouseEvent} evt - 右クリックイベント
 * @param {Dayjs} date - 右クリックされた日付情報
 */
function openContextMenu(evt, date) {
  selectDateCell(date);
  rfDropdownForContextMenu.value?.open(evt);
}

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
function onSelectContextMenu(action) {
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
}

/** 前月へ移動する（月ブロック先頭までスムーズにスクロール） */
function goPreviousMonth() {
  focusMonth(focusedMonth.value.subtract(1, 'month'), { smooth: true, alignTop: true });
}

/** 次月へ移動する（月ブロック先頭までスムーズにスクロール） */
function goNextMonth() {
  focusMonth(focusedMonth.value.add(1, 'month'), { smooth: true, alignTop: true });
}

/** 今日へ移動する */
function goToday() {
  const today = dayjs();
  userStore.setNowSelectedDate(today);
  focusMonth(today, { smooth: true, alignTop: true });
}

/**
 * スタイルクラス計算
 * @param {GridDay} day 日付情報
 * @returns {string[]} クラス名の配列
 */
function getCellClass(day) {
  const classes = ['day-cell'];
  if (day.isPadding) classes.push('is-padding');
  if (day.isToday) classes.push('is-today');
  if (day.isSelected) classes.push('is-selected');
  if (!day.isPadding && isInDragRange(day.date)) classes.push('is-in-drag-range');
  return classes;
}

/**
 * 日付数字の色。祝日・カスタム休日はユーザ設定の休日色、それ以外は曜日設定の色
 * @param {GridDay} day 日付情報
 * @returns {string|undefined} 適用する色
 */
function getDayNumberColor(day) {
  if (isJapaneseHoliday(day.date)) return userStore.getHolidayColor(day.isPadding);
  if (customHolidayDates.value.has(day.date.format('YYYY-MM-DD'))) return userStore.getCustomHolidayColor(false);
  return userStore.getWeekendColor(day.date.day()) ?? undefined;
}

// ミニカレンダーなど外部からの月移動にも追従する
watch(
  () => userStore.nowUsingDate,
  (date) => focusMonth(date),
);

// イベントの取得・再取得は useCalendarEvents が担う（ビューは表示範囲を渡すだけで待機しない）

onMounted(async () => {
  await nextTick();
  // フォーカス中の月ブロック（中央）が見える位置へスクロールする
  const monthEl = rfScroll.value?.querySelector(`[data-month="${focusedMonth.value.format('YYYY-MM')}"]`);
  if (monthEl && rfScroll.value) {
    rfScroll.value.scrollTop = monthEl.offsetTop;
    lastScrollTop = rfScroll.value.scrollTop;
  }
});

onUnmounted(() => {
  if (scrollRafId !== null) cancelAnimationFrame(scrollRafId);
});
</script>

<template>
  <div class="calendar-month-vertical-view" :class="{ 'is-dragging': isRangeDragging }">
    <div v-if="isFormPicking" class="form-pick-banner" role="status">
      <span>{{ pickBannerText }}</span>
      <button type="button" @click="userStore.cancelFormDatePick()">キャンセル</button>
    </div>
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
      <h1>{{ monthTitle }}</h1>
      <div class="toolbar-right">
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
          <button type="button" title="月表示にする" aria-label="月表示にする" @click="userStore.setMainCalendarView('MONTH')">
            <IconCalendarDays size="1.25rem" />
          </button>
          <button type="button" title="タイムライン表示にする" aria-label="タイムライン表示にする" @click="userStore.setMainCalendarView('WEEK')">
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
          <button type="button" @click="router.push({ name: 'EventSearch' })"><IconMagnifyingGlass size="1rem" />イベントを検索</button>
          <button type="button" @click="router.push({ name: 'EventQuickAdd' })"><IconWandMagicSparkles size="1rem" />自然言語で登録</button>
          <button type="button" @click="userStore.setMainCalendarView('MONTH')"><IconCalendarDays size="1rem" />月表示にする</button>
          <button type="button" @click="userStore.setMainCalendarView('WEEK')"><IconBarsStaggered size="1rem" />TL表示にする</button>
          <button type="button" @click="router.push({ name: 'UserConfig' })"><IconGear size="1rem" />ユーザー設定</button>
        </DropdownMenu>
      </div>
    </header>

    <div ref="rfScroll" class="vertical-scroll" :style="calendarTextSizeStyle" @scroll.passive="handleScroll" @scrollend="resumeScrollDetection" @wheel="resumeScrollDetection" @touchstart.passive="resumeScrollDetection">
      <div class="month-header">
        <div v-for="(map, i) in userStore.daysMap" :key="i" :style="{ color: map.weekendColor ?? undefined }">
          {{ map.label }}
        </div>
      </div>

      <div class="month-grid" :class="{ 'variable-cell-height': userStore.calendarCellHeightMode === 'VARIABLE' }" :style="gridStyle">
        <div
          v-for="day in days"
          :key="day.key"
          :class="getCellClass(day)"
          :data-month="!day.isPadding ? day.date.format('YYYY-MM') : undefined"
          :data-date="!day.isPadding ? day.date.format('YYYY-MM-DD') : undefined"
          @click="!day.isPadding && handleCellClick(day.date)"
          @contextmenu="!day.isPadding && handleCellContextMenu($event, day.date)"
          @mousedown="!day.isPadding && handleCellMouseDown($event, day.date)"
          @mouseenter="!day.isPadding && handleCellMouseEnter(day.date)"
          @touchstart="!day.isPadding && startCellLongPress($event, day.date)"
          @touchmove="handleCellTouchMove"
          @touchend="finishCellTouch"
          @touchcancel="finishCellTouch">
          <template v-if="!day.isPadding">
            <div class="day-num" :style="{ color: getDayNumberColor(day) }">
              {{ day.date.date() }}
            </div>

            <div class="events-stack">
              <div v-for="(slot, i) in getDayEvents(day.date)" :key="i" class="event-slot">
                <div
                  v-if="slot"
                  class="event-bar"
                  :class="{ 'is-start': slot.isStart, 'is-end': slot.isEnd, 'is-continued': !slot.isStart, 'is-label-start': slot.isLabelStart, 'is-touch-background': userStore.isMobile || userStore.isTablet, 'is-dot': isDotEventBar(slot.event) }"
                  :style="{ ...getEventBarStyle(slot.event), width: slot.isLabelStart ? `calc(${slot.spanDays * 100}% + ${(slot.spanDays - 1) * 4}px)` : undefined }"
                  @click="(e) => handleEventClick(e, slot.event, day.date)"
                  @mousedown.stop>
                  <span v-if="slot.isLabelStart">
                    <i v-if="isDotEventBar(slot.event)" class="event-dot" :style="{ backgroundColor: getEventDotColor(slot.event) }"></i>
                    <InlineEmoji :emoji="slot.event.icon ?? '📌'" /> {{ slot.event.summary }}
                    <IconUserGroup v-if="hasOtherAttendees(slot.event)" size="0.75rem" />
                  </span>
                </div>
              </div>
            </div>
            <span v-if="getHiddenEventCount(day.date) > 0" class="hidden-event-count" :aria-label="`非表示の予定 ${getHiddenEventCount(day.date)}件`"> +{{ getHiddenEventCount(day.date) }} </span>
          </template>
        </div>
      </div>
    </div>

    <DropdownMenu ref="rfDropdownForContextMenu" @close="contextMenuRange = null">
      <button type="button" @click="onSelectContextMenu('CreateEvent')">予定を作成</button>
      <button type="button" @click="onSelectContextMenu('CreateFromTemplate')">テンプレートから作成</button>
      <button v-if="isContextRangeHoliday" type="button" @click="onSelectContextMenu('UnsetCustomHoliday')">この日を休日から解除</button>
      <button v-else type="button" @click="onSelectContextMenu('SetCustomHoliday')">この日を休日にする</button>
    </DropdownMenu>
  </div>
</template>

<style lang="scss" scoped>
@use '@/styles/vars.scss' as var;
$event-bar-radius: 4px;

.calendar-month-vertical-view {
  --calendar-cell-min-height: calc(72px + 2px + 2px + 1px);
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  border-radius: var(--border-radius);

  // 範囲ドラッグ中はブラウザのスクロールを止めてセル追従を優先する
  &.is-dragging .vertical-scroll {
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
    flex-shrink: 0;

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

  .month-toolbar {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    padding: var(--space-sm) var(--space-sm) 0 var(--space-sm);
    background: var(--bg-1);
    flex-shrink: 0;

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

  .vertical-scroll {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    margin: var(--space-sm);
    border-radius: var(--border-radius);
    background-color: var(--bg-1);
    font-family: var(--calendar-font-family);
    touch-action: pan-y;
    overscroll-behavior: contain;
    // グリッド再生成時のスクロール位置は自前で補正するため、ブラウザの自動アンカリングは無効化する
    overflow-anchor: none;

    @include var.mdown(sm) {
      margin-bottom: 0;
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

    &.is-padding {
      background-color: var(--bg-2);
      pointer-events: none;
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
  }
}
</style>
