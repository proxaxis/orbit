<script setup>
/**
 * イベント検索画面。
 * Google Calendar API（events.list の q パラメータ）で全カレンダーを横断検索する。
 */
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '@/stores/user.js';
import { useEvents } from '@/composables/useEvents.js';
import { useEventActions } from '@/composables/useEventActions.js';
import MenuBar from '@/components/MenuBar.vue';
import DateEventsViewEventCard from '@/components/items/DateEventsViewEventCard.vue';
import IconXMark from '@/components/icons/IconXMark.vue';
import IconMagnifyingGlass from '@/components/icons/IconMagnifyingGlass.vue';

const router = useRouter();
const userStore = useUserStore();
const eventsService = useEvents();
const eventActions = useEventActions();

/** @type {Ref<string>} 検索キーワード */
const searchQuery = ref('');
/** @type {Ref<HandyCalendarEvent[]|null>} 検索結果（未検索は null） */
const searchResults = ref(null);
/** @type {Ref<boolean>} 検索実行中かどうか */
const isSearching = ref(false);
/** @type {number} 検索の世代（古い検索結果の上書き防止） */
let searchGeneration = 0;

/** 検索を実行する */
async function runSearch() {
  const query = searchQuery.value.trim();
  if (!query || isSearching.value) return;
  const generation = ++searchGeneration;
  isSearching.value = true;
  try {
    const results = await eventsService.searchEvents(query);
    if (generation === searchGeneration) searchResults.value = results;
  } catch (err) {
    if (generation === searchGeneration) userStore.setError(true, err);
  } finally {
    if (generation === searchGeneration) isSearching.value = false;
  }
}

/** @param {HandyCalendarEvent} evt イベントカードのクリックで詳細画面へ遷移する */
function openEventDetail(evt) {
  userStore.setNowSelectedEvent({ eid: evt.id, cid: evt.calendarId });
  router.push({ name: 'EventDetail' });
}

/**
 * イベントカードのコンテキストメニューが選択されたときのハンドラ
 * @param {string} action アクション
 * @param {HandyCalendarEvent} evt 対象のイベント
 * @returns {Promise<void>}
 */
async function onSelectContextMenu(action, evt) {
  switch (action) {
    case 'ShowDetail':
      openEventDetail(evt);
      break;
    case 'EditEvent':
      userStore.setNowSelectedEvent({ eid: evt.id, cid: evt.calendarId });
      router.push({ name: 'EventEditor' });
      break;
    case 'DeleteEvent':
      await eventActions.confirmAndRemoveEvent(evt.id, evt.calendarId);
      if (searchResults.value) searchResults.value = searchResults.value.filter((item) => !(item.id === evt.id && item.calendarId === evt.calendarId));
      break;
    case 'CloneEvent':
      userStore.setNowSelectedEvent({ eid: evt.id, cid: evt.calendarId });
      router.push({ name: 'EventCloner' });
      break;
    default:
      break;
  }
}
</script>

<template>
  <div class="event-search-view">
    <MenuBar :useMobilePadding="userStore.isMobile">
      <template #center>
        <h2 class="title">イベント検索</h2>
      </template>
      <template #sub>
        <button type="button" class="icon-x-mark-wrapper" title="閉じる" aria-label="閉じる" @click="router.push({ name: 'Home' })">
          <IconXMark />
        </button>
      </template>
      タイトル・説明・場所・タグ（#tag）などで検索できます
    </MenuBar>

    <form class="search-form" @submit.prevent="runSearch">
      <input v-model="searchQuery" type="search" placeholder="検索キーワード（例: 会議, #仕事）" aria-label="検索キーワード" autofocus />
      <button type="submit" data-app-button="primary" :disabled="isSearching || !searchQuery.trim()" title="検索" aria-label="検索"><IconMagnifyingGlass /> 検索</button>
    </form>

    <p v-if="isSearching" class="search-status">検索中...</p>

    <ul v-if="searchResults !== null" class="search-results">
      <DateEventsViewEventCard v-for="evt in searchResults" :key="`${evt.calendarId}:${evt.id}`" :event="evt" @open="openEventDetail" @select="onSelectContextMenu" />
      <li v-if="searchResults.length === 0" class="no-event">一致するイベントはありません</li>
    </ul>
  </div>
</template>

<style lang="scss" scoped>
.event-search-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.search-form {
  display: flex;
  gap: var(--space-xs);
  padding: var(--space-xs) 0;

  input {
    flex: 1;
    min-width: 0;
  }

  button {
    display: flex;
    align-items: center;
    gap: var(--space-xxs);
    white-space: nowrap;
  }
}

.search-status {
  padding: var(--space-sm);
  color: var(--text-light);
  text-align: center;
}

.search-results {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

li.no-event {
  border-radius: var(--border-radius);
  padding: var(--space-sm);
  display: flex;
  justify-content: center;
  margin-top: var(--space-md);
  cursor: default;
}

.icon-x-mark-wrapper {
  background-color: var(--bg-1);
  &:hover {
    background-color: var(--bg-2);
  }
}
</style>
