<script setup>
import { onMounted, onUnmounted, watch } from 'vue';
import { useAuthStore } from '@/stores/auth.js';
import { useUserStore } from '@/stores/user.js';
import UserDialog from '@/components/UserDialog.vue';
import PwaInstallPrompt from '@/components/PwaInstallPrompt.vue';

const authStore = useAuthStore();
const userStore = useUserStore();

/** @type {MediaQueryList|null} @description システムテーマの変更を監視するためのオブジェクト */
let mQueryList = null;

/** @description ウィンドウリサイズ時のイベントハンドラ */
function handleWindowResize() {
  userStore.winInnerWidth = window.innerWidth;
}

/** @param {MediaQueryListEvent} evt メディアクエリの変更イベント @description システムテーマ変更時のイベントハンドラ */
function handleSystemThemeChange(evt) {
  userStore.isSystemPrefersDark = evt.matches;
  if (userStore.userSelectedTheme === 'SYSTEM') userStore.applyTheme('SYSTEM');
}

watch(() => userStore.hasError, (to) => {
  if (to) {
    console.error(userStore.error);
  }
});

watch(() => authStore.isAuthenticated, (isAuthenticated) => {
  if (!isAuthenticated) {
    userStore.openUserDialog({
      title: 'Login Required',
      message: 'Login with your Google account to synchronize your calendar.',
    });
  }
});

onMounted(async () => {
  if (!userStore.checkUserEnvironment()) return;

  // ユーザ設定の適用
  userStore.applyTheme(userStore.userSelectedTheme);
  window.addEventListener('resize', handleWindowResize);
  mQueryList = window.matchMedia('(prefers-color-scheme: dark)');
  mQueryList.addEventListener('change', handleSystemThemeChange);

  // Google ログイン状態の確認とトークンの取得
  const token = await authStore.fetchToken();
  if (!token && !authStore.isAuthenticated) {
    userStore.openUserDialog({
      title: 'Login Required',
      message: 'Login with your Google account to synchronize your calendar.',
    });
  }
});

onUnmounted(() => {
  if (!userStore.checkUserEnvironment()) return;
  window.removeEventListener('resize', handleWindowResize);
  if (mQueryList) mQueryList.removeEventListener('change', handleSystemThemeChange);
});
</script>

<template>
  <router-view />
  <UserDialog />
  <PwaInstallPrompt />
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
  --border-radius: 6px;
}

[data-theme='dark'] {
  @include var.spread-themes(dark);
}

* {
  margin: 0;
  padding: 0;
  box-sizing: content-box;
  zoom: 1;
}

html {
  font-family: 'Noto Sans JP, Kosugi Maru, sans-serif';
}

body {
  background-color: var(--bg-0);
  color: var(--text);
  line-height: var(--line-height);
}

li {
  list-style: none;
}

button {

  &,
  &:hover,
  &:active {
    border: none;
    background: none;
    cursor: pointer;
    font-size: var(--text-size-sm);
    display: flex;
    align-items: center;
    color: var(--text);
  }
}

input,
select,
textarea {
  background-color: var(--bg-3);
  color: var(--text);
  outline: 0;
  border-radius: var(--border-radius);
  border: 1px solid var(--border);
  padding: var(--space-xs) var(--space-xxs);
  font-size: var(--text-size-sm);

  &:focus {
    border-color: var(--primary);
    outline: none;
  }
}

select {
  padding: var(--space-xs) var(--space-xxs);
}

.icons {
  fill: var(--text);

  &.danger {
    fill: var(--danger);
  }
}

hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: var(--space-sm) 0;
}

details {
  summary {
    cursor: pointer;
    user-select: none;
    margin-bottom: 0.9rem;

    &:hover {
      color: var(--primary);
    }
  }

  &[open] {
    summary {
      color: var(--primary);
    }
  }
}

button[data-app-button="primary"] {
  background-color: var(--primary);
  color: var(--bg-0);
  border-radius: var(--border-radius);
  padding: var(--space-xs) var(--space-sm);
  font-size: var(--text-size-sm);

  &:hover {
    background-color: #0000ffa8;
  }

  &:disabled {
    background-color: var(--border);
    cursor: not-allowed;
  }
}
</style>
