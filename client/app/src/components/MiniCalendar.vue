<script setup>
import { ref, computed, watch } from 'vue';
import dayjs, { isEventOnDate, toDayjs } from '@/services/dayjs.js';
import { useCalendarStore } from '@/stores/calendar.js';
import { useUserStore } from '@/stores/user.js';
import { useEventStore } from '@/stores/event.js';
import IconCaretLeft from '@/components/icons/IconCaretLeft.vue';
import IconCaretRight from '@/components/icons/IconCaretRight.vue';
import IconArrowRotateLeft from '@/components/icons/IconArrowRotateLeft.vue';

const calendarStore = useCalendarStore();
const userStore = useUserStore();
const eventStore = useEventStore();

/** @type {Ref<HandyCalendarEvent[]>} */
const events = ref([]);
/** @type {Ref<Dayjs>} ミニカレンダーが表示している月（メインカレンダーとは連動しない） */
const usingDate = ref(dayjs());

/**
 * @typedef {Object} CalendarCell
 * @property {Dayjs} date
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
  const year = usingDate.value.year();
  const month = usingDate.value.month();

  const firstDayOfMonth = toDayjs(year, month, 1);
  const lastDayOfMonth = toDayjs(year, month + 1, 0);

  const startDayOffset = (firstDayOfMonth.day() - userStore.firstDayOfWeek + 7) % 7;
  const startDate = toDayjs(year, month, 1 - startDayOffset);

  const totalCells = Math.ceil((startDayOffset + lastDayOfMonth.date()) / 7) * 7;
  const todayStr = dayjs().format('YYYY-MM-DD');
  const days = [];
  for (let i = 0; i < totalCells; i++) {
    const d = toDayjs(startDate.year(), startDate.month(), startDate.date() + i);
    const dateString = d.format('YYYY-MM-DD');
    const day = userStore.daysMap.find((item) => item.index === d.day());
    if (!day) continue;
    const hasEvent = Array.from(events.value).some((evt) => isEventOnDate(evt, d));

    days.push({
      date: d,
      dateString,
      dayNumber: d.date(),
      dayOfWeek: day.index,
      isCurrentMonth: d.month() === month,
      isToday: dateString === todayStr,
      isWeekend: day.isWeekend,
      hasEvent,
    });
  }

  return days;
});

/** ミニカレンダーの表示月を前月へ移動（メインカレンダーには影響しない） */
function goPrevMonth() {
  usingDate.value = usingDate.value.subtract(1, 'month').startOf('month');
}

/** ミニカレンダーの表示月を翌月へ移動（メインカレンダーには影響しない） */
function goNextMonth() {
  usingDate.value = usingDate.value.add(1, 'month').startOf('month');
}

/** ミニカレンダーの表示月を今月へ戻す（メインカレンダーには影響しない） */
function goCurrentMonth() {
  usingDate.value = dayjs();
}

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

watch(
  () => [calendarStore.listVisibleCalendars, usingDate.value],
  async () => {
    events.value = await eventStore.listEvents(usingDate.value.year(), usingDate.value.month());
  },
  { immediate: true },
);
</script>

<template>
  <div class="calendar-mini">
    <!-- ナビゲーションバー -->
    <header>
      <h3>{{ `${usingDate.year()}年 ${usingDate.month() + 1}月` }}</h3>
      <nav>
        <button type="button" @click="goCurrentMonth">
          <IconArrowRotateLeft />
        </button>
        <button type="button" @click="goPrevMonth">
          <IconCaretLeft />
        </button>
        <button type="button" @click="goNextMonth">
          <IconCaretRight />
        </button>
      </nav>
    </header>

    <!-- ミニカレンダー本体 -->
    <table>
      <thead>
        <tr>
          <th v-for="d in userStore.daysMap" :key="d.index" :data-weekend="d.isWeekend" :style="{ color: d.weekendColor ?? undefined }">
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
            :style="{ color: userStore.getWeekendColor(cell.date.day(), !cell.isCurrentMonth) ?? undefined }"
            :data-selected="userStore.nowSelectedDate === cell.dateString ? true : null"
            @click="handleCellClick(cell)">
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
  background-color: var(--bg-1);
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
      color: var(--text);
    }

    nav {
      display: flex;
      gap: 3px;

      button {
        padding: 2px 7px;
        background-color: var(--bg-1);
        border-radius: 4px;
        font-size: 0.75rem;
        cursor: pointer;
        transition: background-color 0.15s ease;

        &:hover {
          background-color: var(--bg-2);
        }

        &:active {
          background-color: var(--bg-3);
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
          color: var(--text-light);

          &[data-weekend='true'] {
            color: var(--danger);
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
          color: var(--text-light);

          &:hover {
            background-color: var(--bg-2);
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
            background-color: var(--primary);
          }

          // 当月日付
          &[data-current-month='true'] {
            color: var(--text);

            &[data-weekend='true'] {
              color: var(--danger);
            }
          }

          // 今日の日付
          &[data-today='true'] {
            .day-number {
              background-color: var(--bg-2);
              color: var(--primary);
              font-weight: 700;
              border-radius: 50%;
            }
          }

          // 選択中セル
          &[data-selected='true'] {
            background-color: var(--selected);

            .day-number {
              background-color: transparent;
            }

            .dot {
              background-color: var(--bg-0);
            }
          }
        }
      }
    }
  }
}
</style>
