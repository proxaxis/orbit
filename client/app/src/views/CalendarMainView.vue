<script setup>
import { computed } from 'vue';
import { useUserStore } from '@/stores/user.js';
import CalendarMonthHorizonView from '@/views/CalendarMonthHorizonView.vue';
import CalendarWeekTimelineView from '@/views/CalendarWeekTimelineView.vue';

const userStore = useUserStore();

const props = defineProps({
  selectPane: { type: Function, default: () => {} },
  collapseMobileSubPane: { type: Function, default: () => {} },
});

const viewComponent = computed(() => (userStore.mainCalendarView === 'WEEK' ? CalendarWeekTimelineView : CalendarMonthHorizonView));
</script>

<template>
  <component :is="viewComponent" :select-pane="props.selectPane" :collapse-mobile-sub-pane="props.collapseMobileSubPane" />
</template>
