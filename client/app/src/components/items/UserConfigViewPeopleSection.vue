<script setup>
/**
 * UserConfigView の連絡先連携欄。
 * People API 連携の有効化（OAuth 認証）・無効化と認証状態の表示を担う。
 * 有効にすると招待先入力やセッションカレンダー追加で連絡先の候補が使える。
 */
import { onMounted } from 'vue';
import { useAuthStore, BFF_BASE_URL } from '@/stores/auth.js';
import { useUserStore } from '@/stores/user.js';
import { useAuth } from '@/composables/useAuth.js';
import IconUserGroup from '@/components/icons/IconUserGroup.vue';
import IconXMark from '@/components/icons/IconXMark.vue';

const authStore = useAuthStore();
const userStore = useUserStore();
const auth = useAuth();

onMounted(async () => {
  if (!authStore.isAuthenticated || !userStore.usePeopleApi || authStore.isPeopleApiAuthorized) return;
  userStore.setLoading(true, '認証状態を確認しています...');
  try {
    await auth.ensurePeopleToken();
  } finally {
    userStore.setLoading(false);
  }
});

/** 連絡先連携の有効化（Google OAuth 認証へリダイレクト） */
function startPeopleAuth() {
  window.location.href = `${BFF_BASE_URL}/auth/people`;
}

/** 連絡先連携を無効化し、保存済みの People トークンを破棄する */
async function disablePeopleApi() {
  const confirmed = await userStore.confirm({
    title: '連絡先連携を無効化',
    message: '招待先入力やカレンダー検索での連絡先候補の表示を無効にします。',
  });
  if (!confirmed) return;
  userStore.setUsePeopleApi(false);
  auth.clearPeopleToken();
}
</script>

<template>
  <section class="config-section">
    <p class="hint">連絡先を検索して招待先や共有相手の候補を表示します. 有効化にはGoogleアカウントでの追加認証が必要です.</p>
    <p v-if="!authStore.isAuthenticated" class="hint">利用するには Google アカウントでログインしてください.</p>
    <p v-else-if="userStore.isLoading" class="hint">認証状態を確認しています...</p>
    <template v-else-if="userStore.usePeopleApi && authStore.isPeopleApiAuthorized">
      <p class="hint">連絡先連携は有効です. 入力欄で連絡先の候補が表示されます.</p>
      <button type="button" class="clear-cache-button" @click="disablePeopleApi"><IconXMark />無効にする</button>
    </template>
    <template v-else>
      <p v-if="userStore.usePeopleApi" class="hint">認証が切れています. 再度認証してください.</p>
      <button type="button" class="clear-cache-button" @click="startPeopleAuth"><IconUserGroup />{{ userStore.usePeopleApi ? '再認証' : '有効化' }}</button>
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
