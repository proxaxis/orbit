<script setup>
import { ref } from 'vue';
import { useCalendarStore } from '@/stores/calendar.js';
import { useUserStore } from '@/stores/user.js';
import DropdownMenu from '@/components/DropdownMenu.vue';
import IconEllipsisVertical from '@/components/icons/IconEllipsisVertical.vue';
import MiniCalendar from '@/components/MiniCalendar.vue';
import MenuBar from '@/components/MenuBar.vue';
import CalendarRibbon from '@/components/CalendarRibbon.vue';
import { useRouter } from 'vue-router';

const calendarStore = useCalendarStore();
const userStore = useUserStore();
const router = useRouter();
const draggedCalendarId = ref(null);
const dragOverCalendarId = ref(null);

function openCalendarCreator() {
  router.push({ name: 'CalendarCreator' });
}

/** @param {string} calendarId */
function openSharingConfig(calendarId = '') {
  router.push({ name: 'SharingConfig', query: { calendarId } });
}

/** @param {string} calendarId */
function openCalendarDetail(calendarId) {
  router.push({ name: 'CalendarDetail', query: { calendarId } });
}

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
</script>

<template>
  <div class="user-calendars-view">
    <MiniCalendar v-if="userStore.useMiniCalendar" />

    <MenuBar>
      <template #main>
        <span class="title">カレンダー</span>
      </template>
      <template #sub>
        <DropdownMenu>
          <template #button>
            <button>
              <IconEllipsisVertical />
            </button>
          </template>
          <button @click="openCalendarCreator">カレンダーの作成</button>
          <button @click="router.push({ name: 'UserConfig' })">ユーザー設定</button>
          <button>すべてのカレンダーを表示</button>
          <button>すべてのカレンダーを非表示</button>
          <button>スクリーンショットモードを有効化する</button>
        </DropdownMenu>
      </template>
    </MenuBar>

    <ul>
      <li v-for="(c) in calendarStore.list" :key="c.id" :title="c.description" draggable="true"
        :class="{ 'is-dragging': draggedCalendarId === c.id, 'is-drag-over': dragOverCalendarId === c.id }"
        @dragstart="startDragging(c.id)" @dragover.prevent="setDragOver(c.id)" @drop.prevent="dropCalendar(c.id)"
        @dragend="draggedCalendarId = null; dragOverCalendarId = null">
        <input type="checkbox" :id="`iptbx-${c.id}`" :checked="true"
          :style="{ accentColor: c.backgroundColor, borderColor: c.backgroundColor }" />
        <div class="list-item">
          <label :for="`iptbx-${c.id}`" :title="c.description">
            <CalendarRibbon :gCalendarId="c.id" />
          </label>
          <DropdownMenu>
            <template #button>
              <IconEllipsisVertical class="dropdown-menu-icon" />
            </template>
            <button>非表示</button>
            <button @click="openCalendarDetail(c.id)">カレンダーの詳細</button>
            <button @click="openSharingConfig(c.id)">共有設定</button>
          </DropdownMenu>
        </div>
      </li>
    </ul>
  </div>
</template>

<style lang="scss" scoped>
.user-calendars-view {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
}

ul {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);

  li {
    display: flex;
    border-radius: 0.3rem;
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

.dropdown-menu {
  display: flex;
  align-items: center;
}

.dropdown-menu-icon {
  padding: var(--space-xs);
}
</style>
