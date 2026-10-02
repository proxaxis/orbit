<script setup>
import { onMounted, onUnmounted } from 'vue';
import { useAuthStore } from '@/stores/auth.js';
import { useUserStore } from '@/stores/user.js';
import GoogleLogin from '@/components/GoogleLogin.vue';
import GoogleLogout from '@/components/GoogleLogout.vue';

const authStore = useAuthStore();
const userStore = useUserStore();

/** @type {(event: KeyboardEvent) => void} */
const handleKeydown = (event) => {
  if (event.key === 'Escape' && userStore.isUserDialogOpen) userStore.closeUserDialog();
};

onMounted(() => window.addEventListener('keydown', handleKeydown));
onUnmounted(() => window.removeEventListener('keydown', handleKeydown));
</script>

<template>
  <Teleport to="body">
    <Transition name="user-dialog">
      <div v-if="userStore.isUserDialogOpen" class="user-dialog-backdrop" role="presentation"
        @click.self="userStore.closeUserDialog">
        <section class="user-dialog" role="dialog" aria-modal="true" :aria-label="userStore.userDialogTitle">
          <header class="user-dialog-header">
            <h2>{{ userStore.userDialogTitle }}</h2>
            <button type="button" class="close-button" aria-label="閉じる" @click="userStore.closeUserDialog">
              <span aria-hidden="true">×</span>
            </button>
          </header>

          <p v-if="userStore.userDialogMessage" class="user-dialog-message">
            {{ userStore.userDialogMessage }}
          </p>

          <div class="user-dialog-content">
            <p v-if="authStore.isAuthenticated">Google アカウントでログインしています。</p>
            <p v-else>Google アカウントでログインすると、カレンダーを同期できます。</p>
            <GoogleLogout />
            <GoogleLogin />
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.user-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: grid;
  place-items: center;
  padding: 1rem;
  background-color: rgb(0 0 0 / 55%);
}

.user-dialog {
  width: min(100%, 28rem);
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--border-radius);
  background-color: var(--bg-1);
  box-shadow: 0 0.75rem 2rem var(--shadow);
}

.user-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border);

  h2 {
    font-size: 1.2rem;
  }
}

.close-button {
  width: 2rem;
  height: 2rem;
  justify-content: center;
  border-radius: 50%;
  font-size: 1.6rem;

  &:hover {
    background-color: var(--bg-2);
  }
}

.user-dialog-message,
.user-dialog-content {
  padding: 1rem 1.25rem;
}

.user-dialog-message {
  padding-bottom: 0;
}

.user-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;

  :deep(.google-login-button) {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--primary);
    border-radius: var(--border-radius);
  }
}

.user-dialog-enter-active,
.user-dialog-leave-active {
  transition: opacity 0.15s ease;

  .user-dialog {
    transition: transform 0.15s ease;
  }
}

.user-dialog-enter-from,
.user-dialog-leave-to {
  opacity: 0;

  .user-dialog {
    transform: translateY(-0.5rem);
  }
}
</style>
