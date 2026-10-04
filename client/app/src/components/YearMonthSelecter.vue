<script setup>
import { ref, computed, watch } from 'vue';
import dayjs, { Dayjs } from 'dayjs';
import { useDateStore } from '@/stores/date';
import IconXMark from '@/components/icons/IconXMark.vue';
import MenuBar from '@/components/MenuBar.vue';

const dateStore = useDateStore();

const props = defineProps({
  modelValue: { type: Dayjs, default: null },
  isOpen: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue', 'close']);

const thisYear = computed(() => dateStore.now.year());
const thisMonth = computed(() => dateStore.now.month());
const localDate = ref(props.modelValue ?? dayjs().year(thisYear.value).month(thisMonth.value).date(1));
const localYear = computed(() => localDate.value.year());
const localMonth = computed(() => localDate.value.month());

const close = () => emit('close');
const confirm = () => {
  emit('update:modelValue', localDate.value);
  close();
};
</script>

<template>
  <teleport to="body">
    <div v-if="isOpen" class="year-month-selecter" @click.self="close">
      <div class="wrapper">
        <MenuBar>
          <template #sub>
            <IconXMark @click="close" />
          </template>
        </MenuBar>

        <main>
          <h1 class="preview">{{ dateStore.getHeaderTitle(localDate) }}</h1>

          <div class="scroll-picker">
            <div class="scroll-col">
              <div v-for="y in 50" :key="y" :class="{ active: localYear === thisYear - 50 + y }"
                @click="localDate = localDate.year(thisYear - 50 + y)">
                {{ thisYear - 50 + y }}
              </div>
              <div v-for="y in 49" :key="y" :class="{ active: localYear === thisYear + y }"
                @click="localDate = localDate.year(thisYear + y)">
                {{ thisYear + y }}
              </div>
            </div>
            <div class="scroll-col">
              <div v-for="m in 12" :key="m" :class="{ active: localMonth === m - 1 }"
                @click="localDate = localDate.month(m - 1)">
                {{ m.toString().padStart(2, '0') }}
              </div>
            </div>
          </div>
        </main>

        <footer>
          <div class="actions">
            <button @click="close">キャンセル</button>
            <button class="primary" @click="confirm">決定</button>
          </div>
        </footer>
      </div>
    </div>
  </teleport>
</template>

<style lang="scss" scoped>
.year-month-selecter {
  position: fixed;
  inset: 0;
  background: var(--overlay);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.icon-x-mark {
  margin-right: 0.3rem;
}

.wrapper {
  display: flex;
  flex-direction: column;
  background: var(--bg-0);
  border-radius: var(--border-radius);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 4px 20px var(--shadow);
  min-width: 500px;
  min-height: 500px;
}

main {
  flex: 1;
  padding: 1rem 6rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.preview {
  text-align: center;
}

.scroll-picker {
  display: flex;
  height: 230px;
  gap: 10px;

  .scroll-col {
    flex: 1;
    overflow-y: auto;
    text-align: center;
    border: 1px solid var(--border);
    border-radius: 8px;
    scrollbar-width: none;

    /* Firefox */
    &::-webkit-scrollbar {
      display: none;
    }

    /* Chrome */
    div {
      padding: 10px;
      cursor: pointer;

      &.active {
        background: var(--text);
        color: var(--accent);
        font-weight: bold;
      }
    }
  }
}

footer {
  padding: 1rem;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;

  .actions {
    width: 100%;
    display: flex;
    gap: 0.5rem;
    justify-content: end;

    button {
      padding: 0.6rem 1.3rem;
      border: 1px solid var(--border);
      border-radius: var(--border-radius);
      cursor: pointer;

      &.primary {
        background: var(--primary);
        border-color: var(--primary);
      }
    }
  }
}
</style>
