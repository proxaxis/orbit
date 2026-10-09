<script setup>
import { onMounted, onUnmounted, watch } from 'vue';
import { useAuthStore } from '@/stores/auth.js';
import { useUserStore } from '@/stores/user.js';
import UserDialog from '@/components/UserDialog.vue';
import ToastMessage from '@/components/ToastMessage.vue';
import { useAppBootstrap } from '@/composables/useAppBootstrap.js';

const authStore = useAuthStore();
const userStore = useUserStore();
const bootstrap = useAppBootstrap();

watch(
  () => userStore.hasError,
  (to) => {
    if (to) {
      console.error(userStore.error);
    }
  },
);

watch(
  () => authStore.isAuthenticated,
  (isAuthenticated) => {
    if (!isAuthenticated) {
      userStore.openUserDialog({
        title: 'Login Required',
        message: 'Login with your Google account to synchronize your calendar.',
      });
    }
  },
);

onMounted(bootstrap.start);
onUnmounted(bootstrap.stop);
</script>

<template>
  <router-view />
  <UserDialog />
  <ToastMessage />
</template>

<style lang="scss">
@use 'sass:color';
@use '@/styles/vars.scss' as var;

:root {
  color-scheme: light dark;
  @include var.spread-themes(light);
  @include var.spread-sizes();
  --nav-min-width: calc(260px - 2rem);
  --sub-min-width: calc(260px - 2rem);
  --border-radius: 8px;
}

[data-theme='dark'] {
  @include var.spread-themes(dark);
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  zoom: 1;
  text-autospace: normal;
}

html {
  font-family: var(--ui-font-family);
  scroll-behavior: smooth;
  user-select: none;
  scrollbar-width: thin;
  scrollbar-color: var(--bg-4) transparent; // つまみ色と背景色
}

::-webkit-scrollbar {
  width: 6px; // 縦スクロールバーの太さ
  height: 6px; // 横スクロールバーの太さ
}

::-webkit-scrollbar-track {
  background: transparent; // 背景を透明にしてコンテンツと一体化
}

::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.25); // 半透明のグレー
  border-radius: 9999px; // スマホ風の完全な角丸
}

::-webkit-scrollbar-thumb:hover {
  background-color: rgba(0, 0, 0, 0.5); // ホバー時に少し濃くする
}

body {
  background-color: var(--bg-1);
  color: var(--text);
  line-height: var(--line-height);
}

li {
  list-style: none;
}

button {
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  gap: var(--space-sm);
  padding: var(--space-sm);
  font-size: var(--text-size-md);
  border-radius: var(--border-radius);
  transition: background-color 0.2s ease-in-out;
  color: var(--text);
  border: none;
  outline: none;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  background-color: var(--bg-3);

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &[data-app-button='primary'] {
    background-color: var(--primary);
    min-width: 6rem;

    .icons {
      fill: var(--text);
    }

    &:hover {
      background-color: var(--primary-light);
    }
  }

  &[data-app-button='secondary'] {
    color: var(--primary-light);
    background-color: transparent;
    min-width: 6rem;
    border: 1px solid var(--primary-light);

    .icons {
      fill: var(--primary-light);
    }

    &:hover {
      color: var(--primary);
      border: 1px solid var(--primary);
      background-color: var(--bg-2);

      .icons {
        fill: var(--primary);
      }
    }
  }
}

input,
textarea {
  background-color: var(--bg-2);
  color: var(--text);
  outline: 0;
  border-radius: var(--border-radius);
  border: 1px solid var(--border);
  padding: var(--space-sm) var(--space-xs);
  font-size: var(--text-size-md);

  &:focus {
    border-color: var(--accent);
    outline: none;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

select {
  background-color: var(--bg-2);
  color: var(--text);
  outline: 0;
  border-radius: var(--border-radius);
  border: 1px solid var(--border);
  padding: var(--space-sm) var(--space-xs);
  font-size: var(--text-size-md);
  cursor: pointer;

  &:focus {
    border-color: var(--accent);
    outline: none;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

input[type='checkbox'] {
  accent-color: var(--primary);
  transform: scale(1.5);
  cursor: pointer;
  margin-left: 4px;
}

input[readonly],
textarea[readonly] {
  opacity: 0.7;
  cursor: not-allowed;
}

.icons {
  fill: var(--text);
}
</style>
