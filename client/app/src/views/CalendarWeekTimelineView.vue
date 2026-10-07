<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import dayjs, { toDayjs } from '@/services/dayjs.js';
import { useEventStore } from '@/stores/event.js';
import { useUserStore } from '@/stores/user.js';
import { useCalendarStore } from '@/stores/calendar.js';
import IconCaretLeft from '@/components/icons/IconCaretLeft.vue';
import IconCaretRight from '@/components/icons/IconCaretRight.vue';
import IconBars from '@/components/icons/IconBars.vue';
import IconGear from '@/components/icons/IconGear.vue';
import IconCalendar from '@/components/icons/IconCalendar.vue';
import IconArrowRotateLeft from '@/components/icons/IconArrowRotateLeft.vue';
import IconEllipsisVertical from '@/components/icons/IconEllipsisVertical.vue';
import DropdownMenu from '@/components/DropdownMenu.vue';

const router = useRouter();
const eventStore = useEventStore();
const userStore = useUserStore();
const calendarStore = useCalendarStore();

const props = defineProps({
  selectPane: { type: Function, default: () => {} },
});

/** 1時間あたりの縦幅(px) */
const HOUR_HEIGHT = 48;
const MINUTES_PER_DAY = 24 * 60;

/** @type {Ref<HandyCalendarEvent[]>} 表示中の週に関係するイベント */
const events = ref([]);
/** @type {Ref<Dayjs>} 現在時刻（現在時刻ラインの描画用） */
const now = ref(dayjs());
/** @type {Ref<HTMLElement|null>} ビュー全体のコンテナ */
const rfRoot = ref(null);
/** @type {Ref<HTMLElement|null>} グリッドのスクロールコンテナ */
const rfWeekScroll = ref(null);
/** @type {Ref<{x: number, y: number}|null>} 週移動スワイプの開始位置 */
const swipeStart = ref(null);
/** @type {Ref<number>} 直近のホイール週移動時刻（連続移動の抑制用） */
const lastWheelNavigationAt = ref(0);
/** @type {Ref<'prev'|'next'|'today'>} 週切り替えアニメーションの方向 */
const weekTransition = ref('next');
/** @type {Ref<HTMLElement|null>} ツールバー */
const rfToolbar = ref(null);
/** @type {Ref<boolean>} ツールバーが収まらず右ボタン群をメニューに畳む状態か */
const isCompactToolbar = ref(false);
let nowTimer = null;
/** 展開時の右ボタン群の自然幅（コンパクト表示中も判定基準として保持する） */
let expandedRightToolbarWidth = 0;
let toolbarObserver = null;

/** @type {ComputedRef<Dayjs>} 表示中の週の開始日（週の開始曜日設定を考慮） */
const weekStart = computed(() => {
  const base = userStore.nowUsingDate.startOf('day');
  return base.subtract((base.day() - userStore.firstDayOfWeek + 7) % 7, 'day');
});

/** @type {ComputedRef<Dayjs[]>} 表示中の週の7日分 */
const weekDays = computed(() => Array.from({ length: 7 }, (_, i) => weekStart.value.add(i, 'day')));

/** @type {ComputedRef<string>} ツールバーに表示する週の範囲テキスト */
const weekTitle = computed(() => {
  const start = weekStart.value;
  const end = weekStart.value.add(6, 'day');
  if (start.isSame(end, 'month')) return `${start.format('YYYY年 M月 D日')} – ${end.format('D日')}`;
  if (start.isSame(end, 'year')) return `${start.format('YYYY年 M月 D日')} – ${end.format('M月 D日')}`;
  return `${start.format('YYYY年 M月 D日')} – ${end.format('YYYY年 M月 D日')}`;
});

/** 現在時刻ラインの位置（上端からの割合） */
const nowLineTop = computed(() => `${(now.value.hour() * 60 + now.value.minute()) / MINUTES_PER_DAY * 100}%`);

/** @param {Dayjs} date @returns {boolean} 今日かどうか */
function isToday(date) {
  return date.format('YYYY-MM-DD') === now.value.format('YYYY-MM-DD');
}

/** @param {Dayjs} date @returns {boolean} 選択中の日付かどうか */
function isSelected(date) {
  return userStore.nowSelectedDate === date.format('YYYY-MM-DD');
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

/** @param {HandyCalendarEvent} evt @returns {string} イベントブロックの色 */
function getEventColor(evt) {
  if (!!evt.calendarBackgroundColor && evt.calendarBackgroundColor.startsWith('#')) return evt.calendarBackgroundColor;
  return '#2196f3';
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

/**
 * イベントクリック時の処理
 * @param {MouseEvent} clickEvent
 * @param {HandyCalendarEvent} evt
 * @param {Dayjs} date クリックされたイベントが表示されている日
 */
function handleEventClick(clickEvent, evt, date) {
  clickEvent.stopPropagation();
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
  if ((!userStore.isMobile && !userStore.isTablet) || evt.touches.length !== 1) return;
  const touch = evt.touches[0];
  swipeStart.value = { x: touch.clientX, y: touch.clientY };
}

/** @param {TouchEvent} evt 週移動スワイプの終了 */
function finishWeekSwipe(evt) {
  const start = swipeStart.value;
  swipeStart.value = null;
  if (!start || (!userStore.isMobile && !userStore.isTablet) || evt.changedTouches.length !== 1) return;
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
  const now = Date.now();
  if (now - lastWheelNavigationAt.value < 400) return;
  lastWheelNavigationAt.value = now;
  if (delta < 0) goPreviousWeek();
  else goNextWeek();
}

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

/** グリッドのスクロール位置を現在時刻（または朝）へ合わせる */
function scrollToNow() {
  const container = rfWeekScroll.value;
  if (!container) return;
  const containsToday = weekDays.value.some((day) => isToday(day));
  const hour = containsToday ? now.value.hour() - 1 : 8;
  container.scrollTop = Math.max(0, hour * HOUR_HEIGHT);
}

watch(
  () => [calendarStore.listVisibleCalendars, weekStart.value],
  async () => {
    // 週が月をまたぐ場合は両方の月のイベントを取得して結合する
    const months = [...new Set([weekStart.value, weekStart.value.add(6, 'day')].map((d) => `${d.year()}:${d.month()}`))];
    const merged = new Map();
    for (const key of months) {
      const [year, month] = key.split(':').map(Number);
      const items = await eventStore.listEvents(year, month);
      items.forEach((evt) => merged.set(`${evt.calendarId}:${evt.id}:${evt.startDateTime.unix()}`, evt));
    }
    events.value = Array.from(merged.values());
  },
  { immediate: true },
);

// 週タイトルの文字数が変わると必要幅が変わるため再計測する
watch(weekStart, async () => {
  await nextTick();
  updateToolbarLayout();
});

onMounted(() => {
  nowTimer = window.setInterval(() => {
    now.value = dayjs();
  }, 30_000);
  scrollToNow();
  // Ctrl+ホイールでブラウザズームを抑止して週移動するため passive ではないリスナーを登録する
  rfRoot.value?.addEventListener('wheel', handleWeekWheel, { passive: false });
  if (typeof ResizeObserver !== 'undefined' && rfToolbar.value) {
    toolbarObserver = new ResizeObserver(() => updateToolbarLayout());
    toolbarObserver.observe(rfToolbar.value);
  }
  updateToolbarLayout();
});

onUnmounted(() => {
  if (nowTimer !== null) window.clearInterval(nowTimer);
  rfRoot.value?.removeEventListener('wheel', handleWeekWheel);
  toolbarObserver?.disconnect();
});
</script>

<template>
  <div ref="rfRoot" class="calendar-week-timeline-view" @touchstart="startWeekSwipe" @touchend="finishWeekSwipe" @touchcancel="swipeStart = null">
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
          <button type="button" title="月表示に切り替え" aria-label="月表示に切り替え" @click="userStore.setMainCalendarView('MONTH')">
            <IconCalendar size="1.25rem" />
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
          <button type="button" @click="userStore.setMainCalendarView('MONTH')"><IconCalendar size="1rem" />月表示に切り替え</button>
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
          <div v-for="(day, i) in weekDays" :key="day.format('YYYY-MM-DD')" class="day-head" :class="{ 'is-today': isToday(day), 'is-selected': isSelected(day) }" @click="selectDateCell(day)">
            <span class="weekday" :style="{ color: userStore.getWeekendColor(day.day()) ?? undefined }">{{ userStore.daysMap[i]?.label }}</span>
            <span class="daynum">{{ day.date() }}</span>
          </div>
        </div>

        <!-- 終日・複数日イベント -->
        <div class="week-allday">
          <div class="allday-label">終日</div>
          <div v-for="day in weekDays" :key="day.format('YYYY-MM-DD')" class="allday-cell" @click="selectDateCell(day)">
            <button v-for="evt in allDayEventsFor(day)" :key="`${evt.calendarId}:${evt.id}`" type="button" class="allday-chip" :style="{ backgroundColor: getEventColor(evt) }" @click="(e) => handleEventClick(e, evt, day)">
              {{ evt.icon ?? '📌' }}{{ evt.summary }}
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
          <div v-for="day in weekDays" :key="day.format('YYYY-MM-DD')" class="day-col" :class="{ 'is-today': isToday(day), 'is-selected': isSelected(day) }" @click="selectDateCell(day)">
            <button
              v-for="block in timedEventsFor(day)"
              :key="`${block.event.calendarId}:${block.event.id}`"
              type="button"
              class="event-block"
              :style="{ top: `${block.top}%`, height: `${block.height}%`, left: `calc(${block.left}% + 1px)`, width: `calc(${block.width}% - 2px)`, backgroundColor: getEventColor(block.event) }"
              @click="(e) => handleEventClick(e, block.event, day)">
              <span class="event-time">{{ getEventTimeText(block.event, day) }}</span>
              <span class="event-title">{{ block.event.icon ?? '📌' }}{{ block.event.summary }}</span>
            </button>
            <div v-if="isToday(day)" class="now-line" :style="{ top: nowLineTop }"></div>
          </div>
        </div>
      </div>
    </div>
    </Transition>
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

      &:hover {
        filter: brightness(1.1);
        z-index: 5;
      }

      .event-time {
        font-size: 0.85em;
        opacity: 0.9;
        white-space: nowrap;
      }

      .event-title {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 100%;
      }
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
