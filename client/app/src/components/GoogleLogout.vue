<script setup>
import { useAuthStore } from '@/stores/auth.js';
import { useAuth } from '@/composables/useAuth.js';
import { useUserStore } from '@/stores/user.js';

const authStore = useAuthStore();
const auth = useAuth();
const userStore = useUserStore();

/**
 * ログアウト
 * @returns {Promise<void>}
 */
async function handleLogout() {
  userStore.setLoading(true, 'Logging out...');
  try {
    await auth.logout();
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
