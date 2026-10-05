<script setup>
import { onMounted, onUnmounted } from 'vue';
import { useAuthStore } from '@/stores/auth.js';
import { useUserStore } from '@/stores/user.js';
import GoogleLogin from '@/components/GoogleLogin.vue';
import GoogleLogout from '@/components/GoogleLogout.vue';
import IconXMark from '@/components/icons/IconXMark.vue';

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
      <div v-if="userStore.isUserDialogOpen" class="user-dialog-backdrop" role="presentation" @click.self="userStore.closeUserDialog">
        <section class="user-dialog" role="dialog" aria-modal="true" :aria-label="userStore.userDialogTitle">
          <header class="user-dialog-header">
            <h2>{{ userStore.userDialogTitle }}</h2>
            <button type="button" class="close-button" aria-label="Close" @click="userStore.closeUserDialog">
              <span aria-hidden="true">
                <IconXMark />
              </span>
            </button>
          </header>

          <p v-if="userStore.userDialogMessage" class="user-dialog-message">
            {{ userStore.userDialogMessage }}
          </p>

          <div v-if="userStore.userDialogType === 'CONFIRM'" class="user-dialog-actions">
            <button type="button" class="confirm-button" @click="userStore.resolveConfirm(true)">YES</button>
            <button type="button" class="cancel-button" @click="userStore.resolveConfirm(false)">NO</button>
          </div>

          <div v-else class="user-dialog-content">
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
  background-color: var(--overlay);
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

.user-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
}

.confirm-button,
.cancel-button {
  min-width: 4rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--border-radius);
}

.confirm-button {
  border-color: var(--primary);
  background-color: var(--primary);
  color: var(--bg-1);
}

.cancel-button:hover {
  background-color: var(--bg-2);
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
