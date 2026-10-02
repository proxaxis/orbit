<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  modelValue: {
    type: String,
    default: '#ffffff',
  },
});

const emit = defineEmits(['update:modelValue']);

// カレンダーで見やすい基本パレット
const presetColors = [
  '#ff4d4d', // Red
  '#ff9f43', // Orange
  '#ffeb3b', // Yellow
  '#2ecc71', // Green
  '#54a0ff', // Blue
  '#5f27cd', // Purple
  '#ff9ff3', // Pink
  '#576574', // Grey
  '#222f3e', // Dark
  '#ffffff', // White
];

// ローカルの入力値
const inputValue = ref(props.modelValue);

// 親からの変更を反映
watch(() => props.modelValue, (newVal) => {
  inputValue.value = newVal;
});

// 色の更新処理
const updateColor = (color) => {
  inputValue.value = color;
  emit('update:modelValue', color);
};

// 手入力時の処理
const handleTextInput = (event) => {
  const val = event.target.value;
  // #を含まない場合は付与などの補正ロジックを入れることも可能
  if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
    emit('update:modelValue', val);
  }
};
</script>

<template>
  <div class="color-picker">
    <div class="picker-controls">
      <div class="preview-wrapper">
        <input 
          type="color" 
          :value="inputValue" 
          @input="updateColor($event.target.value)"
          class="native-input"
        />
        <div 
          class="color-preview" 
          :style="{ backgroundColor: inputValue }"
        ></div>
      </div>

      <input 
        type="text" 
        :value="inputValue" 
        @input="handleTextInput"
        maxlength="7"
        class="text-input"
      />
    </div>

    <div class="preset-grid">
      <button
        v-for="color in presetColors"
        :key="color"
        type="button"
        class="preset-btn"
        :style="{ backgroundColor: color }"
        :class="{ active: color.toLowerCase() === inputValue.toLowerCase() }"
        @click="updateColor(color)"
        :aria-label="color"
      ></button>
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
			border: 2px solid #ddd;
			cursor: pointer;

			&:hover {
				border-color: #aaa;
			}
		}

		.text-input {
			flex: 1;
			padding: 8px 12px;
			font-family: monospace;
			text-transform: uppercase;
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
			border: 1px solid rgba(0, 0, 0, 0.1);
			cursor: pointer;
			transition: transform 0.1s, box-shadow 0.1s;
			padding: 0;

			&:hover {
				transform: scale(1.1);
			}

			&.active {
				box-shadow: 0 0 0 2px white, 0 0 0 4px #007bff;
				border-color: transparent;
			}
		}
	}
}

/* ネイティブのinput[type=color]を透明にして前面に配置 */
.native-input {
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  opacity: 0;
  cursor: pointer;
}

.color-preview {
  width: 100%;
  height: 100%;
}
</style>
