<script setup>
import { onMounted, onUnmounted, watch } from 'vue';
import { useAuthStore } from '@/stores/auth.js';
import { useCalendarStore } from '@/stores/calendar.js';
import { useUserStore } from '@/stores/user.js';
import UserDialog from '@/components/UserDialog.vue';

const authStore = useAuthStore();
const calendarStore = useCalendarStore();
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

onMounted(async () => {
  if (!userStore.checkUserEnvironment()) return;

  await userStore.settingsReady;

  // ユーザ設定の適用
  userStore.applyTheme(userStore.userSelectedTheme);
  userStore.applyThemeColor();
  userStore.applyFonts();
  userStore.applyTextSizes();
  window.addEventListener('resize', handleWindowResize);
  mQueryList = window.matchMedia('(prefers-color-scheme: dark)');
  mQueryList.addEventListener('change', handleSystemThemeChange);

  // Google ログイン状態の確認とトークンの取得
  const token = await authStore.fetchToken();
  if (token) await calendarStore.loadCalendars();
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
  box-sizing: content-box;
  zoom: 1;
  text-autospace: normal;
}

html {
  font-family: var(--ui-font-family);
  scroll-behavior: smooth;
  user-select: none;
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
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-sm);
  font-size: var(--text-size-lg);
  border-radius: var(--border-radius);
  transition: background-color 0.2s ease-in-out;
  color: var(--text);
  border: none;
  outline: none;
  -webkit-tap-highlight-color: transparent;
  user-select: none;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &[data-app-button='primary'] {
    background-color: var(--primary);
    min-width: 6rem;

    &:hover {
      background-color: var(--primary-light);
    }
  }

  &[data-app-button='secondary'] {
    color: var(--primary-light);
    background-color: transparent;
    min-width: 6rem;
    border: 1px solid var(--primary-light);
    &:hover {
      color: var(--primary);
      border: 1px solid var(--primary);
    }
  }
}

input,
select,
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
}

input[readonly],
textarea[readonly] {
  opacity: 0.7;
  cursor: not-allowed;
}

select {
  padding: var(--space-xs) var(--space-xxs);
}

.icons {
  fill: var(--text);
}

details {
  * {
    font-size: var(--text-size-sm);
  }

  summary {
    cursor: pointer;
    user-select: none;
    font-size: var(--text-size-md);
    text-decoration: underline;
  }
}
</style>
