<script setup>
/**
 * EventForm の繰り返し設定欄。
 * 頻度・間隔・曜日・回数/期限・除外日・休日調整の入力を担う。
 * `recurrence` は親の reactive オブジェクトをそのまま受け取って各フィールドを編集する。
 */
import { WEEKDAYS } from '@/services/rrule.js';

defineProps({
  /** @type {import('vue').PropType<{frequency: string, interval: number, weekdays: string[], monthDay: string|number, month: string|number, count: string|number, until: string, exclusions: string, holidayAdjustment: string}>} 繰り返し設定の入力値 */
  recurrence: { type: Object, required: true },
});
</script>

<template>
  <section>
    <fieldset class="recurrence-fieldset">
      <legend>繰り返し</legend>
      <label>
        <span>頻度</span>
        <select v-model="recurrence.frequency">
          <option value="">繰り返さない</option>
          <option value="DAILY">毎日</option>
          <option value="WEEKLY">毎週</option>
          <option value="MONTHLY">毎月</option>
          <option value="YEARLY">毎年</option>
        </select>
      </label>
      <template v-if="recurrence.frequency">
        <label
          ><span>間隔</span>
          <div class="inline-field">
            <input v-model.number="recurrence.interval" type="number" min="1" max="99" />
            {{ recurrence.frequency === 'DAILY' ? '日' : recurrence.frequency === 'WEEKLY' ? '週' : recurrence.frequency === 'MONTHLY' ? '月' : '年' }}ごと
          </div>
        </label>
        <div v-if="recurrence.frequency === 'WEEKLY' || recurrence.frequency === 'MONTHLY'" class="weekday-options">
          <span>曜日</span>
          <div>
            <label v-for="weekday in WEEKDAYS" :key="weekday.value"><input v-model="recurrence.weekdays" type="checkbox" :value="weekday.value" />{{ weekday.label }}</label>
          </div>
        </div>
        <label v-if="recurrence.frequency === 'MONTHLY'"
          ><span>開始日</span>
          <div class="inline-field"><input v-model.number="recurrence.monthDay" type="number" min="1" max="31" placeholder="D" /> 日</div>
        </label>
        <label v-if="recurrence.frequency === 'YEARLY'"
          ><span>開始月</span>
          <div class="inline-field"><input v-model.number="recurrence.month" type="number" min="1" max="12" placeholder="M" /> 月</div>
        </label>
        <div class="recurrence-end">
          <div class="inline-field">
            <label><span>回数</span> <input v-model.number="recurrence.count" type="number" min="1" placeholder="無制限" /></label>
            <label><span>または期限</span> <input v-model="recurrence.until" type="date" /></label>
          </div>
        </div>
        <label><span>除外日</span> <input v-model="recurrence.exclusions" placeholder="YYYY-MM-DD, YYYY-MM-DD" /></label>
        <label>
          <span>休日の扱い</span>
          <select v-model="recurrence.holidayAdjustment">
            <option value="">通常どおり</option>
            <option value="NEXT_WEEKDAY">休日なら次の平日</option>
            <option value="PREVIOUS_WEEKDAY">休日なら前の平日</option>
          </select>
        </label>
      </template>
    </fieldset>
  </section>
</template>

<style lang="scss" scoped>
section {
  gap: var(--space-xs);
}

.recurrence-fieldset {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: 0 var(--space-sm) var(--space-sm) var(--space-sm);
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: var(--border-radius);

  legend {
    font-size: var(--text-size-xxs);
    padding: 0 var(--space-xs);
  }

  > label {
    display: flex;
    flex-direction: column;

    > span {
      font-size: var(--text-size-xxs);
    }
  }

  .inline-field {
    display: flex;
    align-items: center;
    gap: var(--space-xs);

    > label > span {
      font-size: var(--text-size-xxs);
    }
  }

  .weekday-options {
    display: flex;
    flex-direction: column;

    > div {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-sm);

      > label {
        display: flex;
        align-items: center;
        gap: var(--space-xs);
      }
    }
  }

  .recurrence-end {
    .inline-field {
      display: flex;
      flex-wrap: wrap;
      label:nth-child(1) {
        width: 6rem;
        input {
          width: calc(100% - var(--space-xs) * 2 - 2px);
        }
      }
      label:nth-child(2) {
        flex-grow: 1;
        input {
          width: calc(100% - var(--space-xs) * 2 - 2px);
        }
      }
    }
  }
}
</style>
