<script setup>
/**
 * Google OAuth の認可後に BFF からリダイレクトされるビュー。
 * `?t=` パラメータで対象の認可を識別し、対応するトークンを BFF から取得して
 * 機能を有効化する。
 * - 指定なし: メインの認可（Google Calendar API など）
 * - photo-sharing: Google Photos API の認可
 * - people: Google People API（連絡先連携）の認可
 * - drive: Google Drive API（設定のクラウド同期）の認可
 */
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
const message = ref('認証内容を確認しています...');

onMounted(async () => {
  const type = route.query.t;
  if (type === 'photo-sharing') {
    const token = await auth.fetchPhotoToken();
    if (token) {
      userStore.setUsePhotoSharing(true);
      state.value = 'success';
      message.value = '写真共有機能が有効になりました.';
      window.setTimeout(() => router.push({ name: 'Home' }), 1200);
      return;
    }
    state.value = 'error';
    message.value = '写真共有の認証に失敗しました. 個人設定から再度お試しください.';
    return;
  }
  if (type === 'people') {
    const token = await auth.fetchPeopleToken();
    if (token) {
      userStore.setUsePeopleApi(true);
      state.value = 'success';
      message.value = '連絡先との連携が有効になりました.';
      window.setTimeout(() => router.push({ name: 'Home' }), 1200);
      return;
    }
    state.value = 'error';
    message.value = '連絡先の認証に失敗しました. 個人設定から再度お試しください.';
    return;
  }
  if (type === 'drive') {
    const token = await auth.fetchDriveToken();
    if (token) {
      userStore.setUseDriveSync(true);
      state.value = 'success';
      message.value = '設定のクラウド同期が有効になりました.';
      window.setTimeout(() => router.push({ name: 'Home' }), 1200);
      return;
    }
    state.value = 'error';
    message.value = '設定のクラウド同期の認証に失敗しました. 個人設定から再度お試しください.';
    return;
  }
  // t 未指定: メインの認可（Google Calendar API など）
  const token = await auth.fetchToken();
  if (token) {
    state.value = 'success';
    message.value = 'ログインが完了しました.';
    window.setTimeout(() => router.push({ name: 'Home' }), 1200);
    return;
  }
  state.value = 'error';
  message.value = 'ログインに失敗しました. 時間をおいて再度お試しください.';
});
</script>

<template>
  <section class="authorized-view" :data-state="state">
    <h1>アクセスの認可</h1>
    <p>{{ message }}</p>
    <button v-if="state !== 'loading'" @click="router.push({ name: 'Home' })">ホームへ戻る</button>
  </section>
</template>

<style lang="scss" scoped>
.authorized-view {
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
