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
  // 保存済み設定の読み込みが終わるまで待つ。完了前に既定の月表示でレンダリングすると
  // 前回の表示モードへ一瞬で切り替わるチラつきと不要なイベント取得が発生する
  if (!userStore.settingsLoaded) return null;
  if (userStore.mainCalendarView === 'WEEK') return CalendarWeekTimelineView;
  if (userStore.mainCalendarView === 'MONTH_VERTICAL') return CalendarMonthVerticalView;
  return CalendarMonthHorizonView;
});
</script>

<template>
  <component v-if="viewComponent" :is="viewComponent" :select-pane="props.selectPane" :collapse-mobile-sub-pane="props.collapseMobileSubPane" />
</template>
