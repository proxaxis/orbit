<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import MenuBar from '@/components/MenuBar.vue';
import EventForm from '@/components/EventForm.vue';
import { useEventSubmit } from '@/composables/useEventSubmit.js';
import { useEventTemplates } from '@/composables/useEventTemplates.js';
import { useUserStore } from '@/stores/user.js';
import IconXMark from '@/components/icons/IconXMark.vue';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();
const { submitCreate } = useEventSubmit();
const eventTemplates = useEventTemplates();

/** @type {Ref<OrbitEventTemplate|null>} クエリで指定されたテンプレート */
const template = ref(null);
/** @type {Ref<boolean>} テンプレートの解決が完了したか（フォーム描画前に確定させる） */
const isTemplateResolved = ref(false);

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

onMounted(async () => {
  const templateId = typeof route.query.template === 'string' ? route.query.template : '';
  if (templateId) {
    await eventTemplates.ensureLoaded();
    template.value = eventTemplates.findById(templateId);
    if (!template.value) userStore.showToast('指定されたテンプレートが見つかりませんでした');
  }
  isTemplateResolved.value = true;
});
</script>

<template>
  <section class="event-view">
    <MenuBar>
      <template #main>
        <h1 class="title">イベント作成</h1>
      </template>
      <template #sub>
        <div class="menu-bar-actions">
          <button title="閉じる" @click="router.push({ name: 'Home' })">
            <IconXMark />
          </button>
        </div>
      </template>
      {{ template ? `テンプレート「${template.name}」から作成します` : '新しいイベントを作成します' }}
    </MenuBar>
    <EventForm v-if="isTemplateResolved" :template="template" :initial-range="initialRange" @submit="submitCreate" @cancel="router.back()" />
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
