<script setup>
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { toDayjs } from '@/services/dayjs.js';
import { useEventStore } from '@/stores/event.js';
import { useUserStore } from '@/stores/user.js';
import { useCalendarStore } from '@/stores/calendar.js';
import DropdownMenu from '@/components/DropdownMenu.vue';
const router = useRouter();
const eventStore = useEventStore();
const userStore = useUserStore();
const calendarStore = useCalendarStore();

/** @type {Ref<{ open: (event: MouseEvent) => void, close: () => void }|null>} コンテキストメニュー表示用のドロップダウンへの直接の参照 */
const rfDropdownForContextMenu = ref(null);

/** @type {Ref<GoogleEvent[]>} 全てのカレンダーに登録されたイベントのうち、指定された月に登録されたもの */
const eventsSource = ref([]);

/** @type {ComputedRef<(GoogleEvent & { _instanceStart: Date, _instanceEnd: Date })[]>} 計算用に整形したイベント情報 */
const events = computed(() => Array.from(eventsSource.value).map((e) => ({
  ...e,
  _instanceStart: new Date(e.start?.dateTime || e.start?.date || ''),
  _instanceEnd: new Date(e.end?.dateTime || e.end?.date || ''),
})));

/** @type {ComputedRef<{date: Date, key: string, isToday: boolean, isOtherMonth: boolean, isSelected: boolean}[]>} @description カレンダーメインの日付配列 */
const calDaysArray = computed(() => {
  const today = new Date();
  const days = [];
  const year = userStore.nowUsingDate.getFullYear();
  const month = userStore.nowUsingDate.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const dayOfFirst = firstDay.getDay();
  const prevPadding = (dayOfFirst - userStore.firstDayOfWeek + 7) % 7;

  // 前月分
  for (let i = prevPadding; i > 0; i--) {
    days.push({
      date: new Date(year, month, 1 - i),
      key: `prev-${i}`,
      isToday: false,
      isOtherMonth: true,
      isSelected: userStore.nowSelectedDate === toDayjs(year, month, 1 - i).format('YYYY-MM-DD'),
    });
  }
  // 当月分
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push({
      date: new Date(year, month, i),
      key: `curr-${i}`,
      isToday: new Date(year, month, i).toDateString() === today.toDateString(),
      isOtherMonth: false,
      isSelected: userStore.nowSelectedDate === toDayjs(year, month, i).format('YYYY-MM-DD'),
    });
  }
  // 次月分
  const currentDaysCount = prevPadding + lastDay.getDate();
  const nextPadding = (7 - (currentDaysCount % 7)) % 7;
  // 横表示の場合は行数を固定せず、必要分だけ埋めるのが一般的
  // ここでは最低 5-6 行確保するロジックを入れても良いが、シンプルに余り分を追加
  for (let i = 1; i <= nextPadding; i++) {
    days.push({
      date: new Date(year, month + 1, i),
      key: `next-${i}`,
      isToday: false,
      isOtherMonth: true,
      isSelected: userStore.nowSelectedDate === toDayjs(year, month + 1, i).format('YYYY-MM-DD'),
    });
  }
  return days;
});

/** @param {Date} date @description 指定された日付のイベントを取得 */
const getMonthDayEvents = (date) => {
  const dateKey = date.toDateString();
  return layoutMap.value.get(dateKey) || [];
};

/** @type {ComputedRef<Map<string, {event: GoogleEvent, isStart: boolean, isEnd: boolean}[]>>} @description イベントの配置情報を保持するマップ */
const layoutMap = computed(() => {
  const map = new Map();
  const days = calDaysArray.value;
  const weeks = [];

  // 1週間ごとに分割
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  weeks.forEach((week) => {
    const weekStart = week[0].date;
    const weekEnd = week[week.length - 1].date;
    weekEnd.setHours(23, 59, 59, 999);

    // この週に関係するイベントを抽出
    const weekEvents = Array.from(events.value)
      .filter((e) => e._instanceStart < weekEnd && e._instanceEnd > weekStart)
      .sort((a, b) => {
        // ソート: 開始日時順 > 期間が長い順
        const sa = a._instanceStart;
        const sb = b._instanceStart;
        if (sa.getTime() !== sb.getTime()) return sa.getTime() - sb.getTime();
        const durA = a._instanceEnd.getTime() - sa.getTime();
        const durB = b._instanceEnd.getTime() - sb.getTime();
        return durB - durA;
      });

    /** @type {boolean[][]} @description スロットの埋まり具合を管理する配列（例: slots[row][dayIndex]）*/
    const slots = [];

    weekEvents.forEach((ev) => {
      const evStart = ev._instanceStart;
      const evEnd = ev._instanceEnd;

      // 週内での開始・終了インデックスを計算 (0-6)
      let startIndex = 0;
      let endIndex = 6;

      // 開始日時が週の開始日より後であれば、開始インデックスを計算
      if (evStart > weekStart) {
        startIndex = Math.floor((evStart.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24));
      }
      if (evEnd < weekEnd) {
        endIndex = Math.floor((evEnd.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24));
        // 00:00終了の場合は前日までとする
        if (evEnd.getHours() === 0 && evEnd.getMinutes() === 0 && evEnd > evStart) {
          endIndex -= 1;
        }
      }

      // 範囲外補正
      startIndex = Math.max(0, startIndex);
      endIndex = Math.min(6, endIndex);
      if (startIndex > endIndex) return;

      // 空いている行を探す
      let row = 0;
      while (true) {
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
        const key = d.date.toDateString();

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
            event: ev,
            isStart: i === startIndex,
            isEnd: i === endIndex
          };
        }
      }
    });
  });
  return map;
});

/**
 * イベントクリック時の処理
 * @param {Event} e - クリックイベント
 * @param {Object} event - イベント情報
 */
const handleEventClick = (e, event) => {
  e.stopPropagation();
  // router.push({ name: 'EventDetail', query: { id: event.id } });
};

/**
 * 日付セルのコンテキストメニューを開く
 * @param {MouseEvent} event - 右クリックイベント
 * @param {{ date: Date }} day - 右クリックされた日付情報
 */
const openContextMenu = (event, day) => {
  userStore.setNowSelectedDate(day.date);
  rfDropdownForContextMenu.value?.open(event);
};

/** @param {string} action コンテキストメニューを選択したときのハンドラ */
const onSelectContextMenu = (action) => {
  switch (action) {
    // 選択中の日付で新しい予定を作成
    case 'CreateEvent':
      router.push({ name: 'EventCreator' });
      break;
    default:
      break;
  }
  rfDropdownForContextMenu.value?.close();
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

watch(() => [calendarStore.list, userStore.nowUsingDate], async () => {
  // カレンダーリストがロードされたり、月が変わったりしたらイベントを取得または再取得
  eventsSource.value = await eventStore.listEvents(userStore.nowUsingDate.getFullYear(), userStore.nowUsingDate.getMonth());
});
</script>

<template>
  <div class="month-horizontal-view">
    <div class="month-header">
      <div v-for="(map, i) in userStore.daysMap" :key="i">{{ map.label }}</div>
    </div>

    <div class="month-grid">
      <div v-for="(day, idx) in calDaysArray" :key="day.key || idx" :class="getMonthCellClass(day)"
        @click="userStore.setNowSelectedDate(day.date)" @contextmenu.prevent="openContextMenu($event, day)">
        <div class="day-num">{{ day.date.getDate() }}</div>

        <div class="events-stack">
          <div v-for="(slot, i) in getMonthDayEvents(day.date)" :key="i" class="event-slot">
            <div v-if="slot" class="event-bar"
              :class="{ 'is-start': slot.isStart, 'is-end': slot.isEnd, 'is-continued': !slot.isStart }"
              :style="{ backgroundColor: slot.event.color }" @click.stop="(e) => handleEventClick(e, slot.event)"
              @mousedown.stop>
              <span v-if="slot.isStart || day.date.getDay() === userStore.firstDayOfWeek">
                <span>{{ slot.event.icon }}</span>
                {{ slot.event.summary }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <DropdownMenu ref="rfDropdownForContextMenu">
      <button type="button" @click="onSelectContextMenu('CreateEvent')">予定を作成</button>
    </DropdownMenu>
  </div>
</template>

<style lang="scss" scoped>
.month-horizontal-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: auto;
  height: 100%;

  .month-header {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    text-align: center;
    font-weight: bold;
    border-bottom: 1px solid var(--border);
    background: var(--bg-0);
    position: sticky;
    top: 0;
    z-index: 10;

    div {
      padding: 8px 0;
      border-right: 1px solid var(--bg-2);
    }
  }

  .month-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    grid-auto-rows: minmax(100px, 1fr);
    flex: 1;
  }

  .day-cell {
    min-height: 100px;
    border-right: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    position: relative;
    padding: 2px;
    user-select: none;
    background: var(--bg-0);

    &.other-month {
      background-color: var(--bg-2);

      .day-num {
        color: var(--text-light);
      }
    }

    &.is-today .day-num {
      background: var(--accent);
      color: white;
      border-radius: 50%;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    &.is-selected {
      background-color: var(--selected-cell, rgba(33, 150, 243, 0.1));
    }

    .day-num {
      position: absolute;
      top: 4px;
      left: 4px;
      font-size: 0.8rem;
      font-weight: bold;
      z-index: 1;
    }

    .events-stack {
      margin-top: 28px;
      display: flex;
      flex-direction: column;
      gap: 2px;

      .event-slot {
        height: 18px;
      }

      .event-bar {
        display: flex;
        align-items: center;
        background: var(--primary);
        color: white;
        border-radius: 4px;
        font-size: 0.75rem;
        height: 100%;
        cursor: pointer;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;

        &.is-continued {
          border-top-left-radius: 0;
          border-bottom-left-radius: 0;
          margin-left: -4px;
          /* 境界をまたぐ見た目調整 */
          padding-left: 6px;
        }

        &.is-start {
          border-top-left-radius: 4px;
          border-bottom-left-radius: 4px;
        }

        &.is-end {
          border-top-right-radius: 4px;
          border-bottom-right-radius: 4px;
        }

        &:not(.is-end) {
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
