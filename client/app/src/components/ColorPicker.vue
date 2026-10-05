<script setup>
import { ref, watch } from 'vue';
import { GOOGLE_CALENDAR_LIST_COLORS } from '@/services/google-calendar-colors.js';

const props = defineProps({
  modelValue: {
    type: String,
    default: '1',
  },
});

const emit = defineEmits(['update:modelValue']);

const presetColors = Object.entries(GOOGLE_CALENDAR_LIST_COLORS).map(([colorId, color]) => ({ colorId, ...color }));

// ローカルの入力値
const inputValue = ref(props.modelValue);

// 親からの変更を反映
watch(
  () => props.modelValue,
  (newVal) => {
    inputValue.value = newVal;
  },
);

// 色の更新処理
const updateColor = (colorId) => {
  inputValue.value = colorId;
  emit('update:modelValue', colorId);
};
</script>

<template>
  <div class="color-picker">
    <div class="picker-controls">
      <div class="preview-wrapper" :style="{ backgroundColor: GOOGLE_CALENDAR_LIST_COLORS[inputValue]?.background }" aria-hidden="true"></div>
      <span class="color-name">{{ GOOGLE_CALENDAR_LIST_COLORS[inputValue]?.name }}</span>
    </div>

    <div class="preset-grid" role="listbox" aria-label="Google Calendar colors">
      <button
        v-for="color in presetColors"
        :key="color.colorId"
        type="button"
        class="preset-btn"
        :style="{ backgroundColor: color.background }"
        :class="{ active: color.colorId === inputValue }"
        @click="updateColor(color.colorId)"
        :aria-label="`${color.name} (${color.colorId})`"
        :aria-selected="color.colorId === inputValue"
        role="option"></button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.color-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;

  .picker-controls {
    display: flex;
    gap: 8px;
    align-items: center;

    .preview-wrapper {
      position: relative;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      overflow: hidden;
      border: 2px solid var(--border);
      cursor: pointer;

      &:hover {
        border-color: var(--border-color);
      }
    }

    .color-name {
      flex: 1;
      font-size: 14px;
    }
  }

  .preset-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 4px;

    .preset-btn {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: 1px solid var(--border);
      cursor: pointer;
      transition:
        transform 0.1s,
        box-shadow 0.1s;
      padding: 0;

      &:hover {
        transform: scale(1.1);
      }

      &.active {
        box-shadow:
          0 0 0 2px var(--bg-0),
          0 0 0 4px var(--primary);
        border-color: transparent;
      }
    }
  }
}
</style>
