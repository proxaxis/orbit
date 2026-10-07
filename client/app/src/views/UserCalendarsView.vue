<script setup>
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useCalendarStore } from '@/stores/calendar.js';
import { useUserStore } from '@/stores/user.js';
import { useAuthStore } from '@/stores/auth.js';
import { usePeopleStore } from '@/stores/people.js';
import * as gCalAPI from '@/services/google-calendar-api.js';
import MiniCalendar from '@/components/MiniCalendar.vue';
import MenuBar from '@/components/MenuBar.vue';
import CalendarRibbon from '@/components/CalendarRibbon.vue';
import AskLoginMessage from '@/components/AskLoginMessage.vue';
import DropdownMenu from '@/components/DropdownMenu.vue';
import GoogleLogin from '@/components/GoogleLogin.vue';
import IconEllipsisVertical from '@/components/icons/IconEllipsisVertical.vue';
import IconUserLock from '@/components/icons/IconUserLock.vue';
import IconEyeSlash from '@/components/icons/IconEyeSlash.vue';
import IconUserGroup from '@/components/icons/IconUserGroup.vue';
import IconUserPlus from '@/components/icons/IconUserPlus.vue';
import IconCircleInfo from '@/components/icons/IconCircleInfo.vue';
import IconCalendarPlus from '@/components/icons/IconCalendarPlus.vue';
import IconCloudArrowDown from '@/components/icons/IconCloudArrowDown.vue';
import IconEye from '@/components/icons/IconEye.vue';
import IconCrown from '@/components/icons/IconCrown.vue';
import IconTrash from '@/components/icons/IconTrash.vue';
import AccordionMenu from '@/components/AccordionMenu.vue';

const router = useRouter();
const calendarStore = useCalendarStore();
const userStore = useUserStore();
const authStore = useAuthStore();
const peopleStore = usePeopleStore();
const sessionCalendarQuery = ref('');
const isSearchingSessionCalendar = ref(false);
const sessionCalendarError = ref('');
const regularCalendars = computed(() => calendarStore.list.filter((calendar) => !isSessionCalendar(calendar)));
const isCalendarSectionOpen = ref(true);
const isSessionSectionOpen = ref(true);

async function searchSessionCalendar() {
  sessionCalendarError.value = '';
  try {
    const query = sessionCalendarQuery.value.trim();
    if (!query) return;
    isSearchingSessionCalendar.value = true;
    await calendarStore.searchSessionCalendar(query);
    sessionCalendarQuery.value = '';
    peopleStore.clearSuggestions();
  } catch (error) {
    sessionCalendarError.value = error instanceof Error ? error.message : 'カレンダーを検索できませんでした。';
  } finally {
    isSearchingSessionCalendar.value = false;
  }
}

async function searchPeopleForSessionCalendar() {
  if (sessionCalendarQuery.value.trim().length < 2) return;
  await peopleStore.search(sessionCalendarQuery.value);
}

/** Google Calendar がプライベートカレンダーの ACL に返すシステム主体 */
const SYSTEM_CALENDAR_PRINCIPALS = new Set(['badd9bc48b578d2e8be8a95d2afabc3e4024e4876ab49d7cb0bd8e244f591ec9@group.calendar.google.com']);

/** @param {unknown} value ACL 主体の値 @returns {string} 比較用に正規化した値 */
function normalizePrincipal(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/** @type {Ref<Record<string, 'private'|'shared'|'unknown'>>} カレンダーの共有状態 */
const sharingStates = ref({});

/**
 * カレンダーの ACL を取得し、所有者以外の共有ルールがあるか判定します。
 * @returns {Promise<void>}
 */
async function loadSharingStates() {
  if (!authStore.token || !calendarStore.list.length) return;
  const primaryCalendar = calendarStore.list.find((calendar) => calendar.primary);
  const knownOwnerPrincipals = new Set([normalizePrincipal(primaryCalendar?.id), normalizePrincipal(primaryCalendar ? /** @type {{ dataOwner?: string }} */ (/** @type {unknown} */ (primaryCalendar)).dataOwner : undefined)].filter(Boolean));
  const entries = await Promise.all(
    calendarStore.list.map(async (calendar) => {
      if (calendar.accessRole !== 'owner' && !calendar.primary) return [calendar.id, 'unknown'];
      try {
        const response = await gCalAPI.listAcl(authStore.token, calendar.id, { maxResults: 250 });
        const rules = response?.items ?? [];
        const systemPrincipals = new Set([normalizePrincipal(calendar.id), normalizePrincipal(/** @type {{ dataOwner?: string }} */ (/** @type {unknown} */ (calendar)).dataOwner), ...SYSTEM_CALENDAR_PRINCIPALS]);
        const dataOwner = normalizePrincipal(/** @type {{ dataOwner?: string }} */ (/** @type {unknown} */ (calendar)).dataOwner);
        const belongsToAnotherOwner = Boolean(dataOwner && knownOwnerPrincipals.size && !knownOwnerPrincipals.has(dataOwner));
        const relevantRules = rules.filter((rule) => !systemPrincipals.has(normalizePrincipal(rule.scope.value)));
        const ownerCount = relevantRules.filter((rule) => rule.role === 'owner').length;
        const hasSharingRule = belongsToAnotherOwner || ownerCount > 1 || relevantRules.some((rule) => rule.role !== 'owner' && ['user', 'group', 'domain'].includes(rule.scope.type));
        return [calendar.id, hasSharingRule ? 'shared' : 'private'];
      } catch (error) {
        return [calendar.id, 'unknown'];
      }
    }),
  );
  sharingStates.value = Object.fromEntries(entries);
}

/** @param {GoogleCalendarListEntry} calendar @returns {boolean} プライベート表示にすべきか */
function isPrivateCalendar(calendar) {
  return sharingStates.value[calendar.id] === 'private';
}

/** @param {GoogleCalendarListEntry} calendar @returns {boolean} セッションカレンダーか */
function isSessionCalendar(calendar) {
  return /** @type {{ session?: boolean }} */ (/** @type {unknown} */ (calendar)).session === true;
}

watch([() => calendarStore.list, () => authStore.token], loadSharingStates, { immediate: true });

/** @type {Ref<string|null>} @description ドラッグ中のカレンダー ID */
const draggedCalendarId = ref(null);

/** @type {Ref<string|null>} @description ドラッグオーバー中のカレンダー ID */
const dragOverCalendarId = ref(null);

/** @param {string} calendarId */
function startDragging(calendarId) {
  draggedCalendarId.value = calendarId;
}

/** @param {string} calendarId */
function setDragOver(calendarId) {
  if (draggedCalendarId.value !== calendarId) dragOverCalendarId.value = calendarId;
}

/** @param {string} targetCalendarId */
function dropCalendar(targetCalendarId) {
  const sourceCalendarId = draggedCalendarId.value;
  if (!sourceCalendarId || sourceCalendarId === targetCalendarId) return;

  const ids = calendarStore.list.map((calendar) => calendar.id).filter((id) => id !== sourceCalendarId);
  const targetIndex = ids.indexOf(targetCalendarId);
  if (targetIndex === -1) return;
  ids.splice(targetIndex, 0, sourceCalendarId);
  userStore.setCalendarOrder(ids);
  draggedCalendarId.value = null;
  dragOverCalendarId.value = null;
}

function showAllCalendars() {
  userStore.hiddenCalendarIds = [];
  userStore.saveSettings();
}

function hideAllCalendars() {
  userStore.hiddenCalendarIds = [...new Set(calendarStore.list.map((calendar) => calendar.id).filter((id) => typeof id === 'string'))];
  userStore.saveSettings();
}
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

      <section class="calendar-section" :class="{ 'is-open': isCalendarSectionOpen }">
        <AccordionMenu title="カレンダーリストの開閉" :useMenuSlot="true">
          <template #summary>カレンダーリスト</template>
          <template #menu>
            <DropdownMenu>
              <template #button>
                <button class="icon-ellipsis-vertical-wrapper" title="カレンダーの操作">
                  <IconEllipsisVertical />
                </button>
              </template>
              <button @click="router.push({ name: 'CalendarCreator' })"><IconCalendarPlus />カレンダーを作成</button>
              <button @click="router.push({ name: 'CalendarAdder' })"><IconCloudArrowDown />他のカレンダーを追加</button>
              <button @click="showAllCalendars"><IconEye />全てを表示</button>
              <button @click="hideAllCalendars"><IconEyeSlash />全てを非表示</button>
            </DropdownMenu>
          </template>
          <div class="accordion-content">
            <ul v-if="authStore.isAuthenticated">
              <li
                v-for="c in regularCalendars"
                :key="c.id"
                :title="c.description"
                draggable="true"
                :class="{ 'is-dragging': draggedCalendarId === c.id, 'is-drag-over': dragOverCalendarId === c.id }"
                @dragstart="startDragging(c.id)"
                @dragover.prevent="setDragOver(c.id)"
                @drop.prevent="dropCalendar(c.id)"
                @dragend="
                  draggedCalendarId = null;
                  dragOverCalendarId = null;
                ">
                <input type="checkbox" :id="`iptbx-${c.id}`" :checked="!userStore.hiddenCalendarIds.includes(c.id)" :style="{ accentColor: c.backgroundColor, borderColor: c.backgroundColor }" @change="userStore.setCalendarVisibility(c.id, /** @type {HTMLInputElement} */ ($event.target).checked)" />
                <div class="list-item">
                  <label :for="`iptbx-${c.id}`" :title="c.description">
                    <CalendarRibbon :cid="c.id" />
                    <small v-if="isSessionCalendar(c)" class="session-badge">SESSION</small>
                    <IconCrown v-if="userStore.defaultCalendarId === c.id" size="0.85rem" title="デフォルトカレンダー" />
                    <IconUserLock v-if="isPrivateCalendar(c)" class="privacy-icon" size="0.85rem" title="非公開カレンダー" />
                  </label>
                  <DropdownMenu>
                    <template #button>
                      <IconEllipsisVertical />
                    </template>
                    <button @click="userStore.setCalendarVisibility(c.id, false)"><IconEyeSlash />非表示</button>
                    <button @click="router.push({ name: 'CalendarDetail', query: { cid: c.id } })"><IconCircleInfo />カレンダーの詳細</button>
                    <button @click="router.push({ name: 'SharingConfig', query: { cid: c.id } })"><IconUserGroup />共有設定</button>
                    <button @click="router.push({ name: 'ShareManage', query: { cid: c.id } })"><IconUserPlus />期間を指定して共有</button>
                    <button @click="userStore.setDefaultCalendar(c.id)"><IconCrown />デフォルトにする</button>
                  </DropdownMenu>
                </div>
              </li>
            </ul>
            <small v-if="authStore.isAuthenticated && regularCalendars.length === 0">表示するカレンダーはありません</small>
            <small v-if="!authStore.isAuthenticated" class="login-message">カレンダーを同期するにはログインしてください</small>
          </div>
        </AccordionMenu>
      </section>

      <section class="session-section">
        <AccordionMenu title="セッションリストの開閉" :useMenuSlot="true">
          <template #summary>セッションリスト</template>
          <template #menu>
            <DropdownMenu>
              <template #button>
                <button class="icon-ellipsis-vertical-wrapper" title="カレンダーの操作">
                  <IconEllipsisVertical />
                </button>
              </template>
              <button><IconEye />全てを表示</button>
              <button><IconEyeSlash />全てを非表示</button>
              <button :disabled="!calendarStore.sessionCalendars.length" @click="calendarStore.clearSessionCalendars"><IconTrash />全て削除</button>
            </DropdownMenu>
          </template>
          <div class="accordion-content">
            <div class="session-calendar-search">
              <div class="session-search-row">
                <input v-model="sessionCalendarQuery" placeholder="カレンダーを検索..." @input="searchPeopleForSessionCalendar" @keydown.enter.prevent="searchSessionCalendar" />
                <button type="button" :disabled="isSearchingSessionCalendar" @click="searchSessionCalendar">追加</button>
              </div>
              <ul v-if="peopleStore.suggestions.length" class="people-results">
                <li v-for="person in peopleStore.suggestions" :key="person.resourceName">
                  <button
                    type="button"
                    @click="
                      sessionCalendarQuery = person.emailAddresses?.[0]?.value ?? '';
                      peopleStore.clearSuggestions();
                      searchSessionCalendar();
                    ">
                    {{ person.names?.[0]?.displayName || person.emailAddresses?.[0]?.value }}
                  </button>
                </li>
              </ul>
              <small v-if="sessionCalendarError" class="error">{{ sessionCalendarError }}</small>
            </div>

            <ul v-if="authStore.isAuthenticated" class="session-calendar-list">
              <li v-for="c in calendarStore.sessionCalendars" :key="c.id" :title="c.description">
                <div class="list-item">
                  <label :title="c.description">
                    <CalendarRibbon :cid="c.id" />
                    <small class="session-badge">SESSION</small>
                  </label>
                  <DropdownMenu>
                    <template #button>
                      <IconEllipsisVertical />
                    </template>
                    <button @click="userStore.setCalendarVisibility(c.id, false)"><IconEyeSlash />非表示</button>
                    <button @click="calendarStore.removeSessionCalendar(c.id)">セッションから削除</button>
                  </DropdownMenu>
                </div>
              </li>
            </ul>
            <small v-if="authStore.isAuthenticated && calendarStore.sessionCalendars.length === 0">表示するカレンダーはありません</small>
            <small v-if="!authStore.isAuthenticated" class="login-message">カレンダーを同期するにはログインしてください</small>
          </div>
        </AccordionMenu>
      </section>
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

.accordion-content {
  overflow: visible;
  small {
    display: block;
    padding: var(--space-xs) var(--space-md);
    color: var(--text-light);
  }
}

ul {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  min-height: 0;
  overflow-y: visible;
  margin-bottom: var(--space-sm);

  li {
    display: flex;
    border-radius: var(--border-radius);
    padding: var(--space-xs) var(--space-sm) var(--space-xs) var(--space-sm);
    gap: var(--space-sm);

    &:hover {
      background-color: var(--bg-2);

      * {
        cursor: pointer;
      }
    }

    &.is-dragging {
      opacity: 0.45;
    }

    &.is-drag-over {
      border-top: 2px solid var(--primary);
    }
  }
}

.list-item {
  display: flex;
  justify-content: space-between;
  width: 100%;
  overflow: hidden;

  label {
    display: flex;
    flex: 1;
    align-items: center;
    gap: var(--space-sm);
    user-select: none;
    overflow: hidden;
  }
}

.icon-ellipsis-vertical-wrapper {
  padding: var(--space-sm);
  background-color: var(--bg-1);

  &:hover {
    background-color: var(--bg-2);
  }
}

.google-login-wrapper {
  width: calc(100% - var(--space-sm) * 2);
  margin: var(--space-sm) auto;
}

.session-calendar-search {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin: var(--space-sm) 0;
  font-size: var(--text-size-xs);
}

.session-search-row {
  display: flex;
  gap: var(--space-xs);

  button {
    background-color: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: var(--border-radius);

    &:hover {
      background-color: var(--bg-3);
    }
  }

  input {
    flex: 1;
    min-width: 0;
  }
}

.people-results {
  max-height: 10rem;
  overflow-y: auto;

  button {
    width: 100%;
    justify-content: flex-start;
    padding: var(--space-xs);
  }
}

.session-badge {
  color: var(--primary);
  font-size: var(--text-size-xxs);
}

.error {
  color: var(--danger);
}

.privacy-icon {
  flex: 0 0 auto;
}
</style>
