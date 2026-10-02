<script setup>
import { ref, onMounted, computed } from 'vue';

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
});

const emit = defineEmits(['update:modelValue']);

// タイムゾーンリストの状態
const timezones = ref([]);

// ブラウザのAPIからタイムゾーン一覧を取得
const loadTimezones = () => {
  if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
    timezones.value = Intl.supportedValuesOf('timeZone');
  } else {
    // 古いブラウザ向けのフォールバック（主要なもののみ）
    timezones.value = [
      'UTC',
      'Asia/Tokyo',
      'America/New_York',
      'Europe/London',
      'Australia/Sydney',
    ];
  }
};

// 現在のブラウザ設定からタイムゾーンを推定して設定
const setLocalTimezone = () => {
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  emit('update:modelValue', localTz);
};

// 選択値の更新
const onSelectChange = (event) => {
  emit('update:modelValue', event.target.value);
};

onMounted(() => {
  loadTimezones();
  // 値が空の場合、自動的にローカルタイムゾーンをセットするオプション
  if (!props.modelValue) {
    setLocalTimezone();
  }
});
</script>

<template>
  <div class="timezone-selecter">
		<select class="timezone-input" :value="modelValue" @change="onSelectChange">
			<option value="" disabled>タイムゾーンを選択</option>
			<option v-for="tz in timezones" :key="tz" :value="tz">
				{{ tz.replace(/_/g, ' ') }}
			</option>
		</select>
		
		<button title="現在の場所のタイムゾーンを設定" type="button" class="btn-current-location" @click="setLocalTimezone">
			現在地
		</button>
  </div>
</template>

<style lang="scss" scoped>
.timezone-selecter {
  display: flex;
  gap: 0.3rem;
}

.timezone-input {
	width: calc(100% - 1.2rem);
  border-radius: var(--border-radius);
  cursor: pointer;

  &:focus {
    border-color: #007bff;
    outline: none;
  }
}

.btn-current-location {
  padding: 0.25rem 0.6rem;
  border-radius: var(--border-radius);
  cursor: pointer;
  font-size: 14px;
  white-space: nowrap;

	&:hover {
		background-color: var(--bg-2);
	}
}
</style>
