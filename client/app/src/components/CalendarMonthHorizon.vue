<script setup>
import { ref, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useCalendarStore } from '@/stores/calendar.js';
import { useUserStore } from '@/stores/user.js';

const emit = defineEmits(['cell-clicked']);

const calendarStore = useCalendarStore();
const userStore = useUserStore();

const { sortedEvents } = storeToRefs(calendarStore);
const { firstDayOfWeek, weekendDays } = storeToRefs(userStore);

// 表示基準となる年月（常にその月の1日）
const currentDate = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

// 選択中の日付 (YYYY-MM-DD)
const selectedDateStr = ref(null);

const DAYS_MAP = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DAY_LABELS = {
  SUN: '日',
  MON: '月',
  TUE: '火',
  WED: '水',
  THU: '木',
  FRI: '金',
  SAT: '土',
};

// ヘッダー表示用 (YYYY年 M月)
const currentYearMonthText = computed(() => {
  const y = currentDate.value.getFullYear();
  const m = currentDate.value.getMonth() + 1;
  return `${y}年 ${m}月`;
});

// userStore.firstDayOfWeek に応じたヘッダー用曜日の並び順
const orderedDays = computed(() => {
  const startIndex = DAYS_MAP.indexOf(firstDayOfWeek.value);
  const result = [];
  for (let i = 0; i < 7; i++) {
    result.push(DAYS_MAP[(startIndex + i) % 7]);
  }
  return result;
});

// 日付ヘルパー: YYYY-MM-DD
function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 前月・次月移動
function prevMonth() {
  currentDate.value = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth() - 1, 1);
}

function nextMonth() {
  currentDate.value = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth() + 1, 1);
}

function today() {
  const now = new Date();
  currentDate.value = new Date(now.getFullYear(), now.getMonth(), 1);
}

// カレンダーグリッドのセル生成（前月・当月・翌月の日付を含む）
const calendarDays = computed(() => {
  const year = currentDate.value.getFullYear();
  const month = currentDate.value.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);

  const startDayOffset = (firstDayOfMonth.getDay() - DAYS_MAP.indexOf(firstDayOfWeek.value) + 7) % 7;
  const startDate = new Date(year, month, 1 - startDayOffset);

  const totalCells = Math.ceil((startDayOffset + lastDayOfMonth.getDate()) / 7) * 7;
  const todayStr = formatDate(new Date());

  const days = [];
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
    const dateStr = formatDate(d);
    const dayOfWeek = DAYS_MAP[d.getDay()];

    // 当該日のイベントを抽出
    const events = sortedEvents.value.filter((event) => {
      const eventDate = (event.start?.dateTime || event.start?.date || '').slice(0, 10);
      return eventDate === dateStr;
    });

    days.push({
      date: d,
      dateStr,
      dayNumber: d.getDate(),
      dayOfWeek,
      isCurrentMonth: d.getMonth() === month,
      isToday: dateStr === todayStr,
      isWeekend: weekendDays.value.includes(dayOfWeek),
      events,
    });
  }

  return days;
});

// セルクリックハンドラ: 1回目は選択、2回目（同じセル）は cell-clicked イベントを発火
function handleCellClick(cell) {
  if (selectedDateStr.value === cell.dateStr) {
    emit('cell-clicked', cell);
  } else {
    selectedDateStr.value = cell.dateStr;
  }
}
</script>

<template>
  <div class="calendar-month-horizon">
    <!-- ナビゲーションバー -->
    <header>
      <h2>{{ currentYearMonthText }}</h2>
      <nav>
        <button type="button" @click="today">今月</button>
        <button type="button" @click="prevMonth">&lt; 前月</button>
        <button type="button" @click="nextMonth">翌月 &gt;</button>
      </nav>
    </header>

    <!-- カレンダー本体の表 -->
    <table>
      <thead>
        <tr>
          <th
            v-for="day in orderedDays"
            :key="day"
            :data-weekend="weekendDays.includes(day) ? 'true' : null"
          >
            {{ DAY_LABELS[day] }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="rowIdx in Math.ceil(calendarDays.length / 7)" :key="rowIdx">
          <td
            v-for="cell in calendarDays.slice((rowIdx - 1) * 7, rowIdx * 7)"
            :key="cell.dateStr"
            :data-current-month="cell.isCurrentMonth ? 'true' : null"
            :data-today="cell.isToday ? 'true' : null"
            :data-weekend="cell.isWeekend ? 'true' : null"
            :data-selected="selectedDateStr === cell.dateStr ? 'true' : null"
            @click="handleCellClick(cell)"
          >
            <div class="cell-header">
              <span class="day-number">{{ cell.dayNumber }}</span>
            </div>
            <ul class="event-list">
              <li v-for="item in cell.events" :key="item.id" :title="item.summary">
                {{ item.summary || '(タイトルなし)' }}
              </li>
            </ul>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped lang="scss">
.calendar-month-horizon {
  display: flex;
  flex-direction: column;
  width: 100%;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
  background-color: #fff;
  font-family: inherit;
  box-sizing: border-box;

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 20px;
    background-color: #fcfcfc;
    border-bottom: 1px solid #e0e0e0;

    h2 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 600;
      color: #333;
    }

    nav {
      display: flex;
      gap: 6px;

      button {
        padding: 6px 12px;
        background-color: #fff;
        border: 1px solid #ccc;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.85rem;
        transition: all 0.15s ease-in-out;

        &:hover {
          background-color: #f0f0f0;
          border-color: #bbb;
        }

        &:active {
          background-color: #e5e5e5;
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
          padding: 10px 0;
          text-align: center;
          font-size: 0.85rem;
          font-weight: 600;
          color: #555;
          background-color: #f7f9fa;
          border-bottom: 1px solid #e0e0e0;
          border-right: 1px solid #e0e0e0;

          &:last-child {
            border-right: none;
          }

          &[data-weekend='true'] {
            color: #d32f2f;
            background-color: #fff8f8;
          }
        }
      }
    }

    tbody {
      tr {
        td {
          height: 100px;
          vertical-align: top;
          padding: 6px;
          border-right: 1px solid #e0e0e0;
          border-bottom: 1px solid #e0e0e0;
          cursor: pointer;
          transition: background-color 0.15s ease;
          background-color: #fafafa;
          color: #bbb;

          &:last-child {
            border-right: none;
          }

          // 当月の日付
          &[data-current-month='true'] {
            background-color: #fff;
            color: #333;

            &[data-weekend='true'] {
              background-color: #fffcfc;

              .cell-header .day-number {
                color: #d32f2f;
              }
            }
          }

          // 今日の日付
          &[data-today='true'] {
            background-color: #eef7ff !important;

            .cell-header .day-number {
              background-color: #1a73e8;
              color: #fff;
              border-radius: 50%;
              width: 22px;
              height: 22px;
              display: inline-flex;
              align-items: center;
              justify-content: center;
            }
          }

          // 選択中セルの強調
          &[data-selected='true'] {
            outline: 2px solid #1a73e8;
            outline-offset: -2px;
            background-color: #e8f0fe !important;
          }

          &:hover {
            filter: brightness(0.97);
          }

          .cell-header {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 4px;

            .day-number {
              font-size: 0.8rem;
              font-weight: 500;
            }
          }

          .event-list {
            list-style: none;
            padding: 0;
            margin: 0;
            display: flex;
            flex-direction: column;
            gap: 2px;
            max-height: 70px;
            overflow-y: auto;

            li {
              font-size: 0.75rem;
              padding: 2px 5px;
              background-color: #e8f0fe;
              color: #1967d2;
              border-radius: 3px;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
          }
        }

        &:last-child td {
          border-bottom: none;
        }
      }
    }
  }
}
</style>
