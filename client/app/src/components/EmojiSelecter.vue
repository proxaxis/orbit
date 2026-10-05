<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import emojiData from '@/assets/emoji-data.json';
import { readOffline, writeOffline } from '@/services/offline-storage.js';
import IconXMark from '@/components/icons/IconXMark.vue';

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
});

const emit = defineEmits(['update:modelValue']);

const isOpen = ref(false);
const searchInput = ref(null);
const search = ref('');
const categoryOverrides = ref({});
const categories = emojiData.categories;
const historyKey = 'emoji-history';
const storageKey = 'emoji-category-overrides';
const maxHistory = 48;
const historyList = ref([]);
const pickedEmoji = ref(null);

const loadOverrides = async () => {
  const saved = await readOffline(storageKey, {});
  categoryOverrides.value = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
};

const persistOverrides = async () => {
  await writeOffline(storageKey, categoryOverrides.value);
};

const loadHistory = async () => {
  const saved = await readOffline(historyKey, []);
  historyList.value = Array.isArray(saved) ? saved : [];
};

const persistHistory = async () => {
  await writeOffline(historyKey, historyList.value);
};

Promise.all([loadOverrides(), loadHistory()]);

watch(categoryOverrides, () => persistOverrides(), { deep: true });
watch(historyList, () => persistHistory(), { deep: true });

const editableCategories = computed(() => {
  return categories.filter((category) => category.id !== 'history');
});

const categoryLabelMap = computed(() => {
  return categories.reduce((acc, item) => {
    acc[item.id] = item.label;
    return acc;
  }, {});
});

const normalizedItems = computed(() => {
  return emojiData.items.map((item) => ({
    ...item,
    category: categoryOverrides.value[item.char] || item.category,
  }));
});

const addToHistory = (emoji) => {
  if (!emoji) return;
  const exists = normalizedItems.value.some((item) => item.char === emoji);
  if (!exists) return;
  const nextList = historyList.value.filter((char) => char !== emoji);
  nextList.unshift(emoji);
  historyList.value = nextList.slice(0, maxHistory);
};

const matchesQuery = (item, query) => {
  if (!query) return true;
  const haystack = [item.nameJa, item.nameEn, categoryLabelMap.value[item.category] || ''].join(' ').toLowerCase();
  return query.split(/\s+/).every((token) => haystack.includes(token));
};

const filteredGroups = computed(() => {
  const query = search.value.trim().toLowerCase();
  const historyLabel = categoryLabelMap.value.history || '履歴';
  const historyItems = historyList.value.map((char) => normalizedItems.value.find((item) => item.char === char)).filter((item) => item && matchesQuery(item, query));

  const baseGroups = categories
    .filter((category) => category.id !== 'history')
    .map((category) => ({
      ...category,
      items: normalizedItems.value.filter((item) => item.category === category.id && matchesQuery(item, query)),
    }));

  const grouped = historyItems.length ? [{ id: 'history', label: historyLabel, items: historyItems }, ...baseGroups] : baseGroups;

  return grouped.filter((group) => group.items.length > 0);
});

const flatEmojiItems = computed(() => {
  const query = search.value.trim().toLowerCase();
  return normalizedItems.value.filter((item) => matchesQuery(item, query));
});

const selectedItem = computed(() => {
  return normalizedItems.value.find((item) => item.char === props.modelValue) || null;
});

const previewCodepoints = computed(() => {
  if (!props.modelValue) return '';
  return [...props.modelValue].map((char) => `U+${char.codePointAt(0).toString(16).toUpperCase()}`).join(' ');
});

const selectEmoji = (emoji) => {
  addToHistory(emoji);
  emit('update:modelValue', emoji);
  closeModal();
};

const updateCategory = (event) => {
  if (!selectedItem.value) return;
  const nextCategory = event.target.value;
  categoryOverrides.value[selectedItem.value.char] = nextCategory;
};

const resetCategory = () => {
  if (!selectedItem.value) return;
  delete categoryOverrides.value[selectedItem.value.char];
};

const randomEmoji = () => {
  const list = flatEmojiItems.value;
  if (!list.length) return;
  const index = Math.floor(Math.random() * list.length);
  const picked = list[index].char;
  pickedEmoji.value = picked;
  addToHistory(picked);
  emit('update:modelValue', picked);
};

const openModal = async () => {
  isOpen.value = true;
  await nextTick();
  if (searchInput.value) {
    searchInput.value.focus();
  }
};

const closeModal = () => {
  isOpen.value = false;
};

const handleOverlayClick = (event) => {
  if (event.target === event.currentTarget) {
    closeModal();
  }
};

const handleKeydown = (event) => {
  if (event.key === 'Escape') {
    closeModal();
  }
};

watch(
  () => props.modelValue,
  (value) => addToHistory(value),
);

watch(isOpen, (value) => {
  if (value) {
    document.addEventListener('keydown', handleKeydown);
  } else {
    document.removeEventListener('keydown', handleKeydown);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div class="emoji-selecter">
    <button type="button" class="open-btn" @click="openModal">
      <span v-if="modelValue" class="open-emoji">{{ modelValue }}</span>
      <span v-else class="open-label">📌</span>
    </button>

    <Teleport to="body">
      <div v-if="isOpen" class="emoji-modal-overlay" @click="handleOverlayClick">
        <div class="emoji-modal" role="dialog" aria-modal="true" aria-label="絵文字を選択">
          <header class="modal-header">
            <h3>絵文字を選択</h3>
            <button type="button" class="close-btn" @click="closeModal" aria-label="閉じる">
              <IconXMark />
            </button>
          </header>
          <div class="modal-body">
            <div class="control-row">
              <input ref="searchInput" v-model="search" type="text" class="search-input" placeholder="絵文字を検索" aria-label="絵文字の検索" />
              <button type="button" class="random-btn" @click="randomEmoji">ランダム</button>
            </div>

            <!-- <div class="preview" v-if="modelValue">
              <div class="preview-emoji">{{ modelValue }}</div>
              <div class="preview-meta">
                <div class="preview-code">{{ previewCodepoints }}</div>
                <div v-if="selectedItem" class="preview-name">
                  {{ selectedItem.nameJa }} / {{ selectedItem.nameEn }}
                </div>
              </div>
            </div> -->

            <div v-if="selectedItem" class="category-editor">
              <label for="emoji-category">カテゴリを選択:</label>
              <select id="emoji-category" :value="selectedItem.category" @change="updateCategory">
                <option v-for="category in editableCategories" :key="category.id" :value="category.id">
                  {{ category.label }}
                </option>
              </select>
              <button type="button" class="reset-btn" @click="resetCategory">デフォルトにする</button>
            </div>

            <div v-if="filteredGroups.length" class="groups">
              <section v-for="group in filteredGroups" :key="group.id" class="group">
                <div class="group-label">{{ group.label }}</div>
                <div class="emoji-grid">
                  <button v-for="item in group.items" :key="item.name" type="button" class="emoji-btn" :class="{ active: item.char === modelValue }" @click="selectEmoji(item.char)" :aria-label="item.nameJa">
                    {{ item.char }}
                  </button>
                </div>
              </section>
            </div>

            <p v-else class="empty-state">該当する絵文字がありません。</p>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.open-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  padding: calc(var(--space-xs) - 1px) var(--space-md);
  border-radius: var(--border-radius);
  border: 1px solid var(--border);
  background: var(--bg-1);
  cursor: pointer;
}

.open-emoji,
.open-label {
  font-size: var(--text-size-sm);
}

.emoji-modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-md);
  z-index: 1200;
}

.emoji-modal {
  width: min(720px, 100%);
  max-height: min(80vh, 720px);
  background: var(--bg-0);
  border-radius: var(--border-radius);
  border: 1px solid var(--border);
  box-shadow: 0 24px 60px var(--shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-sm) var(--space-md);
  background: var(--bg-1);
}

.modal-header h3 {
  font-size: 1rem;
  margin: 0;
}

.close-btn {
  border-radius: 50%;
  width: 32px;
  height: 32px;
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
  display: grid;
  place-items: center;
}

.modal-body {
  padding: var(--space-sm) var(--space-md) var(--space-lg);
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.control-row {
  display: flex;
  gap: var(--space-sm);
  align-items: center;
}

.search-input {
  flex: 1;
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--border);
  background: var(--bg-1);
  border-radius: var(--border-radius);
}

.random-btn {
  padding: calc(var(--space-xs) - 1px) var(--space-sm);
  border-radius: var(--border-radius);
  border: 1px solid var(--border);
  background: var(--bg-1);
  cursor: pointer;
  white-space: nowrap;
}

// .preview {
//   display: flex;
//   align-items: center;
//   gap: var(--space-sm);
//   padding: var(--space-xs) var(--space-sm);
//   border-radius: var(--border-radius);
//   background: var(--bg-1);
//   border: 1px solid var(--border);
// }

// .preview-emoji {
//   font-size: var(--text-size-xl);
// }

// .preview-code {
//   font-size: var(--text-size-sm);
//   color: var(--text-light);
// }

// .preview-meta {
//   display: flex;
//   flex-direction: column;
//   gap: var(--space-xxs);
// }

// .preview-name {
//   font-size: var(--text-size-sm);
//   color: var(--text);
// }

.category-editor {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--text-size-sm);
}

.category-editor select {
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--border);
  background: var(--bg-1);
  border-radius: var(--border-radius);
}

.reset-btn {
  padding: calc(var(--space-xs) - 1px) var(--space-sm);
  border-radius: var(--border-radius);
  border: 1px solid var(--border);
  cursor: pointer;
  background: var(--bg-1);
}

.groups {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.group-label {
  font-size: var(--text-size-sm);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-light);
  margin-bottom: var(--space-xxs);
}

.emoji-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(36px, 1fr));
}

.emoji-btn {
  border: 1px solid transparent;
  border-radius: var(--border-radius);
  cursor: pointer;
  font-size: var(--text-size-xxl);
  height: 36px;
  display: grid;
  place-items: center;
  transition:
    transform 0.1s,
    border-color 0.1s;

  &:hover {
    transform: translateY(-1px);
    border-color: var(--border);
  }

  &.active {
    border-color: var(--primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 30%, transparent);
  }
}

.empty-state {
  font-size: var(--text-size-sm);
  color: var(--text-light);
}
</style>
