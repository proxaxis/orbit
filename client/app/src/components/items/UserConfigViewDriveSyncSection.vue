<script setup>
/**
 * UserConfigView のクラウド同期欄。
 * Google Drive appDataFolder への設定・セッションカレンダー同期の
 * 有効化（OAuth 認証）・無効化と認証状態の表示を担う。
 * 有効にすると個人設定やセッションカレンダーがデバイス間で同期される。
 */
import { onMounted } from 'vue';
import { useAuthStore, BFF_BASE_URL } from '@/stores/auth.js';
import { useUserStore } from '@/stores/user.js';
import { useAuth } from '@/composables/useAuth.js';
import { useDriveSync } from '@/composables/useDriveSync.js';
import IconCloudArrowUp from '@/components/icons/IconCloudArrowUp.vue';
import IconXMark from '@/components/icons/IconXMark.vue';

const authStore = useAuthStore();
const userStore = useUserStore();
const auth = useAuth();
const driveSync = useDriveSync();

onMounted(async () => {
  if (!authStore.isAuthenticated || !userStore.useDriveSync || authStore.isDriveSyncAuthorized) return;
  userStore.setLoading(true, '認証状態を確認しています...');
  try {
    await auth.ensureDriveToken();
  } finally {
    userStore.setLoading(false);
  }
});

/** クラウド同期の有効化（Google OAuth 認証へリダイレクト） */
function startDriveAuth() {
  window.location.href = `${BFF_BASE_URL}/auth/drive`;
}

/** クラウド同期を無効化し、保存済みの Drive トークンを破棄する */
async function disableDriveSync() {
  const confirmed = await userStore.confirm({
    title: 'クラウド同期を無効化',
    message: '設定やセッションカレンダーの Drive への同期を停止します. Drive 上のデータは残ります.',
  });
  if (!confirmed) return;
  driveSync.stopDriveSync();
  userStore.setUseDriveSync(false);
  auth.clearDriveToken();
}
</script>

<template>
  <section class="config-section">
    <p class="hint">個人設定やセッションカレンダーをGoogle Driveのアプリ専用領域へ保存し、デバイス間で同期します. 有効化にはGoogleアカウントでの追加認証が必要です.</p>
    <p v-if="!authStore.isAuthenticated" class="hint">利用するには Google アカウントでログインしてください.</p>
    <p v-else-if="userStore.isLoading" class="hint">認証状態を確認しています...</p>
    <template v-else-if="userStore.useDriveSync && authStore.isDriveSyncAuthorized">
      <p class="hint">クラウド同期は有効です. 設定の変更はバックグラウンドで Drive へ保存されます.</p>
      <button type="button" class="clear-cache-button" @click="disableDriveSync"><IconXMark />無効にする</button>
    </template>
    <template v-else>
      <p v-if="userStore.useDriveSync" class="hint">認証が切れています. 再度認証してください.</p>
      <button type="button" class="clear-cache-button" @click="startDriveAuth"><IconCloudArrowUp />{{ userStore.useDriveSync ? '再認証' : '有効化' }}</button>
    </template>
  </section>
</template>

<style lang="scss" scoped>
.hint {
  font-size: var(--text-size-xs);
}
.clear-cache-button {
  align-self: flex-start;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--border);
  border-radius: var(--border-radius);

  &:hover {
    background-color: var(--bg-2);
  }
}
</style>
