<script setup>
/**
 * TaskCreatorView - タスク登録専用のビュー。
 * フォーム本体は EventForm を task モードで利用する
 * （shared 拡張プロパティ orbitIsTask / orbitTaskStatus / orbitTaskDeferred の付与、
 * 公開設定の非公開固定、招待者への guestsCanModify 付与は EventForm 側が担う）。
 */
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import MenuBar from '@/components/MenuBar.vue';
import EventForm from '@/components/EventForm.vue';
import { useEventSubmit } from '@/composables/useEventSubmit.js';
import IconXMark from '@/components/icons/IconXMark.vue';

const router = useRouter();
const route = useRoute();
const { submitCreate } = useEventSubmit();

/**
 * カレンダーのドラッグ選択等からクエリで渡された初期日時範囲。
 * - 終日: start/end は YYYY-MM-DD（end は含む側の日付）+ allday=1
 * - 時間指定: start/end は YYYY-MM-DDTHH:mm
 * @type {ComputedRef<{start: string, end: string, isAllDay: boolean}|null>}
 */
const initialRange = computed(() => {
  const start = typeof route.query.start === 'string' ? route.query.start : '';
  if (!start) return null;
  const end = typeof route.query.end === 'string' && route.query.end ? route.query.end : start;
  const isAllDay = route.query.allday === '1' || !start.includes('T');
  return { start, end, isAllDay };
});
</script>

<template>
  <section class="event-view">
    <MenuBar>
      <template #main>
        <h1 class="title">タスク作成</h1>
      </template>
      <template #sub>
        <div class="menu-bar-actions">
          <button title="閉じる" @click="router.back()">
            <IconXMark />
          </button>
        </div>
      </template>
      新しいタスクを作成します. タスクはあなたにしか表示されません. ただし招待者には閲覧と編集の権限が与えられます.
    </MenuBar>
    <EventForm :task="true" :initial-range="initialRange" @submit="submitCreate" @cancel="router.back()" />
  </section>
</template>

<style lang="css" scoped>
button {
  background-color: var(--bg-1);

  &:hover {
    background-color: var(--bg-2);
  }
}
</style>
