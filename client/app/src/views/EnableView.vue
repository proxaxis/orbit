<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '@/composables/useAuth.js';
import { useUserStore } from '@/stores/user.js';

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const userStore = useUserStore();

/** @type {Ref<'loading'|'success'|'error'>} 認証結果の状態 */
const state = ref('loading');
const message = ref('写真共有機能を有効化しています...');

onMounted(async () => {
  const type = route.query.t;
  if (type === 'photo-sharing') {
    const token = await auth.fetchPhotoToken();
    if (token) {
      userStore.setUsePhotoSharing(true);
      state.value = 'success';
      message.value = '写真共有機能が有効になりました。';
      window.setTimeout(() => router.replace({ name: 'UserConfig' }), 1200);
      return;
    }
    state.value = 'error';
    message.value = '写真共有の認証に失敗しました。ユーザー設定から再度お試しください。';
    return;
  }
  state.value = 'error';
  message.value = '不明な有効化リクエストです。';
});
</script>

<template>
  <section class="enable-view" :data-state="state">
    <h1>機能の有効化</h1>
    <p>{{ message }}</p>
    <button v-if="state !== 'loading'" @click="router.push({ name: 'UserConfig' })">ユーザー設定へ戻る</button>
  </section>
</template>

<style lang="scss" scoped>
.enable-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-md);
  min-height: 100vh;
  padding: var(--space-md);
  text-align: center;

  button {
    padding: var(--space-xs) var(--space-md);
    border: 1px solid var(--border);
    border-radius: var(--border-radius);
  }
}
</style>
