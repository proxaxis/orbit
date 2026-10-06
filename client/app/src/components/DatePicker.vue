<script setup>
import { computed, ref } from 'vue';
import dayjs, { toDayjs } from '@/services/dayjs.js';
import { useUserStore } from '@/stores/user.js';
import IconCaretLeft from '@/components/icons/IconCaretLeft.vue';
import IconCaretRight from '@/components/icons/IconCaretRight.vue';

const props = defineProps({
  modelValue: { type: String, default: '' },
});

const emit = defineEmits(['update:modelValue', 'close']);
const userStore = useUserStore();

const visibleMonth = ref(toDayjs(props.modelValue || undefined).startOf('month'));
const weekdays = computed(() => userStore.daysMap);

const calendarDays = computed(() => {
  const firstDay = visibleMonth.value.startOf('month');
  const startDayOffset = (firstDay.day() - userStore.firstDayOfWeek + 7) % 7;
  const firstCell = firstDay.subtract(startDayOffset, 'day');
  return Array.from({ length: 42 }, (_, index) => {
    const date = firstCell.add(index, 'day');
    const isCurrentMonth = date.year() === visibleMonth.value.year() && date.month() === visibleMonth.value.month();
    return {
      value: date.format('YYYY-MM-DD'),
      label: date.date(),
      dayOfWeek: date.day(),
      isCurrentMonth,
      isToday: date.isSame(dayjs(), 'day'),
      weekendColor: userStore.getWeekendColor(date.day(), !isCurrentMonth),
    };
  });
});

function changeMonth(amount) {
  visibleMonth.value = visibleMonth.value.add(amount, 'month');
}

function selectDate(value) {
  emit('update:modelValue', value);
  emit('close');
}

function selectToday() {
  const today = dayjs();
  visibleMonth.value = today.startOf('month');
  selectDate(today.format('YYYY-MM-DD'));
}
</script>

<template>
  <div class="date-picker" role="dialog" aria-label="日付を選択">
    <header>
      <button type="button" aria-label="前の月" @click="changeMonth(-1)"><IconCaretLeft /></button>
      <strong>{{ visibleMonth.format('YYYY年 M月') }}</strong>
      <button type="button" aria-label="次の月" @click="changeMonth(1)"><IconCaretRight /></button>
    </header>
    <div class="weekdays" aria-hidden="true">
      <span v-for="weekday in weekdays" :key="weekday.index" :data-weekend="weekday.isWeekend" :style="{ color: weekday.weekendColor ?? undefined }">{{ weekday.label }}</span>
    </div>
    <div class="days">
      <button
        v-for="date in calendarDays"
        :key="date.value"
        type="button"
        :data-current-month="date.isCurrentMonth"
        :data-today="date.isToday"
        :data-weekend="date.weekendColor !== null"
        :style="{ color: date.weekendColor ?? undefined }"
        :data-selected="date.value === modelValue"
        :aria-label="date.value"
        :aria-pressed="date.value === modelValue"
        @click="selectDate(date.value)">
        {{ date.label }}
      </button>
    </div>
    <footer>
      <button type="button" @click="selectToday">今日</button>
      <button type="button" @click="emit('close')">閉じる</button>
    </footer>
  </div>
</template>

<style lang="scss" scoped>
.date-picker {
  position: absolute;
  z-index: 30;
  width: min(18rem, calc(100vw - 2rem));
  padding: var(--space-sm);
  border: 1px solid var(--border);
  border-radius: var(--border-radius);
  background: var(--bg-1);
  box-shadow: 0 2px 6px var(--shadow);
}

header,
footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-xs);
}

header {
  margin-bottom: var(--space-xs);

  strong {
    font-size: var(--text-size-sm);
  }

  button {
    padding: var(--space-xxs) var(--space-xs);
  }
}

.weekdays,
.days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}

.weekdays {
  margin-bottom: 2px;
  color: var(--text-light);
  font-size: var(--text-size-xxs);
  text-align: center;
}

.days button {
  aspect-ratio: 1;
  padding: 0;
  border-radius: 50%;
  color: var(--text-light);
  font-size: var(--text-size-xs);

  &[data-current-month='true'] {
    color: var(--text);
  }

  &[data-today='true'] {
    outline: 1px solid var(--primary);
  }

  &[data-selected='true'] {
    background: var(--selected);
    color: var(--text);
    font-weight: 700;
  }

  &:hover {
    background: var(--bg-2);
  }
}

footer {
  justify-content: flex-end;
  margin-top: var(--space-xs);

  button {
    padding: var(--space-xxs) var(--space-xs);
    color: var(--primary);
    font-size: var(--text-size-xs);
  }
}
</style>
