<script setup>
import { useAuthStore } from '@/stores/auth.js';
import { useUserStore } from '@/stores/user.js';

const authStore = useAuthStore();
const userStore = useUserStore();

/**
 * ログアウト
 * @returns {Promise<void>}
 */
async function handleLogout() {
  userStore.setLoading(true, 'Logging out...');
  try {
    await authStore.logout();
  } finally {
    userStore.setLoading(false);
  }
}
</script>
<template>
  <div class="google-login">
    <button v-if="authStore.isAuthenticated" type="button" @click="handleLogout" class="google-login-button"><slot>Logout</slot></button>
  </div>
</template>
<style lang="scss" scoped></style>
