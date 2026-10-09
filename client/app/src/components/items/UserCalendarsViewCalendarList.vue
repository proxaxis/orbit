<script setup>
/**
 * UserCalendarsView のカレンダーリスト欄。
 * 表示/非表示の切り替え・並び替え（ドラッグ）・共有状態アイコン・
 * 各カレンダーへの操作メニューを担う。
 */
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.js';
import { useCalendarStore } from '@/stores/calendar.js';
import { useShareStore } from '@/stores/share.js';
import { useUserStore } from '@/stores/user.js';
import { useSharingStates } from '@/composables/useSharingStates.js';
import AccordionMenu from '@/components/AccordionMenu.vue';
import CalendarRibbon from '@/components/CalendarRibbon.vue';
import DropdownMenu from '@/components/DropdownMenu.vue';
import IconCalendarPlus from '@/components/icons/IconCalendarPlus.vue';
import IconCircleInfo from '@/components/icons/IconCircleInfo.vue';
import IconCloudArrowDown from '@/components/icons/IconCloudArrowDown.vue';
import IconCrown from '@/components/icons/IconCrown.vue';
import IconEllipsisVertical from '@/components/icons/IconEllipsisVertical.vue';
import IconEye from '@/components/icons/IconEye.vue';
import IconEyeSlash from '@/components/icons/IconEyeSlash.vue';
import IconUserGroup from '@/components/icons/IconUserGroup.vue';
import IconUserLock from '@/components/icons/IconUserLock.vue';
import IconUserPlus from '@/components/icons/IconUserPlus.vue';

const router = useRouter();
const authStore = useAuthStore();
const calendarStore = useCalendarStore();
const shareStore = useShareStore();
const userStore = useUserStore();
const { sharingStates, loadSharingStates } = useSharingStates();

// カレンダー一覧か認証状態が変わったら共有状態を再判定する
watch([() => calendarStore.list, () => authStore.token], loadSharingStates, { immediate: true });

/** @type {ComputedRef<GoogleCalendarListEntry[]>} セッションおよび期間指定共有以外の通常カレンダー一覧 */
const regularCalendars = computed(() => calendarStore.list.filter((calendar) => !isSessionCalendar(calendar) && !shareStore.copyCalendarIds.has(calendar.id)));

/** @param {GoogleCalendarListEntry} calendar @returns {boolean} プライベート表示にすべきか */
function isPrivateCalendar(calendar) {
  return sharingStates.value[calendar.id] === 'private';
}

/** @param {GoogleCalendarListEntry} calendar @returns {boolean} セッションカレンダーか */
function isSessionCalendar(calendar) {
  return /** @type {{ session?: boolean }} */ (/** @type {unknown} */ (calendar)).session === true;
}

/** @type {Ref<string|null>} @description ドラッグ中のカレンダー ID */
const draggedCalendarId = ref(null);

/** @type {Ref<string|null>} @description ドラッグオーバー中のカレンダー ID */
const dragOverCalendarId = ref(null);

/** @param {string} calendarId ドラッグ開始したカレンダー ID */
function startDragging(calendarId) {
  draggedCalendarId.value = calendarId;
}

/** @param {string} calendarId ドラッグオーバー中のカレンダー ID */
function setDragOver(calendarId) {
  if (draggedCalendarId.value !== calendarId) dragOverCalendarId.value = calendarId;
}

/**
 * ドロップ位置に応じてカレンダーの並び順を更新する
 * @param {string} targetCalendarId ドロップ先のカレンダー ID
 * @returns {void}
 */
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

/** 全カレンダーを表示状態にする */
function showAllCalendars() {
  userStore.hiddenCalendarIds = [];
  userStore.saveSettings();
}

/** 全カレンダーを非表示にする */
function hideAllCalendars() {
  userStore.hiddenCalendarIds = [...new Set(regularCalendars.value.map((calendar) => calendar.id).filter((id) => typeof id === 'string'))];
  userStore.saveSettings();
}
</script>

<template>
  <section class="calendar-section">
    <AccordionMenu title="カレンダーリストの開閉" :useMenuSlot="true" :open="true">
      <template #summary>カレンダーリスト</template>
      <template #menu>
        <DropdownMenu>
          <template #button>
            <button class="cal-list-menu-open" title="カレンダーの操作">
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
                <CalendarRibbon :cid="c.id" :useMenuSlot="true">
                  <template #menu>
                    <div class="cal-list-ribbon-icons">
                      <IconCrown v-if="userStore.defaultCalendarId === c.id" size="1.5rem" title="デフォルトカレンダー" />
                      <IconUserLock v-if="isPrivateCalendar(c)" class="privacy-icon" size="1.3rem" title="非公開カレンダー" />
                    </div>
                    <DropdownMenu>
                      <template #button>
                        <button class="cal-list-dm-open" title="カレンダーの操作">
                          <IconEllipsisVertical />
                        </button>
                      </template>
                      <button @click="userStore.setCalendarVisibility(c.id, false)"><IconEyeSlash />非表示</button>
                      <button @click="userStore.setCalendarVisibility(c.id, true)"><IconEye />表示</button>
                      <button @click="router.push({ name: 'CalendarDetail', query: { cid: c.id } })"><IconCircleInfo />カレンダーの詳細</button>
                      <button @click="router.push({ name: 'SharingConfig', query: { cid: c.id } })"><IconUserGroup />共有設定</button>
                      <button @click="router.push({ name: 'ShareManage', query: { cid: c.id } })"><IconUserPlus />期間を指定して共有</button>
                      <button @click="userStore.setDefaultCalendar(c.id)"><IconCrown />デフォルトにする</button>
                    </DropdownMenu>
                  </template>
                </CalendarRibbon>
              </label>
            </div>
          </li>
        </ul>
        <small v-if="authStore.isAuthenticated && regularCalendars.length === 0">表示するカレンダーはありません</small>
        <small v-if="!authStore.isAuthenticated" class="login-message">カレンダーを同期するにはログインしてください</small>
      </div>
    </AccordionMenu>
  </section>
</template>

<style lang="scss" scoped>
.accordion-content {
  overflow: visible;
  small {
    display: block;
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
    padding: var(--space-xs) 0 var(--space-xs) var(--space-sm);
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

.cal-list-menu-open {
  padding: var(--space-sm) calc(var(--space-xs) + var(--space-sm)) var(--space-sm) var(--space-sm);
  background-color: var(--bg-1);

  &:hover {
    background-color: var(--bg-2);
  }
}

.cal-list-dm-open {
  padding: var(--space-sm);
  background-color: transparent;
}

.cal-list-ribbon-icons {
  display: flex;
  align-items: center;
  gap: var(--space-xs);

  * {
    fill: var(--text-light);
  }
}

.privacy-icon {
  flex: 0 0 auto;
}
</style>
