<script setup>
import { useUserStore } from '@/stores/user.js';
const userStore = useUserStore();
</script>
<template>
  <div class="ask-login-message">
    <h3 v-if="userStore.isOffline">現在オフラインです:</h3>
    <h3 v-else>ログインが必要です:</h3>
    <p>
      <slot></slot>
    </p>
  </div>
</template>
<style lang="scss" scoped>
h3 {
  font-size: var(--text-size-lg);
  font-weight: bold;
  color: var(--danger);
}
</style>
