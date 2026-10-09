<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import emojiData from '@/assets/emoji-data.json';
import { CACHE_KEYS, readCache, writeCache } from '@/composables/useCache.js';
import IconXMark from '@/components/icons/IconXMark.vue';
import InlineEmoji from '@/components/InlineEmoji.vue';

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
/** @type {Array<{id: string, label: string}>} */
const categories = [{ id: 'history', label: '履歴' }, ...Object.keys(emojiData).map((key) => ({ id: key, label: key }))];
const categoryLabelMap = Object.fromEntries(categories.map((category) => [category.id, category.label]));
const editableCategoryIds = new Set(categories.filter((category) => category.id !== 'history').map((category) => category.id));
const defaultCategoryId = categories.find((category) => category.id !== 'history').id;
const historyKey = CACHE_KEYS.EMOJI_HISTORY;
const storageKey = CACHE_KEYS.EMOJI_CATEGORY_OVERRIDES;
const maxHistory = 48;
const historyList = ref([]);
const pickedEmoji = ref(null);
const activeCategory = ref('history');

/** カテゴリー上書き設定をキャッシュから読み込む */
const loadOverrides = async () => {
  const saved = await readCache(storageKey, {});
  categoryOverrides.value = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
};

/** カテゴリー上書き設定をキャッシュへ保存する */
const persistOverrides = async () => {
  await writeCache(storageKey, categoryOverrides.value);
};

/** 絵文字の使用履歴をキャッシュから読み込む */
const loadHistory = async () => {
  const saved = await readCache(historyKey, []);
  historyList.value = Array.isArray(saved) ? saved : [];
  if (!historyList.value.length && activeCategory.value === 'history') {
    activeCategory.value = defaultCategoryId;
  }
};

/** 絵文字の使用履歴をキャッシュへ保存する */
const persistHistory = async () => {
  await writeCache(historyKey, historyList.value);
};

Promise.all([loadOverrides(), loadHistory()]);

watch(categoryOverrides, () => persistOverrides(), { deep: true });
watch(historyList, () => persistHistory(), { deep: true });

const editableCategories = computed(() => {
  return categories.filter((category) => category.id !== 'history');
});

const normalizedItems = computed(() => {
  return Object.entries(emojiData).flatMap(([category, items]) =>
    items.map((item) => {
      const override = categoryOverrides.value[item.char];
      return {
        ...item,
        category: editableCategoryIds.has(override) ? override : category,
      };
    }),
  );
});

/** @param {string} emoji 使用履歴へ追加する絵文字 */
const addToHistory = (emoji) => {
  if (!emoji) return;
  const exists = normalizedItems.value.some((item) => item.char === emoji);
  if (!exists) return;
  const nextList = historyList.value.filter((char) => char !== emoji);
  nextList.unshift(emoji);
  historyList.value = nextList.slice(0, maxHistory);
};

/** @param {Object} item 絵文字データ @param {string} query 検索クエリ @returns {boolean} クエリに一致するか */
const matchesQuery = (item, query) => {
  if (!query) return true;
  const haystack = [item.name, categoryLabelMap[item.category] || item.category].join(' ').toLowerCase();
  return query.split(/\s+/).every((token) => haystack.includes(token));
};

/** @param {Object[]} items 絵文字データ @returns {Object[]} 文字重複を除いた一覧 */
const uniqueByChar = (items) => {
  return [...new Map(items.map((item) => [item.char, item])).values()];
};

const isSearching = computed(() => search.value.trim().length > 0);

const activeItems = computed(() => {
  if (activeCategory.value === 'history') {
    return historyList.value.map((char) => normalizedItems.value.find((item) => item.char === char)).filter(Boolean);
  }
  return uniqueByChar(normalizedItems.value.filter((item) => item.category === activeCategory.value));
});

const flatEmojiItems = computed(() => {
  const query = search.value.trim().toLowerCase();
  return uniqueByChar(normalizedItems.value.filter((item) => matchesQuery(item, query)));
});

const selectedItem = computed(() => {
  return normalizedItems.value.find((item) => item.char === props.modelValue) || null;
});

const previewCodepoints = computed(() => {
  if (!props.modelValue) return '';
  return [...props.modelValue].map((char) => `U+${char.codePointAt(0).toString(16).toUpperCase()}`).join(' ');
});

/** @param {string} emoji 選択された絵文字を確定する */
const selectEmoji = (emoji) => {
  addToHistory(emoji);
  emit('update:modelValue', emoji);
  closeModal();
};

/** @param {Event} event カテゴリー選択の変更イベント */
const updateCategory = (event) => {
  if (!selectedItem.value) return;
  const nextCategory = event.target.value;
  categoryOverrides.value[selectedItem.value.char] = nextCategory;
};

/** 選択したカテゴリー上書きをリセットする */
const resetCategory = () => {
  if (!selectedItem.value) return;
  delete categoryOverrides.value[selectedItem.value.char];
};

/** ランダムな絵文字を選択する */
const randomEmoji = () => {
  const list = flatEmojiItems.value;
  if (!list.length) return;
  const index = Math.floor(Math.random() * list.length);
  const picked = list[index].char;
  pickedEmoji.value = picked;
  addToHistory(picked);
  emit('update:modelValue', picked);
};

/** 絵文字選択モーダルを開く */
const openModal = async () => {
  isOpen.value = true;
  await nextTick();
  if (searchInput.value) {
    searchInput.value.focus();
  }
};

/** 絵文字選択モーダルを閉じる */
const closeModal = () => {
  isOpen.value = false;
};

/** @param {MouseEvent} event オーバーレイクリックでモーダルを閉じる */
const handleOverlayClick = (event) => {
  if (event.target === event.currentTarget) {
    closeModal();
  }
};

/** @param {KeyboardEvent} event Esc キーでモーダルを閉じる */
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
      <span v-if="modelValue" class="open-emoji"><InlineEmoji :emoji="modelValue" /></span>
      <span v-else class="open-label"><InlineEmoji emoji="📌" /></span>
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

            <template v-if="isSearching">
              <div v-if="flatEmojiItems.length" class="emoji-grid">
                <button v-for="item in flatEmojiItems" :key="item.char" type="button" class="emoji-btn" :class="{ active: item.char === modelValue }" @click="selectEmoji(item.char)" :aria-label="item.name">
                  <InlineEmoji :emoji="item.char" />
                </button>
              </div>
              <p v-else class="empty-state">該当する絵文字がありません</p>
            </template>

            <template v-else>
              <div class="tab-bar" role="tablist" aria-label="絵文字カテゴリ">
                <button v-for="category in categories" :key="category.id" type="button" role="tab" class="tab-btn" :class="{ active: activeCategory === category.id }" :aria-selected="activeCategory === category.id" @click="activeCategory = category.id">
                  {{ category.label }}
                </button>
              </div>
              <div v-if="activeItems.length" class="emoji-grid" role="tabpanel">
                <button v-for="item in activeItems" :key="item.char" type="button" class="emoji-btn" :class="{ active: item.char === modelValue }" @click="selectEmoji(item.char)" :aria-label="item.name">
                  <InlineEmoji :emoji="item.char" />
                </button>
              </div>
              <p v-else class="empty-state">{{ activeCategory === 'history' ? '履歴はまだありません' : '絵文字がありません' }}</p>
            </template>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.open-btn {
  background-color: var(--bg-2);
  border: 1px solid var(--border);
  &:hover {
    background-color: var(--bg-3);
  }
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
  height: min(80vh, 720px);
  background: var(--bg-0);
  border-radius: var(--border-radius);
  border: 1px solid var(--border);
  box-shadow: 0 6px 16px var(--shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-sm) var(--space-xs) var(--space-sm) calc(var(--space-sm) * 2);
  background: var(--bg-1);
}

.modal-header h3 {
  font-size: 1rem;
  margin: 0;
}

.close-btn {
  background: transparent;
  &:hover {
    background-color: var(--bg-2);
  }
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
}

.random-btn {
  background: var(--bg-2);
  border: 1px solid var(--border);
  padding: var(--space-xs) var(--space-sm);
  &:hover {
    background-color: var(--bg-3);
  }
}

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

.tab-bar {
  display: flex;
  gap: var(--space-xxs);
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
  position: sticky;
  top: calc(var(--space-sm) * -1);
  background: var(--bg-0);
  z-index: 1;
}

.tab-btn {
  background: transparent;
  border-radius: 0;
  border-bottom: 2px solid transparent;
  padding: var(--space-xs) var(--space-sm);
  font-size: var(--text-size-sm);
  color: var(--text-light);
  white-space: nowrap;

  &:hover {
    color: var(--text);
    background-color: var(--bg-1);
  }

  &.active {
    color: var(--text);
    border-bottom-color: var(--primary);
  }
}

.emoji-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(36px, 1fr));
}

.emoji-btn {
  background: transparent;
  font-size: var(--text-size-xxl);

  &:hover {
    transform: translateY(-4px);
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
