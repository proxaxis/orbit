<script setup>
import { useAuthStore, BFF_BASE_URL } from '@/stores/auth.js';
import IconGoogle from '@/components/icons/IconGoogle.vue';

const authStore = useAuthStore();

/** Google ログインへリダイレクトする */
function handleLogin() {
  window.location.href = `${BFF_BASE_URL}/auth/login`;
}
</script>

<template>
  <button class="google-login" v-if="!authStore.isAuthenticated" type="button" @click="handleLogin">
    <IconGoogle />
    <slot>Googleでログイン</slot>
  </button>
</template>

<style lang="scss" scoped>
button {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-xs) var(--space-sm);
  font-size: var(--text-size-lg);
  background-color: var(--bg-2);
  border-radius: var(--border-radius);
  width: calc(100% - var(--space-sm) * 2);

  &:hover {
    background-color: var(--bg-3);
  }
}
</style>
