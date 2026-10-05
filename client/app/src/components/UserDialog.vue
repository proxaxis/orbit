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
    <Transition name="app-user-dialog">
      <div class="backdrop" role="presentation" v-if="userStore.isUserDialogOpen" @click.self="userStore.closeUserDialog">
        <dialog open aria-modal="true" :aria-label="userStore.userDialogTitle">
          <header>
            <h2>{{ userStore.userDialogTitle }}</h2>
            <button type="button" aria-label="Close" aria-hidden="true" @click="userStore.closeUserDialog">
              <IconXMark />
            </button>
          </header>

          <main v-if="userStore.userDialogMessage" class="dialog-message">
            {{ userStore.userDialogMessage }}
          </main>

          <footer v-if="userStore.userDialogType === 'CONFIRM'" class="dialog-actions">
            <button data-app-button="secondary" type="button" class="cancel-button" @click="userStore.resolveConfirm(false)">NO</button>
            <button data-app-button="primary" type="button" class="confirm-button" @click="userStore.resolveConfirm(true)">YES</button>
          </footer>

          <footer v-else class="dialog-content">
            <GoogleLogout />
            <GoogleLogin />
          </footer>
        </dialog>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: grid;
  place-items: center;
  padding: var(--space-md);
  background-color: var(--overlay);
}

dialog {
  position: relative;
  margin: 0;
  width: min(calc(100% - 2px), 32rem);
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--border-radius);
  background-color: var(--bg-1);
  box-shadow: 0 0.75rem 2rem var(--shadow);
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-sm) var(--space-md);
  border-bottom: 1px solid var(--border);

  h2 {
    font-size: var(--text-size-lg);
  }

  button {
    background: var(--bg-1);

    &:hover {
      background-color: var(--bg-2);
    }
  }
}

.dialog-message,
.dialog-content {
  padding: var(--space-lg) var(--space-md);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
}

.dialog-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.app-user-dialog-enter-active,
.app-user-dialog-leave-active {
  transition: opacity 0.15s ease;

  .app-user-dialog {
    transition: transform 0.15s ease;
  }
}

.app-user-dialog-enter-from,
.app-user-dialog-leave-to {
  opacity: 0;

  .app-user-dialog {
    transform: translateY(-0.5rem);
  }
}
</style>
