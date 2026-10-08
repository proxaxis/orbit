<script setup>
import { useAuthStore } from '@/stores/auth.js';
import { useUserStore } from '@/stores/user.js';
import MiniCalendar from '@/components/MiniCalendar.vue';
import AskLoginMessage from '@/components/AskLoginMessage.vue';
import GoogleLogin from '@/components/GoogleLogin.vue';
import UserCalendarsViewCalendarList from '@/components/items/UserCalendarsViewCalendarList.vue';
import UserCalendarsViewSessionList from '@/components/items/UserCalendarsViewSessionList.vue';

const authStore = useAuthStore();
const userStore = useUserStore();
</script>

<template>
  <div class="user-calendars-view">
    <div>
      <MiniCalendar v-if="userStore.useMiniCalendar" />

      <AskLoginMessage v-if="!authStore.isAuthenticated">
        カレンダーを表示するには Google アカウントでログインする必要があります
        <div class="google-login-wrapper">
          <GoogleLogin />
        </div>
      </AskLoginMessage>

      <UserCalendarsViewCalendarList />
      <UserCalendarsViewSessionList />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.user-calendars-view {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--space-sm);
  width: 100%;
  height: 100%;

  > div:nth-child(1) {
    flex-grow: 1;
    min-height: 0;
    overflow-y: auto;
  }

  > div:nth-child(2) {
    border-top: 1px solid var(--border);
    padding-top: var(--space-sm);
  }
}

.google-login-wrapper {
  width: calc(100% - var(--space-sm) * 2);
  margin: var(--space-sm) auto;
}
</style>
