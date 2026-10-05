<script setup>
import { useAuthStore, BFF_BASE_URL } from '@/stores/auth.js';
import IconGoogle from '@/components/icons/IconGoogle.vue';

const authStore = useAuthStore();

function handleLogin() {
  window.location.href = `${BFF_BASE_URL}/auth/login`;
}
</script>

<template>
  <button class="google-login" v-if="!authStore.isAuthenticated" @click="handleLogin">
    <icon-google />
    <slot>Login with Google</slot>
  </button>
</template>

<style lang="scss" scoped>
.google-login {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-md);
  font-size: var(--text-size-md);
  background-color: var(--bg-2);
  border: none;
  border-radius: var(--border-radius);
  cursor: pointer;
  transition: background-color 0.2s ease-in-out;

  &:hover {
    background-color: var(--bg-3);
  }
}
</style>
