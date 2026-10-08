<script setup>
/**
 * イベント複製ビュー。
 * 選択中のイベントの内容をフォームへ複写し、新規イベントとして作成する。
 */
import { useRouter } from 'vue-router';
import MenuBar from '@/components/MenuBar.vue';
import EventForm from '@/components/EventForm.vue';
import { useEventSubmit } from '@/composables/useEventSubmit.js';
import IconXMark from '@/components/icons/IconXMark.vue';

const router = useRouter();
const { submitCreate } = useEventSubmit();
</script>

<template>
  <section class="event-view">
    <MenuBar>
      <template #main>
        <h1 class="title">イベントの複製</h1>
      </template>
      <template #sub>
        <div class="menu-bar-actions">
          <button title="複製せずに戻る" @click="router.push({ name: 'Home' })">
            <IconXMark />
          </button>
        </div>
      </template>
      選択中のイベントを複製して新しいイベントを作成します
    </MenuBar>
    <EventForm clone submit-label="複製する" @submit="submitCreate" @cancel="router.back()" />
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
