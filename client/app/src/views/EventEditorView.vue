<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import MenuBar from '@/components/MenuBar.vue';
import EventForm from '@/components/EventForm.vue';
import { useEventSubmit } from '@/composables/useEventSubmit.js';
import IconXMark from '@/components/icons/IconXMark.vue';

const router = useRouter();
const { submitUpdate, loadEditingEvent } = useEventSubmit();

/** @type {Ref<HandyCalendarEvent|null>} 編集対象のイベント */
const event = ref(null);

onMounted(async () => {
  event.value = await loadEditingEvent();
});

/**
 * フォームの送信内容で選択中のイベントを更新する
 * @param {import('@/composables/useEventSubmit.js').EventSubmitPayload} payload フォームの送信内容
 * @returns {Promise<void>}
 */
function update(payload) {
  return submitUpdate(payload, event.value);
}
</script>

<template>
  <section class="event-view">
    <MenuBar>
      <template #main>
        <h1 class="title">イベントの編集</h1>
      </template>
      <template #sub>
        <div class="menu-bar-actions">
          <button title="保存せずに戻る" @click="router.push({ name: 'Home' })">
            <IconXMark />
          </button>
        </div>
      </template>
    </MenuBar>
    <EventForm submit-label="更新する" @submit="update" @cancel="router.back()" />
  </section>
</template>

<style lang="scss" scoped>
button {
  background-color: var(--bg-1);

  &:hover {
    background-color: var(--bg-2);
  }
}
</style>
