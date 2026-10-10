<script setup>
import { computed } from "vue";
import { useAuthStore } from "@/stores/auth.js";
import { useUserStore } from "@/stores/user.js";
import MiniCalendar from "@/components/MiniCalendar.vue";
import AskLoginMessage from "@/components/AskLoginMessage.vue";
import GoogleLogin from "@/components/GoogleLogin.vue";
import IconCaretLeft from "@/components/icons/IconCaretLeft.vue";
import IconCaretRight from "@/components/icons/IconCaretRight.vue";
import UserCalendarsViewCalendarList from "@/components/items/UserCalendarsViewCalendarList.vue";
import UserCalendarsViewSessionList from "@/components/items/UserCalendarsViewSessionList.vue";

const authStore = useAuthStore();
const userStore = useUserStore();

/** @type {ComputedRef<boolean>} デスクトップ表示で Nav ペインが細幅に畳まれているか */
const isNavCollapsed = computed(
  () => userStore.isDesktop && userStore.navPaneCollapsed,
);
</script>

<template>
  <div class="user-calendars-view" :class="{ 'is-collapsed': isNavCollapsed }">
    <div class="heading">
      <template v-if="!isNavCollapsed">
        <p>Orbit カレンダー</p>
        <button
          v-if="userStore.isDesktop"
          type="button"
          class="nav-collapse-button"
          title="Nav ペインを畳む"
          aria-label="Nav ペインを畳む"
          @click="userStore.setNavPaneCollapsed(true)"
        >
          <IconCaretLeft size="1rem" />
        </button>
      </template>
      <button
        v-else
        type="button"
        class="nav-collapse-button"
        title="Nav ペインを展開する"
        aria-label="Nav ペインを展開する"
        @click="userStore.setNavPaneCollapsed(false)"
      >
        <IconCaretRight size="1rem" />
      </button>
    </div>

    <template v-if="!isNavCollapsed">
      <MiniCalendar v-if="userStore.useMiniCalendar" />

      <AskLoginMessage v-if="!authStore.isAuthenticated">
        カレンダーを表示するには Google アカウントでログインする必要があります
        <div class="google-login-wrapper">
          <GoogleLogin />
        </div>
      </AskLoginMessage>

      <UserCalendarsViewCalendarList />
      <UserCalendarsViewSessionList />
    </template>
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
  justify-content: space-between;
  align-items: center;
  padding: var(--space-sm) 0;

  p {
    padding-left: var(--space-xs);
    margin: 0;
    font-size: 1.6rem;
    font-weight: bold;
  }
}

.nav-collapse-button {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-xxs);
  border-radius: var(--border-radius);

  &:hover {
    background-color: var(--bg-2);
  }
}

.user-calendars-view.is-collapsed .heading {
  justify-content: center;
}
</style>
