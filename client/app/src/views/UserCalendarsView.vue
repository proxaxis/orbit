<script setup>
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useCalendarStore } from '@/stores/calendar.js';
import { useUserStore } from '@/stores/user.js';
import { useAuthStore } from '@/stores/auth.js';
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
import AppInstallButton from '@/components/AppInstallButton.vue';
import IconUserGroup from '@/components/icons/IconUserGroup.vue';
import IconCircleInfo from '@/components/icons/IconCircleInfo.vue';
import IconCalendarPlus from '@/components/icons/IconCalendarPlus.vue';
import IconCloudArrowDown from '@/components/icons/IconCloudArrowDown.vue';
import IconEye from '@/components/icons/IconEye.vue';

const router = useRouter();
const calendarStore = useCalendarStore();
const userStore = useUserStore();
const authStore = useAuthStore();

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

      <MenuBar>
        <template #main>
          <span class="title">カレンダー</span>
        </template>
        <template #sub>
          <DropdownMenu>
            <template #button>
              <button class="icon-ellipsis-vertical-wrapper" title="カレンダーの操作">
                <IconEllipsisVertical />
              </button>
            </template>
            <button @click="router.push({ name: 'CalendarCreator' })"><IconCalendarPlus />カレンダーを作成</button>
            <button @click="router.push({ name: 'CalendarAdder' })"><IconCloudArrowDown />他のカレンダーを追加</button>
            <button @click="showAllCalendars"><IconEye />全てのカレンダーを表示</button>
            <button @click="hideAllCalendars"><IconEyeSlash />全てのカレンダーを非表示</button>
          </DropdownMenu>
        </template>
      </MenuBar>

      <AskLoginMessage v-if="!authStore.isAuthenticated">
        カレンダーを表示するには Google アカウントでログインする必要があります
        <div class="google-login-wrapper">
          <GoogleLogin />
        </div>
      </AskLoginMessage>

      <ul v-if="authStore.isAuthenticated">
        <li
          v-for="c in calendarStore.list"
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
              <CalendarRibbon :gCalendarId="c.id" />
              <IconUserLock v-if="isPrivateCalendar(c)" class="privacy-icon" size="0.85rem" title="非公開カレンダー" />
            </label>
            <DropdownMenu>
              <template #button>
                <IconEllipsisVertical />
              </template>
              <button @click="userStore.setCalendarVisibility(c.id, false)"><IconEyeSlash />非表示</button>
              <button @click="router.push({ name: 'CalendarDetail', query: { cid: c.id } })"><IconCircleInfo />カレンダーの詳細</button>
              <button @click="router.push({ name: 'SharingConfig', query: { cid: c.id } })"><IconUserGroup />共有設定</button>
            </DropdownMenu>
          </div>
        </li>
      </ul>
    </div>
    <div v-if="!userStore.isAppInstalled">
      <AppInstallButton />
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
  }

  > div:nth-child(2) {
    border-top: 1px solid var(--border);
    padding-top: var(--space-sm);
  }
}

ul {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  overflow-y: auto;

  li {
    display: flex;
    border-radius: var(--border-radius);
    padding: var(--space-xs) 0 var(--space-xs) 0;
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
  // カレンダーリストのボタンとそろえるために padding を調整
  padding: var(--space-sm) 0 var(--space-sm) var(--space-sm);
  background-color: var(--bg-1);

  &:hover {
    background-color: var(--bg-2);
  }
}

.google-login-wrapper {
  width: calc(100% - var(--space-sm) * 2);
  margin-top: var(--space-sm);
}

.privacy-icon {
  flex: 0 0 auto;
  fill: var(--text-light);
}
</style>
