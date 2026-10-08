<script setup>
/**
 * EventForm のイベント個別カラー設定欄。
 * Google カレンダーのイベントカラーパレットから選択する。
 * 未選択時は保存先カレンダーの色が使われる。
 */
import { GOOGLE_CALENDAR_EVENT_COLORS } from '@/services/google-calendar-colors.js';

const props = defineProps({
  /** @type {import('vue').PropType<string>} 選択中のイベント Color ID（'' はカレンダーの色） */
  modelValue: { type: String, default: '' },
  /** @type {import('vue').PropType<string>} カレンダー色のプレビューに使う背景色 */
  calendarColor: { type: String, default: '#2196f3' },
});

const emit = defineEmits(['update:modelValue']);

/** @type {{colorId: string, name: string, background: string, foreground: string}[]} 選択可能なイベントカラー */
const presetColors = Object.entries(GOOGLE_CALENDAR_EVENT_COLORS).map(([colorId, color]) => ({ colorId, ...color }));
</script>

<template>
  <section>
    <span>色</span>
    <div class="color-preset-grid" role="listbox" aria-label="イベントの色">
      <button type="button" class="color-swatch" :class="{ active: !props.modelValue }" :style="{ backgroundColor: props.calendarColor }" title="カレンダーの色" aria-label="カレンダーの色" :aria-selected="!props.modelValue" role="option" @click="emit('update:modelValue', '')"></button>
      <button
        v-for="color in presetColors"
        :key="color.colorId"
        type="button"
        class="color-swatch"
        :class="{ active: color.colorId === props.modelValue }"
        :style="{ backgroundColor: color.background }"
        :title="color.name"
        :aria-label="`${color.name} (${color.colorId})`"
        :aria-selected="color.colorId === props.modelValue"
        role="option"
        @click="emit('update:modelValue', color.colorId)"></button>
    </div>
  </section>
</template>

<style lang="scss" scoped>
section {
  display: flex;
  flex-direction: column;
  padding: var(--space-sm);

  > span {
    font-size: var(--text-size-xxs);
  }
}

.color-preset-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);

  .color-swatch {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 1px solid var(--border);
    cursor: pointer;
    padding: 0;
    transition:
      transform 0.1s,
      box-shadow 0.1s;

    &:hover {
      transform: scale(1.1);
    }

    &.active {
      box-shadow:
        0 0 0 2px var(--bg-0),
        0 0 0 4px var(--primary);
    }
  }
}
</style>
