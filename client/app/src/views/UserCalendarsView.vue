<script setup>
import { computed } from 'vue';
import { useAuthStore } from '@/stores/auth.js';
import { useUserStore } from '@/stores/user.js';
import MiniCalendar from '@/components/MiniCalendar.vue';
import AskLoginMessage from '@/components/AskLoginMessage.vue';
import GoogleLogin from '@/components/GoogleLogin.vue';
import IconCaretLeft from '@/components/icons/IconCaretLeft.vue';
import IconCaretRight from '@/components/icons/IconCaretRight.vue';
import UserCalendarsViewCalendarList from '@/components/items/UserCalendarsViewCalendarList.vue';
import UserCalendarsViewSessionList from '@/components/items/UserCalendarsViewSessionList.vue';
import IconLeftToBracket from '@/components/icons/IconLeftToBracket.vue';
import IconRightFromBracket from '@/components/icons/IconRightFromBracket.vue';

const authStore = useAuthStore();
const userStore = useUserStore();

/** @type {ComputedRef<boolean>} デスクトップ表示で Nav ペインが細幅に畳まれているか */
const isNavCollapsed = computed(() => userStore.isDesktop && userStore.navPaneCollapsed);
</script>

<template>
  <div class="user-calendars-view" :class="{ 'is-collapsed': isNavCollapsed }">
    <section>
      <div class="heading">
        <h1 v-if="!isNavCollapsed">Orbit カレンダー</h1>
        <button v-if="!isNavCollapsed && userStore.isDesktop" type="button" class="nav-collapse-button" title="ナビゲーションペインを畳む" aria-label="ナビゲーションペインを畳む"
          @click="userStore.setNavPaneCollapsed(true)">
          <IconLeftToBracket size="1rem" />
        </button>
        <button v-if="isNavCollapsed" type="button" class="nav-collapse-button" title="ナビゲーションペインを展開する" aria-label="ナビゲーションペインを展開する"
          @click="userStore.setNavPaneCollapsed(false)">
          <IconRightFromBracket size="1rem" />
        </button>
      </div>

      <MiniCalendar v-if="!isNavCollapsed && userStore.useMiniCalendar" />
      <UserCalendarsViewCalendarList v-if="!isNavCollapsed" />
      <UserCalendarsViewSessionList v-if="!isNavCollapsed" />
    </section>
    <section class="login-message" v-if="!isNavCollapsed && !authStore.isAuthenticated">
      <p>カレンダーを表示するにはGoogleアカウントでログインする必要があります</p>
      <GoogleLogin />
    </section>
  </div>
</template>

<style lang="scss" scoped>
.user-calendars-view {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
  gap: var(--space-sm);
}

section {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);

  &:first-child {
    flex-grow: 1;
    min-height: 0;
    overflow-y: auto;
  }
}

.heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-sm) 0;

  h1 {
    margin: 0;
    font-size: 1.4rem;
    font-weight: bold;
  }
}

.nav-collapse-button {
  background-color: var(--bg-1);

  &:hover {
    background-color: var(--bg-2);
  }
}

.user-calendars-view.is-collapsed .heading {
  justify-content: center;
}

.login-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
  border-top: 1px solid var(--border);
  padding-top: var(--space-sm);
}
</style>
