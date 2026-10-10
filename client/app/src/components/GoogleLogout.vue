<script setup>
import { useAuthStore } from "@/stores/auth.js";
import { useAuth } from "@/composables/useAuth.js";
import { useUserStore } from "@/stores/user.js";
import { CACHE_KEYS, clearCache } from "@/composables/useCache.js";

const authStore = useAuthStore();
const auth = useAuth();
const userStore = useUserStore();

/**
 * ログアウト。設定だけを残し、イベント等のオフラインキャッシュを全て削除する
 * @returns {Promise<void>}
 */
async function handleLogout() {
  userStore.setLoading(true, "Logging out...");
  try {
    await auth.logout();
    // 設定以外のキャッシュをクリア（アクセストークンもここで消える）
    await clearCache([CACHE_KEYS.USER_SETTINGS]);
  } catch (err) {
    console.warn("Failed to clear cache on logout.", err);
  } finally {
    userStore.setLoading(false);
  }
}
</script>
<template>
  <div class="google-login">
    <button
      v-if="authStore.isAuthenticated"
      type="button"
      @click="handleLogout"
      class="google-login-button"
    >
      <slot>Logout</slot>
    </button>
  </div>
</template>
<style lang="scss" scoped></style>
