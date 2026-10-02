<script setup>
import { onMounted, ref } from 'vue';
import { useCalendarStore } from '@/stores/calendar.js';

const calendarStore = useCalendarStore();

const props = defineProps({
	cid: {
		type: String,
		required: true,
	},
});

const calendar = ref({ summary: '', backgroundColor: '' });

onMounted(async () => {
  const cal = calendarStore.list.find(c => c.id === props.cid);
  calendar.value.summary = cal?.summary ?? '';
  calendar.value.backgroundColor = cal?.backgroundColor ?? '';
});
</script>

<template>
  <div class="calendar-ribbon">
    <span class="color" :style="{ backgroundColor: calendar.backgroundColor }"></span>
    <span class="name">{{ calendar.summary }}</span>
  </div>
</template>

<style lang="scss" scoped>
.calendar-ribbon {
	display: flex;
	flex: 1;
	align-items: center;
	gap: 0.5rem;
	user-select: none;
	overflow: hidden;
}
.color {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}
</style>
