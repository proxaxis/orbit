<script setup>
import { computed } from 'vue';
import { useUserStore } from '@/stores/user.js';
import { useArrowDateNavigation } from '@/composables/useDateNavigation.js';
import CalendarMonthHorizonView from '@/views/CalendarMonthHorizonView.vue';
import CalendarMonthVerticalView from '@/views/CalendarMonthVerticalView.vue';
import CalendarWeekTimelineView from '@/views/CalendarWeekTimelineView.vue';

const userStore = useUserStore();

// デスクトップ表示では矢印キーの上下左右で選択日を移動できるようにする
useArrowDateNavigation();

const props = defineProps({
  selectPane: { type: Function, default: () => {} },
  collapseMobileSubPane: { type: Function, default: () => {} },
});

const viewComponent = computed(() => {
  if (userStore.mainCalendarView === 'WEEK') return CalendarWeekTimelineView;
  if (userStore.mainCalendarView === 'MONTH_VERTICAL') return CalendarMonthVerticalView;
  return CalendarMonthHorizonView;
});
</script>

<template>
  <component :is="viewComponent" :select-pane="props.selectPane" :collapse-mobile-sub-pane="props.collapseMobileSubPane" />
</template>
