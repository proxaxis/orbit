<script setup>
/**
 * UserConfigView の写真共有欄。
 * 写真共有機能の有効化（OAuth 認証）・無効化と認証状態の表示を担う。
 */
import { onMounted } from 'vue';
import { useAuthStore, BFF_BASE_URL } from '@/stores/auth.js';
import { useUserStore } from '@/stores/user.js';
import { useAuth } from '@/composables/useAuth.js';
import IconImage from '@/components/icons/IconImage.vue';
import IconXMark from '@/components/icons/IconXMark.vue';

const authStore = useAuthStore();
const userStore = useUserStore();
const auth = useAuth();

onMounted(async () => {
  if (!authStore.isAuthenticated || !userStore.usePhotoSharing || authStore.isPhotoSharingAuthorized) return;
  userStore.setLoading(true, '認証状態を確認しています...');
  try {
    await auth.ensurePhotoToken();
  } finally {
    userStore.setLoading(false);
  }
});

/** 写真共有の有効化（Google OAuth 認証へリダイレクト） */
function startPhotoSharingAuth() {
  window.location.href = `${BFF_BASE_URL}/auth/photo-sharing`;
}

/** 写真共有を無効化し、保存済みの写真トークンを破棄する */
async function disablePhotoSharing() {
  const confirmed = await userStore.confirm({
    title: '写真共有を無効化',
    message: 'イベントへの写真共有機能を無効にします。作成済みのアルバムは削除されません。',
  });
  if (!confirmed) return;
  userStore.setUsePhotoSharing(false);
  auth.clearPhotoToken();
}
</script>

<template>
  <section class="config-section">
    <h2>写真共有</h2>
    <p class="hint">イベントに写真の共有アルバムを紐づけます. 有効化にはGoogleアカウントでの追加認証が必要です.</p>
    <p v-if="!authStore.isAuthenticated" class="hint">利用するには Google アカウントでログインしてください.</p>
    <p v-else-if="userStore.isLoading" class="hint">認証状態を確認しています...</p>
    <template v-else-if="userStore.usePhotoSharing && authStore.isPhotoSharingAuthorized">
      <p class="hint">写真共有は有効です. イベント詳細画面から写真を追加できます.</p>
      <button type="button" class="clear-cache-button" @click="disablePhotoSharing"><IconXMark />無効にする</button>
    </template>
    <template v-else>
      <p v-if="userStore.usePhotoSharing" class="hint">認証が切れています. 再度認証してください.</p>
      <button type="button" class="clear-cache-button" @click="startPhotoSharingAuth"><IconImage />{{ userStore.usePhotoSharing ? '再認証' : '有効化' }}</button>
    </template>
  </section>
</template>

<style lang="scss" scoped>
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
