<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import dayjs, { toDayjs } from '@/services/dayjs.js';
import { isDotEventBar, getEventBarStyle, getEventDotColor } from '@/composables/useEventBarStyle.js';
import { useCalendarEvents } from '@/composables/useCalendarEvents.js';
import { useEvents } from '@/composables/useEvents.js';
import { useCalendarStore } from '@/stores/calendar.js';
import { useUserStore } from '@/stores/user.js';
import { useCalendarToolbar } from '@/composables/useCalendarToolbar.js';
import { buildCustomHolidayBody, holidayDatesOf } from '@/services/custom-holidays.js';
import { isJapaneseHoliday } from '@/services/japanese-holidays.js';
import IconCaretLeft from '@/components/icons/IconCaretLeft.vue';
import IconCaretRight from '@/components/icons/IconCaretRight.vue';
import IconBars from '@/components/icons/IconBars.vue';
import IconGear from '@/components/icons/IconGear.vue';
import IconCalendarDays from '@/components/icons/IconCalendarDays.vue';
import IconArrowsUpDown from '@/components/icons/IconArrowsUpDown.vue';
import IconArrowRotateLeft from '@/components/icons/IconArrowRotateLeft.vue';
import IconEllipsisVertical from '@/components/icons/IconEllipsisVertical.vue';
import IconMagnifyingGlass from '@/components/icons/IconMagnifyingGlass.vue';
import IconWandMagicSparkles from '@/components/icons/IconWandMagicSparkles.vue';
import DropdownMenu from '@/components/DropdownMenu.vue';
import InlineEmoji from '@/components/InlineEmoji.vue';

const router = useRouter();
const userStore = useUserStore();
const calendarStore = useCalendarStore();
const eventsService = useEvents();

const props = defineProps({
  selectPane: { type: Function, default: () => {} },
});

/** 1時間あたりの縦幅(px) */
const HOUR_HEIGHT = 48;
const MINUTES_PER_DAY = 24 * 60;
/** ドラッグ作成時の時刻スナップ（分） */
const SNAP_MINUTES = 30;

/** @type {Ref<Dayjs>} 現在時刻（現在時刻ラインの描画用） */
const now = ref(dayjs());
/** @type {Ref<HTMLElement|null>} ビュー全体のコンテナ */
const rfRoot = ref(null);
/** @type {Ref<HTMLElement|null>} グリッドのスクロールコンテナ */
const rfWeekScroll = ref(null);
/** @type {Ref<{x: number, y: number}|null>} 週移動スワイプの開始位置 */
const swipeStart = ref(null);
/** @type {Ref<boolean>} 範囲ドラッグで終了したタッチを週スワイプとして扱わないためのフラグ */
const suppressSwipeOnRelease = ref(false);
/** @type {Ref<number>} 直近のホイール週移動時刻（連続移動の抑制用） */
const lastWheelNavigationAt = ref(0);
/** @type {Ref<'prev'|'next'|'today'>} 週切り替えアニメーションの方向 */
const weekTransition = ref('next');
/** @type {Ref<HTMLElement|null>} ツールバー */
const rfToolbar = ref(null);
/** ツールバーのコンパクト表示状態・週/月タイトルは月表示ビューと共有ロジック */
const { isCompactToolbar, weekStart, weekTitle } = useCalendarToolbar(rfToolbar);
let nowTimer = null;

/** @type {ComputedRef<{start: Dayjs, end: Dayjs}>} 表示中の週の日付範囲（イベント購読用） */
const visibleRange = computed(() => ({
  start: weekStart.value.startOf('day'),
  end: weekStart.value.add(6, 'day').endOf('day'),
}));

/** 表示範囲のイベント・カスタム休日。取得は composable 側のバックグラウンド処理 */
const { events, customHolidays, customHolidayDates } = useCalendarEvents(visibleRange);

/** @type {ComputedRef<Dayjs[]>} 表示中の週の7日分 */
const weekDays = computed(() => Array.from({ length: 7 }, (_, i) => weekStart.value.add(i, 'day')));

/** 現在時刻ラインの位置（上端からの割合） */
const nowLineTop = computed(() => `${((now.value.hour() * 60 + now.value.minute()) / MINUTES_PER_DAY) * 100}%`);

/** @param {Dayjs} date @returns {boolean} 今日かどうか */
function isToday(date) {
  return date.format('YYYY-MM-DD') === now.value.format('YYYY-MM-DD');
}

/** @param {Dayjs} date @returns {boolean} 選択中の日付かどうか */
function isSelected(date) {
  return userStore.nowSelectedDate === date.format('YYYY-MM-DD');
}

/**
 * 日付数字の色。祝日・カスタム休日はユーザ設定の休日色
 * @param {Dayjs} day 日付
 * @returns {string|undefined} 適用する色
 */
function getDayNumberColor(day) {
  if (isJapaneseHoliday(day)) return userStore.getHolidayColor(false);
  if (customHolidayDates.value.has(day.format('YYYY-MM-DD'))) return userStore.getCustomHolidayColor(false);
  return undefined;
}

/** @param {HandyCalendarEvent} evt @returns {boolean} 複数日または終日のイベントかどうか */
function isMultiDayEvent(evt) {
  return evt.isAllDay || !evt.startDateTime.isSame(evt.endDateTime, 'day');
}

/** @param {Dayjs} day @returns {HandyCalendarEvent[]} 指定日に重なる終日・複数日イベント */
function allDayEventsFor(day) {
  const dayStart = day.startOf('day');
  const dayEnd = dayStart.add(1, 'day');
  return events.value.filter((evt) => isMultiDayEvent(evt) && evt.startDateTime.isBefore(dayEnd) && evt.endDateTime.isAfter(dayStart));
}

/**
 * 指定日の時間帯イベントをタイムライン配置情報付きで返す
 * @param {Dayjs} day
 * @returns {{event: HandyCalendarEvent, top: number, height: number, left: number, width: number}[]}
 */
function timedEventsFor(day) {
  const dayStart = day.startOf('day');
  const dayEnd = dayStart.add(1, 'day');
  const blocks = events.value
    .filter((evt) => !isMultiDayEvent(evt) && evt.startDateTime.isBefore(dayEnd) && evt.endDateTime.isAfter(dayStart))
    .map((evt) => ({
      event: evt,
      startMin: Math.max(0, evt.startDateTime.diff(dayStart, 'minute')),
      endMin: Math.min(MINUTES_PER_DAY, evt.endDateTime.diff(dayStart, 'minute')),
    }))
    .filter((block) => block.endMin > block.startMin)
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  // 重なっているイベント同士をクラスタに分け、クラスタ内でレーンを割り当てる
  const clusters = [];
  for (const block of blocks) {
    const cluster = clusters.find((c) => block.startMin < c.end);
    if (cluster) {
      cluster.blocks.push(block);
      cluster.end = Math.max(cluster.end, block.endMin);
    } else {
      clusters.push({ end: block.endMin, blocks: [block] });
    }
  }

  const result = [];
  for (const cluster of clusters) {
    /** @type {number[]} 各レーンの空き時刻 */
    const laneFreeAt = [];
    for (const block of cluster.blocks) {
      let lane = laneFreeAt.findIndex((freeAt) => freeAt <= block.startMin);
      if (lane === -1) lane = laneFreeAt.length;
      laneFreeAt[lane] = block.endMin;
      result.push({
        event: block.event,
        lane,
        lanes: laneFreeAt.length,
        top: (block.startMin / MINUTES_PER_DAY) * 100,
        height: Math.max(1.2, ((block.endMin - block.startMin) / MINUTES_PER_DAY) * 100),
      });
    }
    // レーン数が確定した後に幅を計算し直す
    const laneCount = laneFreeAt.length;
    for (const item of result.slice(result.length - cluster.blocks.length)) {
      item.left = (item.lane / laneCount) * 100;
      item.width = 100 / laneCount;
    }
  }
  return result;
}

/** @param {HandyCalendarEvent} evt @param {Dayjs} day この表示列の日付 @returns {string} イベントブロック内の時刻テキスト */
function getEventTimeText(evt, day) {
  if (!evt.startDateTime.isSame(day, 'day')) return `${evt.startDateTime.format('M/D')} –`;
  if (evt.endDateTime.diff(evt.startDateTime, 'minute') < 60) return evt.startDateTime.format('HH:mm');
  return `${evt.startDateTime.format('HH:mm')}–${evt.endDateTime.format('HH:mm')}`;
}

/** @param {Dayjs} date 日付を選択する */
function selectDateCell(date) {
  const selectedDate = date.format('YYYY-MM-DD');
  const isDifferentDate = userStore.nowSelectedDate !== selectedDate;
  userStore.setNowSelectedDate(date);
  if (router.currentRoute.value.name === 'EventDetail' && isDifferentDate) {
    router.push({ name: 'Home' });
  }
}

// #region 時間範囲ドラッグ選択

/** @type {Ref<{dateKey: string, minute: number}|null>} ドラッグ開始位置（日付 + 分） */
const dragStartPoint = ref(null);
/** @type {Ref<{dateKey: string, minute: number}|null>} ドラッグの現在位置（日付 + 分） */
const dragEndPoint = ref(null);
/** @type {Ref<boolean>} 時間範囲ドラッグ中かどうか */
const isTimeDragging = ref(false);
/** @type {Ref<{start: Dayjs, end: Dayjs, isTimed: boolean}|null>} コンテキストメニューが対象とする範囲 */
const contextMenuRange = ref(null);
/** @type {Ref<{ open: (event: MouseEvent) => void, close: () => void }|null>} コンテキストメニュー用ドロップダウン */
const rfDropdownForContextMenu = ref(null);
/** @type {Ref<number|null>} セル長押しタイマー */
const longPressTimer = ref(null);
/** @type {Ref<boolean>} ドラッグ後のクリックを抑制するフラグ */
const suppressNextCellClick = ref(false);
/** @type {{dateKey: string, minute: number}|null} マウスダウン位置（ドラッグ開始判定用） */
let mouseDownPoint = null;
/** @type {ComputedRef<boolean>} イベントフォームからの日付選択要求中かどうか */
const isFormPicking = computed(() => !!userStore.formDatePick);
/** @type {ComputedRef<string>} フォーム日付ピック中の案内文 */
const pickBannerText = computed(() => {
  const field = userStore.formDatePick?.field ?? '';
  if (field === 'expiryDate') return `有効期限を選択してください（列をクリック/タップ）`;
  const label = field === 'endDate' || field === 'rangeEnd' ? '終了日' : '開始日';
  return `${label}を選択してください（列をクリック/タップ、ドラッグで期間選択）`;
});

/**
 * フォームの日付ピック要求へ選択結果を返す
 * @param {Dayjs} start 範囲の開始日
 * @param {Dayjs} end 範囲の終了日（含む側）
 */
function resolveFormDatePick(start, end) {
  const pick = userStore.formDatePick ?? { target: 'eventForm', field: 'startDate' };
  userStore.resolveFormDatePick({ target: pick.target, field: pick.field, start: start.format('YYYY-MM-DD'), end: end.format('YYYY-MM-DD') });
}

/**
 * ポインタ位置を列内の分数へ変換する
 * @param {{clientY: number}} evt ポインタイベント
 * @param {Element} colEl 対象の日付列要素
 * @returns {number} 0 - 1440 の分数（30分スナップ）
 */
function minuteFromPosition(evt, colEl) {
  const rect = colEl.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (evt.clientY - rect.top) / rect.height));
  return Math.round((ratio * MINUTES_PER_DAY) / SNAP_MINUTES) * SNAP_MINUTES;
}

/** @param {MouseEvent} evt @param {Dayjs} day 日付列のマウス押下（ドラッグ起点） */
function handleColMouseDown(evt, day) {
  if (userStore.isMobile || userStore.isTablet || evt.button !== 0) return;
  mouseDownPoint = { dateKey: day.format('YYYY-MM-DD'), minute: minuteFromPosition(evt, evt.currentTarget) };
  window.addEventListener('mouseup', handleGlobalMouseUp, { once: true });
}

/** @param {MouseEvent} evt @param {Dayjs} day 日付列上のマウス移動（ドラッグ中は終端を更新） */
function handleColMouseMove(evt, day) {
  if (!mouseDownPoint) return;
  const minute = minuteFromPosition(evt, evt.currentTarget);
  const dateKey = day.format('YYYY-MM-DD');
  if (!isTimeDragging.value) {
    if (minute === mouseDownPoint.minute && dateKey === mouseDownPoint.dateKey) return;
    isTimeDragging.value = true;
    dragStartPoint.value = { ...mouseDownPoint };
  }
  dragEndPoint.value = { dateKey, minute };
}

/** @param {MouseEvent} evt グローバルのマウス解放（ドロップ検知） */
function handleGlobalMouseUp(evt) {
  const wasDragging = isTimeDragging.value;
  mouseDownPoint = null;
  if (wasDragging) finalizeTimeDrag({ x: evt.clientX, y: evt.clientY });
}

/** @param {TouchEvent} evt @param {Dayjs} day 日付列のタッチ開始（長押しで時間範囲ドラッグ） */
function startColLongPress(evt, day) {
  if (!(userStore.isMobile || userStore.isTablet) || evt.touches.length !== 1) return;
  cancelColLongPress();
  const touch = evt.touches[0];
  const colEl = evt.currentTarget;
  const minute = minuteFromPosition(touch, colEl);
  const dateKey = day.format('YYYY-MM-DD');
  longPressTimer.value = window.setTimeout(() => {
    longPressTimer.value = null;
    suppressNextCellClick.value = true;
    // 長押しを検知したらドラッグ中フラグを立て、開始時刻を記録する
    isTimeDragging.value = true;
    dragStartPoint.value = { dateKey, minute };
    dragEndPoint.value = { dateKey, minute };
  }, 500);
}

/** 長押しタイマーを解除 */
function cancelColLongPress() {
  if (longPressTimer.value !== null) {
    window.clearTimeout(longPressTimer.value);
    longPressTimer.value = null;
  }
}

/** @param {TouchEvent} evt タッチ位置から日付列と時刻を解決してドラッグ終端を更新する */
function updateTimeDragEnd(evt) {
  const touch = evt.touches?.[0] ?? evt.changedTouches?.[0];
  if (!touch) return;
  const col = document.elementFromPoint(touch.clientX, touch.clientY)?.closest?.('.day-col');
  const dateKey = col?.getAttribute('data-date');
  if (dateKey) dragEndPoint.value = { dateKey, minute: minuteFromPosition(touch, col) };
}

/** @param {TouchEvent} evt 日付列上のタッチ移動 */
function handleColTouchMove(evt) {
  if (!isTimeDragging.value) {
    cancelColLongPress();
    return;
  }
  evt.preventDefault();
  updateTimeDragEnd(evt);
}

/** @param {TouchEvent} evt 日付列上のタッチ終了 */
function finishColTouch(evt) {
  cancelColLongPress();
  if (!isTimeDragging.value) return;
  updateTimeDragEnd(evt);
  const touch = evt.changedTouches?.[0];
  finalizeTimeDrag({ x: touch?.clientX ?? 0, y: touch?.clientY ?? 0 });
}

/**
 * ドラッグ確定後にコンテキストメニューを開く
 * @param {{x: number, y: number}} position メニューの表示位置
 * @returns {void}
 */
function finalizeTimeDrag(position) {
  const a = dragStartPoint.value;
  const b = dragEndPoint.value ?? a;
  isTimeDragging.value = false;
  mouseDownPoint = null;
  dragStartPoint.value = null;
  dragEndPoint.value = null;
  if (!a || !b) return;
  suppressNextCellClick.value = true;
  let start = toDayjs(a.dateKey).add(a.minute, 'minute');
  let end = toDayjs(b.dateKey).add(b.minute, 'minute');
  if (end.isBefore(start)) [start, end] = [end, start];
  if (end.isSame(start)) end = start.add(SNAP_MINUTES, 'minute');
  if (isFormPicking.value) {
    // フォームの日付ピック中はメニューを開かず、選択範囲の日付をフォームへ返す
    suppressSwipeOnRelease.value = true;
    resolveFormDatePick(start.startOf('day'), end.startOf('day'));
    return;
  }
  contextMenuRange.value = { start, end, isTimed: true };
  // このタッチの終了を横スワイプ（週移動）として処理しない
  suppressSwipeOnRelease.value = true;
  // mouseup/touchend 直後に発火する click を DropdownMenu が外側クリックと判定して
  // 即座に閉じてしまうため、click ディスパッチ完了後にメニューを開く
  window.setTimeout(() => {
    rfDropdownForContextMenu.value?.open({ clientX: position.x, clientY: position.y });
  }, 0);
}

/** @type {ComputedRef<{key: string, top: number, height: number}[]>} ドラッグ中、またはメニュー表示中の確定済み選択範囲（列ごとの表示ブロック） */
const dragBlocks = computed(() => {
  let start, end;
  if (isTimeDragging.value && dragStartPoint.value) {
    const a = dragStartPoint.value;
    const b = dragEndPoint.value ?? a;
    start = toDayjs(a.dateKey).add(a.minute, 'minute');
    end = toDayjs(b.dateKey).add(b.minute, 'minute');
  } else if (contextMenuRange.value?.isTimed) {
    // ドロップ後のコンテキストメニューが開いている間は確定範囲を表示し続ける
    ({ start, end } = contextMenuRange.value);
  } else {
    return [];
  }
  if (end.isBefore(start)) [start, end] = [end, start];
  return weekDays.value
    .map((day) => {
      const dayStart = day.startOf('day');
      const dayEnd = dayStart.add(1, 'day');
      if (!start.isBefore(dayEnd) || !end.isAfter(dayStart)) return null;
      const startMin = Math.max(0, start.diff(dayStart, 'minute'));
      const endMin = Math.min(MINUTES_PER_DAY, end.diff(dayStart, 'minute'));
      return { key: day.format('YYYY-MM-DD'), top: (startMin / MINUTES_PER_DAY) * 100, height: Math.max(0.5, ((endMin - startMin) / MINUTES_PER_DAY) * 100) };
    })
    .filter(Boolean);
});

/** @param {Dayjs} day @returns {boolean} メニュー表示中の確定済み範囲に含まれる日か */
function isInContextRange(day) {
  const range = contextMenuRange.value;
  if (!range) return false;
  const [first, last] = range.start.isAfter(range.end, 'day') ? [range.end, range.start] : [range.start, range.end];
  return !day.isBefore(first, 'day') && !day.isAfter(last, 'day');
}

/** @param {Dayjs} day 日付列クリック（ドラッグ直後は抑止） */
function handleColClick(day) {
  if (suppressNextCellClick.value) {
    suppressNextCellClick.value = false;
    return;
  }
  if (isFormPicking.value) {
    resolveFormDatePick(day, day);
    return;
  }
  selectDateCell(day);
}

/** @param {Dayjs} day 日付ヘッダー・終日セルのクリック（日付ピック中はフォームへ返す） */
function handleDayCellClick(day) {
  if (isFormPicking.value) {
    resolveFormDatePick(day, day);
    return;
  }
  selectDateCell(day);
}

/** @param {MouseEvent} evt @param {Dayjs} day 日付ヘッダー・終日セルのコンテキストメニュー（終日イベント作成） */
function handleDateContextMenu(evt, day) {
  evt.preventDefault();
  if (isFormPicking.value || userStore.isMobile || userStore.isTablet) return;
  contextMenuRange.value = { start: day.startOf('day'), end: day.startOf('day'), isTimed: false };
  selectDateCell(day);
  rfDropdownForContextMenu.value?.open(evt);
}

/** @param {MouseEvent} evt @param {Dayjs} day 日付列のコンテキストメニュー（クリック位置の時刻で作成） */
function handleColContextMenu(evt, day) {
  evt.preventDefault();
  if (isFormPicking.value || userStore.isMobile || userStore.isTablet) return;
  const minute = minuteFromPosition(evt, evt.currentTarget);
  const start = day.startOf('day').add(minute, 'minute');
  contextMenuRange.value = { start, end: start.add(SNAP_MINUTES, 'minute'), isTimed: true };
  selectDateCell(day);
  rfDropdownForContextMenu.value?.open(evt);
}

/** @type {ComputedRef<string|null>} カスタム休日の作成先カレンダー ID */
const holidayCalendarId = computed(() => {
  const writable = calendarStore.listWritableCalendars;
  if (writable.some((/** @type {any} */ cal) => cal.id === userStore.defaultCalendarId)) return userStore.defaultCalendarId;
  return writable[0]?.id ?? null;
});

/** @type {ComputedRef<boolean>} メニュー対象日がカスタム休日かどうか */
const isContextRangeHoliday = computed(() => {
  const range = contextMenuRange.value;
  if (!range) return false;
  for (let day = range.start.startOf('day'); !day.isAfter(range.end.startOf('day'), 'day'); day = day.add(1, 'day')) {
    if (!customHolidayDates.value.has(day.format('YYYY-MM-DD'))) return false;
  }
  return true;
});

/** メニュー対象範囲をカスタム休日に設定する */
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
  for (let day = range.start.startOf('day'); !day.isAfter(range.end.startOf('day'), 'day'); day = day.add(1, 'day')) keys.add(day.format('YYYY-MM-DD'));
  const targets = customHolidays.value.filter((evt) => holidayDatesOf(evt).some((key) => keys.has(key)));
  await Promise.all(targets.map((evt) => eventsService.removeEvent(evt.id, evt.calendarId)));
  if (targets.length > 0) userStore.showToast('休日を解除しました');
}

/** @param {string} action コンテキストメニューを選択したときのハンドラ */
function onSelectContextMenu(action) {
  switch (action) {
    case 'CreateEvent': {
      userStore.setNowSelectedEvent(null);
      const range = contextMenuRange.value;
      if (!range) break;
      if (range.isTimed) {
        router.push({ name: 'EventCreator', query: { start: range.start.format('YYYY-MM-DDTHH:mm'), end: range.end.format('YYYY-MM-DDTHH:mm') } });
      } else {
        router.push({ name: 'EventCreator', query: { start: range.start.format('YYYY-MM-DD'), end: range.end.format('YYYY-MM-DD'), allday: '1' } });
      }
      break;
    }
    case 'CreateFromTemplate':
      userStore.setNowSelectedEvent(null);
      router.push({ name: 'EventTemplatePicker' });
      break;
    case 'SetCustomHoliday':
      void setCustomHoliday();
      break;
    case 'UnsetCustomHoliday':
      void unsetCustomHoliday();
      break;
    default:
      break;
  }
  rfDropdownForContextMenu.value?.close();
}

// #endregion

/**
 * イベントクリック時の処理
 * @param {MouseEvent} clickEvent
 * @param {HandyCalendarEvent} evt
 * @param {Dayjs} date クリックされたイベントが表示されている日
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

/** 前週へ移動します。 */
function goPreviousWeek() {
  weekTransition.value = 'prev';
  userStore.nowUsingDate = userStore.nowUsingDate.subtract(7, 'day');
}

/** 翌週へ移動します。 */
function goNextWeek() {
  weekTransition.value = 'next';
  userStore.nowUsingDate = userStore.nowUsingDate.add(7, 'day');
}

/** 今週へ移動します。 */
function goToday() {
  weekTransition.value = 'today';
  userStore.goToday();
}

/** @param {TouchEvent} evt 週移動スワイプの開始 */
function startWeekSwipe(evt) {
  suppressSwipeOnRelease.value = false;
  if ((!userStore.isMobile && !userStore.isTablet) || evt.touches.length !== 1) return;
  const touch = evt.touches[0];
  swipeStart.value = { x: touch.clientX, y: touch.clientY };
}

/** @param {TouchEvent} evt 週移動スワイプの終了 */
function finishWeekSwipe(evt) {
  const start = swipeStart.value;
  swipeStart.value = null;
  if (suppressSwipeOnRelease.value || isTimeDragging.value || !start || (!userStore.isMobile && !userStore.isTablet) || evt.changedTouches.length !== 1) return;
  const touch = evt.changedTouches[0];
  const deltaX = touch.clientX - start.x;
  const deltaY = touch.clientY - start.y;
  if (Math.abs(deltaX) < 60 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) return;
  if (deltaX > 0) goPreviousWeek();
  else goNextWeek();
}

/** @param {WheelEvent} evt Ctrl+スクロールで前週・翌週へ移動する（ブラウザのズームは抑止） */
function handleWeekWheel(evt) {
  if (!evt.ctrlKey) return;
  evt.preventDefault();
  const delta = evt.deltaY !== 0 ? evt.deltaY : evt.deltaX;
  if (delta === 0) return;
  const nowMs = dayjs().valueOf();
  if (nowMs - lastWheelNavigationAt.value < 400) return;
  lastWheelNavigationAt.value = nowMs;
  if (delta < 0) goPreviousWeek();
  else goNextWeek();
}

/** グリッドのスクロール位置を現在時刻（または朝）へ合わせる */
function scrollToNow() {
  const container = rfWeekScroll.value;
  if (!container) return;
  const containsToday = weekDays.value.some((day) => isToday(day));
  const hour = containsToday ? now.value.hour() - 1 : 8;
  container.scrollTop = Math.max(0, hour * HOUR_HEIGHT);
}

// イベントの取得・再取得は useCalendarEvents が担う（ビューは表示範囲を渡すだけで待機しない）

onMounted(() => {
  nowTimer = window.setInterval(() => {
    now.value = dayjs();
  }, 30_000);
  scrollToNow();
  // Ctrl+ホイールでブラウザズームを抑止して週移動するため passive ではないリスナーを登録する
  rfRoot.value?.addEventListener('wheel', handleWeekWheel, { passive: false });
});

onUnmounted(() => {
  if (nowTimer !== null) window.clearInterval(nowTimer);
  rfRoot.value?.removeEventListener('wheel', handleWeekWheel);
});
</script>

<template>
  <div ref="rfRoot" class="calendar-week-timeline-view" :class="{ 'is-dragging': isTimeDragging }" @touchstart="startWeekSwipe" @touchend="finishWeekSwipe" @touchcancel="swipeStart = null">
    <div v-if="isFormPicking" class="form-pick-banner" role="status">
      <span>{{ pickBannerText }}</span>
      <button type="button" @click="userStore.cancelFormDatePick()">キャンセル</button>
    </div>
    <header ref="rfToolbar" class="week-toolbar" :class="{ 'is-compact': isCompactToolbar }">
      <div class="toolbar-left">
        <button v-if="userStore.isMobile || userStore.isTablet" type="button" title="カレンダーを開閉" aria-label="カレンダーを開閉" @click="props.selectPane('nav')">
          <IconBars />
        </button>
        <button type="button" title="前週へ戻る" aria-label="前週へ戻る" @click="goPreviousWeek">
          <IconCaretLeft size="1.25rem" />
        </button>
        <button type="button" title="次週へ進む" aria-label="次週へ進む" @click="goNextWeek">
          <IconCaretRight size="1.25rem" />
        </button>
      </div>
      <h1>{{ weekTitle }}</h1>
      <div class="toolbar-right">
        <template v-if="!isCompactToolbar">
          <button type="button" title="今週に戻る" aria-label="今週に戻る" @click.prevent="goToday">
            <IconArrowRotateLeft size="1.25rem" />
          </button>
          <button type="button" title="イベントを検索" aria-label="イベントを検索" @click="router.push({ name: 'EventSearch' })">
            <IconMagnifyingGlass size="1.25rem" />
          </button>
          <button type="button" title="自然言語で登録" aria-label="自然言語で登録" @click="router.push({ name: 'EventQuickAdd' })">
            <IconWandMagicSparkles size="1.25rem" />
          </button>
          <button type="button" title="縦スクロール月表示にする" aria-label="縦スクロール月表示にする" @click="userStore.setMainCalendarView('MONTH_VERTICAL')">
            <IconArrowsUpDown size="1.25rem" />
          </button>
          <button type="button" title="月表示にする" aria-label="月表示にする" @click="userStore.setMainCalendarView('MONTH')">
            <IconCalendarDays size="1.25rem" />
          </button>
          <button type="button" title="ユーザー設定" aria-label="ユーザー設定" @click="router.push({ name: 'UserConfig' })">
            <IconGear size="1.25rem" />
          </button>
        </template>
        <DropdownMenu v-else>
          <template #button>
            <button type="button" title="週表示の操作" aria-label="週表示の操作">
              <IconEllipsisVertical size="1.25rem" />
            </button>
          </template>
          <button type="button" @click="goToday"><IconArrowRotateLeft size="1rem" />今週に戻る</button>
          <button type="button" @click="router.push({ name: 'EventSearch' })"><IconMagnifyingGlass size="1rem" />イベントを検索</button>
          <button type="button" @click="router.push({ name: 'EventQuickAdd' })"><IconWandMagicSparkles size="1rem" />自然言語で登録</button>
          <button type="button" @click="userStore.setMainCalendarView('MONTH_VERTICAL')"><IconArrowsUpDown size="1rem" />縦スクロール月表示にする</button>
          <button type="button" @click="userStore.setMainCalendarView('MONTH')"><IconCalendarDays size="1rem" />月表示にする</button>
          <button type="button" @click="router.push({ name: 'UserConfig' })"><IconGear size="1rem" />ユーザー設定</button>
        </DropdownMenu>
      </div>
    </header>

    <Transition :name="`week-slide-${weekTransition}`" mode="out-in" @after-enter="scrollToNow">
      <div ref="rfWeekScroll" :key="weekStart.format('YYYY-MM-DD')" class="week-scroll">
        <div class="week-grid">
          <!-- 曜日ヘッダー -->
          <div class="week-head">
            <div class="head-spacer"></div>
            <div v-for="(day, i) in weekDays" :key="day.format('YYYY-MM-DD')" class="day-head" :class="{ 'is-today': isToday(day), 'is-selected': isSelected(day), 'is-in-drag-range': isInContextRange(day) }" @click="handleDayCellClick(day)" @contextmenu="handleDateContextMenu($event, day)">
              <span class="weekday" :style="{ color: userStore.getWeekendColor(day.day()) ?? undefined }">{{ userStore.daysMap[i]?.label }}</span>
              <span class="daynum" :style="{ color: getDayNumberColor(day) }">{{ day.date() }}</span>
            </div>
          </div>

          <!-- 終日・複数日イベント -->
          <div class="week-allday">
            <div class="allday-label">終日</div>
            <div v-for="day in weekDays" :key="day.format('YYYY-MM-DD')" class="allday-cell" :class="{ 'is-in-drag-range': isInContextRange(day) }" @click="handleDayCellClick(day)" @contextmenu="handleDateContextMenu($event, day)">
              <button v-for="evt in allDayEventsFor(day)" :key="`${evt.calendarId}:${evt.id}`" type="button" class="allday-chip" :class="{ 'is-dot': isDotEventBar(evt) }" :style="getEventBarStyle(evt)" @click="(e) => handleEventClick(e, evt, day)">
                <i v-if="isDotEventBar(evt)" class="event-dot" :style="{ backgroundColor: getEventDotColor(evt) }"></i><InlineEmoji :emoji="evt.icon ?? '📌'" /> {{ evt.summary }}
              </button>
            </div>
          </div>

          <!-- タイムライン本体 -->
          <div class="week-main">
            <div class="time-gutter">
              <div v-for="hour in 24" :key="hour" class="hour-cell">
                <span>{{ hour - 1 }}:00</span>
              </div>
            </div>
            <div
              v-for="day in weekDays"
              :key="day.format('YYYY-MM-DD')"
              class="day-col"
              :class="{ 'is-today': isToday(day), 'is-selected': isSelected(day) }"
              :data-date="day.format('YYYY-MM-DD')"
              @click="handleColClick(day)"
              @contextmenu="handleColContextMenu($event, day)"
              @mousedown="handleColMouseDown($event, day)"
              @mousemove="handleColMouseMove($event, day)"
              @touchstart="startColLongPress($event, day)"
              @touchmove="handleColTouchMove"
              @touchend="finishColTouch"
              @touchcancel="finishColTouch">
              <div v-for="block in dragBlocks.filter((b) => b.key === day.format('YYYY-MM-DD'))" :key="`drag-${block.key}`" class="drag-range-block" :style="{ top: `${block.top}%`, height: `${block.height}%` }"></div>
              <button
                v-for="block in timedEventsFor(day)"
                :key="`${block.event.calendarId}:${block.event.id}`"
                type="button"
                class="event-block"
                :class="{ 'is-dot': isDotEventBar(block.event) }"
                :style="{ top: `${block.top}%`, height: `${block.height}%`, left: `calc(${block.left}% + 1px)`, width: `calc(${block.width}% - 2px)`, ...getEventBarStyle(block.event) }"
                @click="(e) => handleEventClick(e, block.event, day)"
                @mousedown.stop>
                <span class="event-time"><i v-if="isDotEventBar(block.event)" class="event-dot" :style="{ backgroundColor: getEventDotColor(block.event) }"></i>{{ getEventTimeText(block.event, day) }}</span>
                <span class="event-title"><InlineEmoji :emoji="block.event.icon ?? '📌'" /> {{ block.event.summary }}</span>
              </button>
              <div v-if="isToday(day)" class="now-line" :style="{ top: nowLineTop }"></div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

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

$hour-height: 48px;
$gutter-width: 3.25rem;

.calendar-week-timeline-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  border-radius: var(--border-radius);
  font-family: var(--calendar-font-family);
  touch-action: pan-y;

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

  // 時間範囲ドラッグ中はブラウザのスクロールを止めて選択追従を優先する
  &.is-dragging,
  &.is-dragging .week-scroll {
    touch-action: none;
  }

  .week-toolbar {
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
      font-size: var(--text-size-lg);
      display: flex;
      align-items: center;
      justify-content: center;
      white-space: nowrap;
      overflow: hidden;
      @include var.mdown(sm) {
        font-size: var(--text-size-md);
      }
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

  .week-scroll {
    flex: 1;
    min-height: 0;
    min-width: 0;
    overflow: auto;
    margin: var(--space-sm);
    border-radius: var(--border-radius);
    background: var(--bg-0);
    // 横方向のタッチ操作は週移動スワイプとして扱うため、横パンは抑制する
    touch-action: pan-y;

    @include var.mdown(md) {
      margin: var(--space-xs);
    }
  }

  .week-slide-prev-enter-active,
  .week-slide-prev-leave-active,
  .week-slide-next-enter-active,
  .week-slide-next-leave-active {
    transition:
      transform 0.22s ease,
      opacity 0.22s ease;
  }

  .week-slide-prev-enter-from {
    transform: translateX(-8%);
    opacity: 0;
  }

  .week-slide-prev-leave-to {
    transform: translateX(8%);
    opacity: 0;
  }

  .week-slide-next-enter-from {
    transform: translateX(8%);
    opacity: 0;
  }

  .week-slide-next-leave-to {
    transform: translateX(-8%);
    opacity: 0;
  }

  .week-slide-today-enter-active,
  .week-slide-today-leave-active {
    transition: opacity 0.18s ease;
  }

  .week-slide-today-enter-from,
  .week-slide-today-leave-to {
    opacity: 0;
  }

  .week-grid {
    display: flex;
    flex-direction: column;
    min-width: 620px;

    // タブレット・モバイルでは7列を画面幅に収める
    @include var.mdown(md) {
      min-width: 0;
    }
  }

  .week-head,
  .week-allday,
  .week-main {
    @include var.mdown(sm) {
      grid-template-columns: 2.5rem repeat(7, minmax(0, 1fr));
    }
  }

  .week-head {
    position: sticky;
    top: 0;
    z-index: 20;
    display: grid;
    grid-template-columns: $gutter-width repeat(7, 1fr);
    background: var(--bg-0);
    border-bottom: 1px solid var(--border);

    .head-spacer {
      position: sticky;
      left: 0;
      z-index: 21;
      background: var(--bg-0);
      border-right: 1px solid var(--border);
    }

    .day-head {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: var(--space-xs) 0;
      cursor: pointer;
      font-weight: bold;

      .weekday {
        font-size: var(--text-size-xs);
        color: var(--text-light);
      }

      .daynum {
        display: flex;
        align-items: center;
        justify-content: center;
        width: var(--space-lg);
        height: var(--space-lg);
        font-size: var(--text-size-sm);
      }

      &.is-today .daynum {
        background: #2b941180;
        color: white;
        border-radius: 50%;
      }

      &.is-selected {
        background-color: var(--selected);
      }

      &.is-in-drag-range {
        background-color: var(--selected);
        outline: 1px dashed var(--primary);
        outline-offset: -1px;
      }
    }
  }

  .week-allday {
    position: sticky;
    top: 0;
    z-index: 19;
    display: grid;
    grid-template-columns: $gutter-width repeat(7, 1fr);
    background: var(--bg-0);
    border-bottom: 1px solid var(--border);

    .allday-label {
      position: sticky;
      left: 0;
      z-index: 21;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg-0);
      border-right: 1px solid var(--border);
      font-size: var(--text-size-xxs);
      color: var(--text-light);
    }

    .allday-cell {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-height: 1.4rem;
      max-height: 4.6rem;
      overflow-y: auto;
      padding: 2px;
      border-right: 1px solid var(--border);
      cursor: pointer;

      &.is-in-drag-range {
        background-color: var(--selected);
        outline: 1px dashed var(--primary);
        outline-offset: -1px;
      }

      &:last-child {
        border-right: 0;
      }
    }

    .allday-chip {
      padding: 0 var(--space-xxs);
      border-radius: 4px;
      color: white;
      font-size: var(--text-size-xxs);
      line-height: 1.4;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      justify-content: flex-start;

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
    }
  }

  .week-main {
    display: grid;
    grid-template-columns: $gutter-width repeat(7, minmax(0, 1fr));
  }

  .time-gutter {
    position: sticky;
    left: 0;
    z-index: 10;
    background: var(--bg-0);
    border-right: 1px solid var(--border);

    .hour-cell {
      height: $hour-height;
      padding-right: var(--space-xxs);
      font-size: var(--text-size-xxs);
      color: var(--text-light);
      text-align: right;

      span {
        position: relative;
        top: -0.5em;
      }
    }
  }

  .day-col {
    position: relative;
    height: calc($hour-height * 24);
    border-right: 1px solid var(--border);
    cursor: pointer;
    background-image: linear-gradient(to bottom, var(--border) 1px, transparent 1px);
    background-size: 100% $hour-height;

    &:last-child {
      border-right: 0;
    }

    &.is-selected {
      background-color: color-mix(in srgb, var(--selected) 30%, transparent);
    }

    &.is-today {
      background-color: color-mix(in srgb, var(--primary) 5%, transparent);
    }

    .event-block {
      position: absolute;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0;
      padding: 1px 3px;
      border-radius: 4px;
      color: white;
      font-size: var(--text-size-xxs);
      line-height: 1.35;
      overflow: hidden;
      text-align: left;
      cursor: pointer;

      &.is-dot {
        background: transparent;
        color: var(--text);
        border: 1px solid var(--border);
      }

      &:hover {
        filter: brightness(1.1);
        z-index: 5;
      }

      .event-time {
        font-size: 0.85em;
        opacity: 0.9;
        white-space: nowrap;

        .event-dot {
          display: inline-block;
          width: 7px;
          height: 7px;
          margin-right: 3px;
          border-radius: 50%;
          vertical-align: middle;
        }
      }

      .event-title {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 100%;
      }
    }

    .drag-range-block {
      position: absolute;
      left: 1px;
      right: 1px;
      background: color-mix(in srgb, var(--primary) 25%, transparent);
      border: 1px dashed var(--primary);
      border-radius: 4px;
      pointer-events: none;
      z-index: 3;
    }

    .now-line {
      position: absolute;
      left: 0;
      right: 0;
      height: 2px;
      background: var(--danger);
      pointer-events: none;
      z-index: 4;

      &::before {
        content: '';
        position: absolute;
        left: 0;
        top: -3px;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--danger);
      }
    }
  }
}
</style>
