<script setup>
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.js';
import { useCalendarStore } from '@/stores/calendar.js';
import { useAclRules } from '@/composables/useAclRules.js';
import { useShareLink } from '@/composables/useShareLink.js';
import { buildShareAcceptUrl } from '@/services/share-sync.js';
import MenuBar from '@/components/MenuBar.vue';
import CalendarRibbon from '@/components/CalendarRibbon.vue';
import IconXMark from '@/components/icons/IconXMark.vue';
import IconShareNodes from '@/components/icons/IconShareNodes.vue';
import AskLoginMessage from '@/components/AskLoginMessage.vue';
import SharingConfigViewAddForm from '@/components/items/SharingConfigViewAddForm.vue';
import SharingConfigViewRuleList from '@/components/items/SharingConfigViewRuleList.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const calendarStore = useCalendarStore();
const { loadRules } = useAclRules();
const { shareOrCopyLink } = useShareLink();

/** @type {ComputedRef<string>} クエリまたは先頭の書き込み可能カレンダーから決まる設定対象 ID */
const theCalendarId = computed(() => {
  const requestedId = typeof route.query.cid === 'string' ? route.query.cid : '';
  // cid 指定時は書き込み不可なら空にする。別カレンダーへのサイレント切替だと
  // そのカレンダーの ACL（所有者ルールを含む）を対象カレンダーのものと誤認させる
  if (requestedId) return calendarStore.listWritableCalendars.some((cal) => cal.id === requestedId) ? requestedId : '';
  return calendarStore.listWritableCalendars[0]?.id ?? '';
});
/** @type {ComputedRef<boolean>} cid で指定されたカレンダーの共有設定を変更できる権限がないか */
const requestedCalendarNotEditable = computed(() => {
  const requestedId = typeof route.query.cid === 'string' ? route.query.cid : '';
  return Boolean(requestedId) && !theCalendarId.value;
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

/** 対象カレンダーの登録用リンクを Web Share で送るか、クリップボードへコピーする */
async function shareLink() {
  const url = buildShareAcceptUrl(theCalendarId.value, { mode: 'list' });
  await shareOrCopyLink(url, `カレンダー「${calendarStore.getCalendarName(theCalendarId.value)}」が共有されました。リンクを開いて登録してください。`);
}
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
          <option v-for="cal in calendarStore.listWritableCalendars" :key="cal.id" :value="cal.id">{{ calendarStore.getCalendarName(cal.id) }}</option>
        </select>
        <small>設定対象のカレンダー:</small>
        <div class="calendar-ribbon-wrapper" v-if="theCalendar">
          <CalendarRibbon :cid="theCalendar.id" :key="theCalendar.id" />
        </div>
        <p v-else>共有設定を変更できるカレンダーがありません</p>
      </label>

      <p v-if="requestedCalendarNotEditable" class="empty-state">指定されたカレンダーは共有設定を変更できません（書き込み権限がありません）</p>
      <p v-else-if="!calendarStore.listWritableCalendars.length" class="empty-state">共有設定を変更できるカレンダーがありません</p>
      <template v-else-if="theCalendarId">
        <div class="share-link-row">
          <button type="button" @click="shareLink"><IconShareNodes />登録用リンクを共有</button>
          <small>リンクを開いた相手に登録確認が表示され、相手のカレンダーリストへ追加されます。リンク自体に権限は含まれないため、先に共有相手を登録してください。</small>
        </div>
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

.share-link-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-xxs);
  padding: var(--space-sm) 0;

  button {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    background-color: var(--bg-2);
    border-radius: var(--border-radius);
    font-size: var(--text-size-sm);

    &:hover {
      background-color: var(--bg-3);
    }
  }

  small {
    font-size: var(--text-size-xs);
    color: var(--text-light);
  }
}

.icon-x-mark-btn {
  background-color: var(--bg-1);
  &:hover {
    background-color: var(--bg-2);
  }
}
</style>
