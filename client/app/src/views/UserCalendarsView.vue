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
    <div class="heading">
      <p>Orbit カレンダー</p>
    </div>

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
</template>

<style lang="scss" scoped>
.user-calendars-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);

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
.heading {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  padding: var(--space-sm) 0;

  p {
    padding-left: var(--space-xs);
    margin: 0;
    font-size: 1.6rem;
    font-weight: bold;
  }
}
</style>
