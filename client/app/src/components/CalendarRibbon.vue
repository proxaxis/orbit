<script setup>
import { computed } from 'vue';
import { useCalendarStore } from '@/stores/calendar.js';

const calendarStore = useCalendarStore();

const props = defineProps({
  gCalendarId: {
    type: String,
    default: '',
  },
  cid: {
    type: String,
    required: true,
  },
  useLabel: {
    type: Boolean,
    default: true,
  },
  selectable: {
    type: Boolean,
    default: false,
  },
  selected: {
    type: Boolean,
    default: false,
  },
  useMenuSlot: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['select']);

const calendar = computed(() => calendarStore.list.find((cal) => cal.id === (props.cid ?? props.gCalendarId)) ?? { summary: '', backgroundColor: '' });
</script>

<template>
  <button v-if="props.selectable" type="button" class="calendar-ribbon selectable" :class="{ selected: props.selected }" @click="emit('select', props.cid)">
    <span class="color" :style="{ backgroundColor: calendar.backgroundColor }"></span>
    <span class="name" v-if="props.useLabel">{{ calendar.summary }}</span>
  </button>
  <div v-else class="calendar-ribbon">
    <span class="color" :style="{ backgroundColor: calendar.backgroundColor }"></span>
    <span class="name" v-if="props.useLabel">{{ calendar.summary }}</span>
  </div>
  <div class="menu-area" v-if="props.useMenuSlot">
    <slot name="menu"></slot>
  </div>
</template>

<style lang="scss" scoped>
.calendar-ribbon {
  display: flex;
  flex: 1;
  flex-shrink: 0;
  align-items: center;
  gap: var(--space-sm);
  user-select: none;
  overflow: hidden;
}

.calendar-ribbon.selectable {
  width: 100%;
  padding: var(--space-xs) var(--space-sm);
  // padding: var(--space-sm) var(--space-sm);
  border: 1px solid transparent;
  border-radius: var(--border-radius);
  background: transparent;
  color: var(--text);
  text-align: left;

  &:hover {
    background: var(--bg-2);
  }
  &.selected {
    border-color: var(--primary);
    background: var(--bg-2);
  }
}

.color {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.menu-area {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
</style>
