<script setup>
import { ref, onMounted, getCurrentInstance } from 'vue';
import { useRouter } from 'vue-router';
import { useCalendarStore } from '@/stores/calendar.js';
import { useUserStore } from '@/stores/user.js';
import DropdownMenu from '@/components/DropdownMenu.vue';
import IconEllipsisVertical from '@/components/icons/IconEllipsisVertical.vue';
import MiniCalendar from '@/components/MiniCalendar.vue';
import MenuBar from '@/components/MenuBar.vue';
import CalendarRibbon from '@/components/CalendarRibbon.vue';

const router = useRouter();
const calendarStore = useCalendarStore();
const userStore = useUserStore();
const proxy = (getCurrentInstance())?.proxy;
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
          <button>カレンダーの作成</button>
          <button>すべてのカレンダーを表示</button>
          <button>すべてのカレンダーを非表示</button>
          <button>スクリーンショットモードを有効化する</button>
        </DropdownMenu>
      </template>
    </MenuBar>

    <ul>
      <li v-for="(c) in calendarStore.list" :key="c.id" :title="c.description">
        <input type="checkbox" :id="`iptbx-${c.id}`" :checked="true" @change="() => {}"
          :style="{ accentColor: c.backgroundColor, borderColor: c.backgroundColor }" />
        <div class="list-item-main">
          <label :for="`iptbx-${c.id}`" :title="c.description">
            <CalendarRibbon :cid="c.id" />
          </label>
          <DropdownMenu>
            <template #button>
              <IconEllipsisVertical />
            </template>
            <button>非表示</button>
            <button>カレンダーの詳細</button>
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
  gap: 0.5rem;

  li {
    display: flex;
    border-radius: 0.3rem;
    padding: 0.2rem 0 0.2rem 0.3rem;
    gap: 0.5rem;

    &:hover {
      background-color: var(--bg-2);

      * {
        cursor: pointer;
      }
    }
  }
}

.list-item-main {
  display: flex;
  justify-content: space-between;
  width: 100%;
  overflow: hidden;

  label {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 0.5rem;
    user-select: none;
    overflow: hidden;
  }
}

.dropdown-menu {
  display: flex;
  align-items: center;
}

.icons {
  padding: 0.4rem;
}
</style>
