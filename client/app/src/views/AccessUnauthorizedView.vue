<script setup>
/**
 * Google OAuth でユーザが拒否したとき、またはエラーが発生したときに
 * BFF からリダイレクトされるビュー。
 * `?t=` パラメータで対象の認可を識別し、案内を切り替える。
 * - 指定なし: メインの認可（Google Calendar API など）
 * - photo-sharing: Google Photos API の認可
 * - people: Google People API（連絡先連携）の認可
 * - drive: Google Drive API（設定のクラウド同期）の認可
 */
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { BFF_BASE_URL } from '@/stores/auth.js';

const route = useRoute();
const router = useRouter();

/** @type {string} URLパラメータで指定された認可対象 */
const type = computed(() => String(route.query.t ?? ''));

/** @type {ComputedRef<boolean>} 任意機能の認可かどうか（個人設定から再試行できる） */
const isOptionalFeature = computed(() => type.value === 'photo-sharing' || type.value === 'people' || type.value === 'drive');

/** @type {ComputedRef<string>} 認可対象に応じた失敗メッセージ */
const message = computed(() => {
  if (type.value === 'photo-sharing') return '写真共有機能の認証がキャンセルされたか、失敗しました. 利用するには個人設定から再度お試しください.';
  if (type.value === 'people') return '連絡先連携の認証がキャンセルされたか、失敗しました. 利用するには個人設定から再度お試しください.';
  if (type.value === 'drive') return '設定のクラウド同期の認証がキャンセルされたか、失敗しました. 利用するには個人設定から再度お試しください.';
  return 'Google アカウントの認証がキャンセルされたか、失敗しました. カレンダーを同期するにはログインが必要です.';
});

/** メイン認可の再試行（BFF のログインエンドポイントへリダイレクト） */
function retryLogin() {
  window.location.href = `${BFF_BASE_URL}/auth/login`;
}
</script>

<template>
  <section class="unauthorized-view">
    <h1>認証できませんでした</h1>
    <p>{{ message }}</p>
    <div class="actions">
      <button v-if="isOptionalFeature" @click="router.push({ name: 'UserConfig' })">個人設定を開く</button>
      <button v-else @click="retryLogin">ログインし直す</button>
      <button @click="router.push({ name: 'Home' })">ホームへ戻る</button>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.unauthorized-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-md);
  min-height: 100vh;
  padding: var(--space-md);
  text-align: center;

  .actions {
    display: flex;
    gap: var(--space-sm);
    flex-wrap: wrap;
    justify-content: center;
  }

  button {
    padding: var(--space-xs) var(--space-md);
    border: 1px solid var(--border);
    border-radius: var(--border-radius);
  }
}
</style>
