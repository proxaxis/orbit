<script setup>
import { ref, computed, onMounted } from 'vue';
import { useCalendarStore } from '@/stores/calendar.js';
import { useUserStore } from '@/stores/user.js';
import { useEventStore } from '@/stores/event.js';

const calendarStore = useCalendarStore();
const userStore = useUserStore();
const eventStore = useEventStore();

/** @type {Ref<GoogleEvent[]>} */
const events = ref([]);

/** @param {Date} date Date を YYYY-MM-DD 形式の文字列に変換する */
const formatDate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * @typedef {Object} CalendarCell
 * @property {Date} date
 * @property {string} dateString
 * @property {number} dayNumber
 * @property {number} dayOfWeek
 * @property {boolean} isCurrentMonth
 * @property {boolean} isToday
 * @property {boolean} isWeekend
 * @property {boolean} hasEvent
 */

/** @type {ComputedRef<CalendarCell[]>} */
const calendarDays = computed(() => {
  const year = userStore.nowUsingDate.getFullYear();
  const month = userStore.nowUsingDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);

  const startDayOffset = (firstDayOfMonth.getDay() - userStore.firstDayOfWeek + 7) % 7;
  const startDate = new Date(year, month, 1 - startDayOffset);

  const totalCells = Math.ceil((startDayOffset + lastDayOfMonth.getDate()) / 7) * 7;
  const todayStr = formatDate(new Date());
  const days = [];
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
    const dateString = formatDate(d);
    const day = userStore.daysMap[d.getDay()];

    // 予定の有無を判定（存在判定のみのため some で効率化）
    const hasEvent = Array.from(events.value).some((event) => {
      const eventDate = (event.start?.dateTime || event.start?.date || '').slice(0, 10);
      return eventDate === dateString;
    });

    days.push({
      date: d,
      dateString,
      dayNumber: d.getDate(),
      dayOfWeek: day.index,
      isCurrentMonth: d.getMonth() === month,
      isToday: dateString === todayStr,
      isWeekend: day.isWeekend,
      hasEvent,
    });
  }

  return days;
});

/**
 * セルクリック時の処理
 * @param {CalendarCell} cell
 */
function handleCellClick(cell) {
  userStore.isCellClicked = true;
  if (userStore.nowSelectedDate === cell.dateString) {
    // emit('cell-clicked', cell);
  } else {
    userStore.nowSelectedDate = cell.dateString;
    // emit('update:selectedDate', cell.dateString);
  }
}

onMounted(async () => {
  events.value = await eventStore.listEvents(userStore.nowUsingDate.getFullYear(), userStore.nowUsingDate.getMonth());
});
</script>

<template>
  <div class="calendar-mini">
    <!-- ナビゲーションバー -->
    <header>
      <h3>{{ `${userStore.nowUsingDate.getFullYear()}年 ${userStore.nowUsingDate.getMonth() + 1}月` }}</h3>
      <nav>
        <button type="button" @click="userStore.goToday">今月</button>
        <button type="button" @click="userStore.goPrevMonth">&lt;</button>
        <button type="button" @click="userStore.goNextMonth">&gt;</button>
      </nav>
    </header>

    <!-- ミニカレンダー本体 -->
    <table>
      <thead>
        <tr>
          <th
            v-for="d in userStore.daysMap"
            :key="d.index"
            :data-weekend="d.isWeekend"
          >
            {{ d.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="rowIdx in Math.ceil(calendarDays.length / 7)" :key="rowIdx">
          <td
            v-for="cell in calendarDays.slice((rowIdx - 1) * 7, rowIdx * 7)"
            :key="cell.dateString"
            :data-current-month="cell.isCurrentMonth"
            :data-today="cell.isToday"
            :data-weekend="cell.isWeekend"
            :data-selected="userStore.nowSelectedDate === cell.dateString ? true : null"
            @click="handleCellClick(cell)"
          >
            <span class="day-number">{{ cell.dayNumber }}</span>
            <!-- 予定が存在する場合のみドットを表示 -->
            <i v-if="cell.hasEvent" class="dot"></i>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped lang="scss">
.calendar-mini {
  display: inline-flex;
  flex-direction: column;
  width: 100%;
  background-color: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  user-select: none;
  box-sizing: border-box;

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;

    h3 {
      margin: 0;
      font-size: 0.95rem;
      font-weight: 600;
      color: #333;
    }

    nav {
      display: flex;
      gap: 3px;

      button {
        padding: 2px 7px;
        background-color: var(--bg-color);
        border: 1px solid var(--border-color);
        border-radius: 4px;
        font-size: 0.75rem;
        cursor: pointer;
        transition: background-color 0.15s ease;

        &:hover {
          background-color: #ebebeb;
        }

        &:active {
          background-color: #ddd;
        }
      }
    }
  }

  table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;

    thead {
      tr {
        th {
          height: 24px;
          text-align: center;
          vertical-align: middle;
          font-size: 0.75rem;
          font-weight: 600;
          color: #777;

          &[data-weekend='true'] {
            color: #d32f2f;
          }
        }
      }
    }

    tbody {
      tr {
        td {
          height: 32px;
          text-align: center;
          vertical-align: middle;
          position: relative;
          cursor: pointer;
          border-radius: 4px;
          transition: background-color 0.12s ease;
          color: #ccc;

          &:hover {
            background-color: #f2f2f2;
          }

          .day-number {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 22px;
            height: 22px;
            font-size: 0.75rem;
            font-weight: 400;
          }

          .dot {
            position: absolute;
            bottom: 2px;
            left: 50%;
            transform: translateX(-50%);
            width: 4px;
            height: 4px;
            border-radius: 50%;
            background-color: #1a73e8;
          }

          // 当月日付
          &[data-current-month='true'] {
            color: #333;

            &[data-weekend='true'] {
              color: #d32f2f;
            }
          }

          // 今日の日付
          &[data-today='true'] {
            .day-number {
              background-color: #e8f0fe;
              color: #1a73e8;
              font-weight: 700;
              border-radius: 50%;
            }
          }

          // 選択中セル
          &[data-selected='true'] {
            background-color: #1a73e8 !important;
            color: #fff !important;

            .day-number {
              background-color: transparent !important;
              color: #fff !important;
            }

            .dot {
              background-color: #fff;
            }
          }
        }
      }
    }
  }
}
</style>
