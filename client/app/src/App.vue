<script setup>
import { onMounted, onUnmounted, watch } from 'vue';
import { useAuthStore } from '@/stores/auth.js';
import { useUserStore } from '@/stores/user.js';
import UserDialog from '@/components/UserDialog.vue';

const authStore = useAuthStore();
const userStore = useUserStore();

/** @type {MediaQueryList|null} @description システムテーマの変更を監視するためのオブジェクト */
let mQueryList = null;

/**
 * ウィンドウリサイズ時のイベントハンドラ
 * @returns {void}
 */
const handleWindowResize = () => {
  userStore.winInnerWidth = window.innerWidth;
};

/**
 * システムテーマ変更時のイベントハンドラ
 * @param {MediaQueryListEvent} evt イベントオブジェクト
 * @returns {void}
 */
const handleSystemThemeChange = (evt) => {
  userStore.isSystemPrefersDark = evt.matches;
  if (String(userStore.theme) === 'SYSTEM') userStore.applyTheme('SYSTEM'); // SYSTEM の場合は再適用して DOM を更新
};

watch(() => userStore.hasError, (to) => {
  if (to) {
    console.error(userStore.error);
  }
});

watch(() => authStore.isAuthenticated, (isAuthenticated) => {
  if (!isAuthenticated) {
    userStore.openUserDialog({
      title: 'ログインしてください',
      message: 'カレンダーを同期するには、Google アカウントでログインしてください。',
    });
  }
});

onMounted(async () => {
  if (!userStore.checkUserEnvironment()) return;

  // ユーザ設定の適用
  userStore.applyTheme(userStore.theme);
  window.addEventListener('resize', handleWindowResize);
  mQueryList = window.matchMedia('(prefers-color-scheme: dark)');
  mQueryList.addEventListener('change', handleSystemThemeChange);

  // Google ログイン状態の確認とトークンの取得
  const token = await authStore.fetchToken();
  if (!token && !authStore.isAuthenticated) {
    userStore.openUserDialog({
      title: 'ログインしてください',
      message: 'カレンダーを同期するには、Google アカウントでログインしてください。',
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
</template>

<style lang="scss">
@use 'sass:color';
@use '@/styles/vars.scss' as var;

:root {
  color-scheme: light dark;
  @include var.spread-vars(light);
  --nav-min-width: calc(260px - 2rem);
  --sub-min-width: calc(260px - 2rem);
  --border-radius: 6px;
}

[data-theme='dark'] {
  @include var.spread-vars(dark);
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
    font-size: 1.2rem;
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
  padding: 0.4rem 0.6rem;
  font-size: 1rem;

  &:focus {
    border-color: var(--primary);
    outline: none;
  }
}

select {
  padding: 0.4rem 0.3rem;
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
  margin: 1rem 0;
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

.text-center {
  text-align: center;
}
</style>
