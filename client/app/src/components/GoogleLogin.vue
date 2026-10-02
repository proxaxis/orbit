<script setup>
  import { ref, onMounted } from 'vue';
  import { useAuthStore, BFF_BASE_URL } from '@/stores/auth.js';

  const authStore = useAuthStore();

  /**
   * Google のログインページにリダイレクト
   * @returns {void}
   */
  function handleLogin() {
    window.location.href = `${BFF_BASE_URL}/auth/login`;
  }
</script>
<template>
  <div class="google-login">
    <button
      v-if="!authStore.isAuthenticated"
      @click="handleLogin"
      class="google-login-button"
    >
      Login with Google
    </button>
  </div>
</template>
<style lang="scss" scoped>
</style>
