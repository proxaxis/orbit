<script setup>
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.js';
import { useCalendarStore } from '@/stores/calendar.js';
import { useAclRules } from '@/composables/useAclRules.js';
import MenuBar from '@/components/MenuBar.vue';
import CalendarRibbon from '@/components/CalendarRibbon.vue';
import IconXMark from '@/components/icons/IconXMark.vue';
import AskLoginMessage from '@/components/AskLoginMessage.vue';
import SharingConfigViewAddForm from '@/components/items/SharingConfigViewAddForm.vue';
import SharingConfigViewRuleList from '@/components/items/SharingConfigViewRuleList.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const calendarStore = useCalendarStore();
const { loadRules } = useAclRules();

/** @type {ComputedRef<string>} クエリまたは先頭の書き込み可能カレンダーから決まる設定対象 ID */
const theCalendarId = computed(() => {
  const requestedId = typeof route.query.cid === 'string' ? route.query.cid : '';
  return calendarStore.listWritableCalendars.some((cal) => cal.id === requestedId) ? requestedId : (calendarStore.listWritableCalendars[0]?.id ?? '');
});
/** @type {ComputedRef<GoogleCalendarListEntry|undefined>} 設定対象のカレンダー */
const theCalendar = computed(() => calendarStore.listWritableCalendars.find((cal) => cal.id === theCalendarId.value));

/**
 * カレンダー選択の変更イベントを処理する
 * @param {Event} event カレンダー選択イベント
 * @returns {void}
 */
function onSelectCalendar(event) {
  const select = /** @type {HTMLSelectElement} */ (event.currentTarget ?? event.target);
  router.push({ query: { ...route.query, cid: select.value } });
}

watch([theCalendarId, () => authStore.token], () => loadRules(theCalendarId.value), { immediate: true });
</script>

<template>
  <div class="sharing-config-view">
    <MenuBar>
      <template #main>
        <h1 class="title">共有設定</h1>
      </template>
      <template #sub>
        <button class="icon-x-mark-btn" title="カレンダーに戻る" @click="router.push({ name: 'Home' })">
          <IconXMark />
        </button>
      </template>
      カレンダーを共有するユーザーを管理
    </MenuBar>

    <AskLoginMessage v-if="!authStore.isAuthenticated"> 共有設定を行うには Google アカウントでログインする必要があります </AskLoginMessage>

    <section v-if="authStore.isAuthenticated">
      <label class="calendar-select">
        <select :value="theCalendarId" :disabled="!calendarStore.listWritableCalendars.length" @change="onSelectCalendar($event)">
          <option v-for="cal in calendarStore.listWritableCalendars" :key="cal.id" :value="cal.id">{{ cal.summary }}</option>
        </select>
        <small>設定対象のカレンダー:</small>
        <div class="calendar-ribbon-wrapper" v-if="theCalendar">
          <CalendarRibbon :cid="theCalendar.id" :key="theCalendar.id" />
        </div>
        <p v-else>共有設定を変更できるカレンダーがありません</p>
      </label>

      <p v-if="!calendarStore.listWritableCalendars.length" class="empty-state">共有設定を変更できるカレンダーがありません</p>
      <template v-else>
        <SharingConfigViewAddForm :calendar-id="theCalendarId" />
        <SharingConfigViewRuleList :calendar-id="theCalendarId" />
      </template>
    </section>
  </div>
</template>

<style lang="scss" scoped>
section {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.calendar-select {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);

  .calendar-ribbon-wrapper {
    margin-left: var(--space-xs);
  }
}

.icon-x-mark-btn {
  background-color: var(--bg-1);
  &:hover {
    background-color: var(--bg-2);
  }
}
</style>
