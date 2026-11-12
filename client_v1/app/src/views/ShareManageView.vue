<script setup>
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.js';
import MenuBar from '@/components/MenuBar.vue';
import AskLoginMessage from '@/components/AskLoginMessage.vue';
import IconXMark from '@/components/icons/IconXMark.vue';
import ShareManageViewCreateForm from '@/components/items/ShareManageViewCreateForm.vue';
import ShareManageViewSpecList from '@/components/items/ShareManageViewSpecList.vue';

const router = useRouter();
const authStore = useAuthStore();
</script>

<template>
  <div class="share-manage-view">
    <MenuBar>
      <template #main>
        <h1 class="title">期間を指定して共有</h1>
      </template>
      <template #sub>
        <button class="icon-x-mark-btn" title="カレンダーに戻る" @click="router.push({ name: 'Home' })">
          <IconXMark />
        </button>
      </template>
      選択した期間の予定だけを共有します
    </MenuBar>

    <AskLoginMessage v-if="!authStore.isAuthenticated">共有するには Google アカウントでログインする必要があります</AskLoginMessage>

    <template v-else>
      <ShareManageViewCreateForm />
      <ShareManageViewSpecList />
    </template>
  </div>
</template>

<style lang="scss" scoped>
.share-manage-view {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  height: 100%;
}

.icon-x-mark-btn {
  background-color: var(--bg-1);
  &:hover {
    background-color: var(--bg-2);
  }
}
</style>
