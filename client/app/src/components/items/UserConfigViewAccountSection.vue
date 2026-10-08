<script setup>
/**
 * UserConfigView のアカウント欄。
 * Google アカウントのログイン状態表示・ログアウト・アカウント切り替えを担う。
 */
import { useAuthStore, BFF_BASE_URL } from '@/stores/auth.js';
import { useUserStore } from '@/stores/user.js';
import { useAuth } from '@/composables/useAuth.js';
import GoogleLogin from '@/components/GoogleLogin.vue';
import IconArrowsRotate from '@/components/icons/IconArrowsRotate.vue';
import IconArrowRightFromBracket from '@/components/icons/IconArrowRightFromBracket.vue';

const authStore = useAuthStore();
const userStore = useUserStore();
const auth = useAuth();

/** Google アカウントからログアウトする */
async function handleLogout() {
  const confirmed = await userStore.confirm({
    title: 'ログアウト',
    message: 'Google アカウントからログアウトします。カレンダーの同期は停止します。続行しますか？',
  });
  if (!confirmed) return;
  userStore.setLoading(true, 'Logging out...');
  try {
    await auth.logout();
  } finally {
    userStore.setLoading(false);
  }
}

/** ログアウト後に Google 認証へリダイレクトして、別アカウントでログインし直す */
async function switchAccount() {
  const confirmed = await userStore.confirm({
    title: 'アカウントを変更',
    message: 'ログアウトして、別の Google アカウントでログインし直します。続行しますか？',
  });
  if (!confirmed) return;
  userStore.setLoading(true, 'Switching account...');
  try {
    await auth.logout();
  } finally {
    userStore.setLoading(false);
  }
  // BFF が prompt=select_account に対応していれば Google のアカウント選択画面が表示される
  window.location.href = `${BFF_BASE_URL}/auth/login?prompt=select_account`;
}
</script>

<template>
  <section class="config-section">
    <h2>アカウント</h2>
    <template v-if="authStore.isAuthenticated">
      <p class="hint">Google アカウントでログイン中です.</p>
      <div class="account-actions">
        <button type="button" class="clear-cache-button" @click="switchAccount"><IconArrowsRotate />アカウントを変更</button>
        <button type="button" class="clear-cache-button" @click="handleLogout"><IconArrowRightFromBracket />ログアウト</button>
      </div>
    </template>
    <template v-else>
      <p class="hint">カレンダーの同期や写真共有を利用するには、Google アカウントでログインしてください.</p>
      <GoogleLogin />
    </template>
  </section>
</template>

<style lang="scss" scoped>
.account-actions {
  display: flex;
  gap: var(--space-xs);
  flex-wrap: wrap;
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
