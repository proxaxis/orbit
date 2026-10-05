<script setup>
import { useAuthStore, BFF_BASE_URL } from '@/stores/auth.js';
import { useUserStore } from '@/stores/user.js';

const authStore = useAuthStore();
const userStore = useUserStore();

/**
 * ログアウト
 * @returns {Promise<void>}
 * @throws {Error} ログアウトに失敗した場合
 */
async function handleLogout() {
  userStore.setLoading(true, 'Logging out...');
  try {
    await fetch(`${BFF_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
    authStore.token.value = null;
    authStore.isAuthenticated.value = false;
  } catch (err) {
    userStore.setError(true, err instanceof Error ? err : new Error(String(err)));
  } finally {
    userStore.setLoading(false);
  }
}
</script>
<template>
  <div class="google-login">
    <button v-if="authStore.isAuthenticated" @click="handleLogout" class="google-login-button">Logout</button>
  </div>
</template>
<style lang="scss" scoped></style>
