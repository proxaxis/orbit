<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import emojiData from '@/assets/emoji-data.json';

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

const loadOverrides = () => {
	try {
		const raw = localStorage.getItem(storageKey);
		categoryOverrides.value = raw ? JSON.parse(raw) : {};
	} catch (error) {
		categoryOverrides.value = {};
	}
};

const persistOverrides = () => {
	localStorage.setItem(storageKey, JSON.stringify(categoryOverrides.value));
};

loadOverrides();

const loadHistory = () => {
	try {
		const raw = localStorage.getItem(historyKey);
		const parsed = raw ? JSON.parse(raw) : [];
		historyList.value = Array.isArray(parsed) ? parsed : [];
	} catch (error) {
		historyList.value = [];
	}
};

const persistHistory = () => {
	localStorage.setItem(historyKey, JSON.stringify(historyList.value));
};

loadHistory();

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
	const haystack = [
		item.nameJa,
		item.nameEn,
		categoryLabelMap.value[item.category] || '',
	].join(' ').toLowerCase();
	return query.split(/\s+/).every((token) => haystack.includes(token));
};

const filteredGroups = computed(() => {
	const query = search.value.trim().toLowerCase();
	const historyLabel = categoryLabelMap.value.history || '履歴';
	const historyItems = historyList.value
		.map((char) => normalizedItems.value.find((item) => item.char === char))
		.filter((item) => item && matchesQuery(item, query));

	const baseGroups = categories
		.filter((category) => category.id !== 'history')
		.map((category) => ({
			...category,
			items: normalizedItems.value.filter(
				(item) => item.category === category.id && matchesQuery(item, query),
			),
		}));

	const grouped = historyItems.length
		? [{ id: 'history', label: historyLabel, items: historyItems }, ...baseGroups]
		: baseGroups;

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
	return [...props.modelValue]
		.map((char) => `U+${char.codePointAt(0).toString(16).toUpperCase()}`)
		.join(' ');
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
			<span class="open-label">絵文字を選択</span>
		</button>

		<Teleport to="body">
			<div v-if="isOpen" class="emoji-modal-overlay" @click="handleOverlayClick">
				<div class="emoji-modal" role="dialog" aria-modal="true" aria-label="絵文字を選択">
					<header class="modal-header">
						<h3>絵文字を選択</h3>
						<button type="button" class="close-btn" @click="closeModal" aria-label="閉じる">
							×
						</button>
					</header>
					<div class="modal-body">
						<div class="control-row">
							<input ref="searchInput" v-model="search" type="text" class="search-input" placeholder="絵文字を検索"
								aria-label="絵文字の検索" />
							<button type="button" class="random-btn" @click="randomEmoji">
								ランダム
							</button>
						</div>

						<div class="preview" v-if="modelValue">
							<div class="preview-emoji">{{ modelValue }}</div>
							<div class="preview-meta">
								<div class="preview-code">{{ previewCodepoints }}</div>
								<div v-if="selectedItem" class="preview-name">
									{{ selectedItem.nameJa }} / {{ selectedItem.nameEn }}
								</div>
							</div>
						</div>

						<div v-if="selectedItem" class="category-editor">
							<label for="emoji-category">カテゴリ</label>
							<select id="emoji-category" :value="selectedItem.category" @change="updateCategory">
								<option v-for="category in editableCategories" :key="category.id" :value="category.id">
									{{ category.label }}
								</option>
							</select>
							<button type="button" class="reset-btn" @click="resetCategory">デフォルト</button>
						</div>

						<div v-if="filteredGroups.length" class="groups">
							<section v-for="group in filteredGroups" :key="group.id" class="group">
								<div class="group-label">{{ group.label }}</div>
								<div class="emoji-grid">
									<button v-for="item in group.items" :key="item.name" type="button" class="emoji-btn"
										:class="{ active: item.char === modelValue }" @click="selectEmoji(item.char)"
										:aria-label="item.nameJa">
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
.emoji-selecter {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.open-btn {
	display: inline-flex;
	align-items: center;
	gap: 10px;
	padding: 10px 14px;
	border-radius: var(--border-radius);
	border: 1px solid var(--border);
	background: var(--bg-1);
	cursor: pointer;
}

.open-emoji {
	font-size: 22px;
}

.open-label {
	font-size: 0.95rem;
}

.emoji-modal-overlay {
	position: fixed;
	inset: 0;
	background: rgba(0, 0, 0, 0.45);
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 20px;
	z-index: 1200;
}

.emoji-modal {
	width: min(720px, 100%);
	max-height: min(80vh, 720px);
	background: var(--bg-0);
	border-radius: 16px;
	border: 1px solid var(--border);
	box-shadow: 0 24px 60px rgba(0, 0, 0, 0.25);
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

.modal-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 14px 18px;
	border-bottom: 1px solid var(--border);
}

.modal-header h3 {
	font-size: 1rem;
	margin: 0;
}

.close-btn {
	border: 1px solid var(--border);
	background: var(--bg-1);
	border-radius: 999px;
	width: 32px;
	height: 32px;
	cursor: pointer;
	font-size: 20px;
	line-height: 1;
	display: grid;
	place-items: center;
}

.modal-body {
	padding: 16px 18px 20px;
	overflow: auto;
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.control-row {
	display: flex;
	gap: 8px;
	align-items: center;
}

.search-input {
	flex: 1;
	padding: 8px 12px;
	border-radius: var(--border-radius);
}

.random-btn {
	padding: 8px 12px;
	border-radius: var(--border-radius);
	cursor: pointer;
	white-space: nowrap;
}

.preview {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 8px 12px;
	border-radius: var(--border-radius);
	background: var(--bg-1);
	border: 1px solid var(--border);
}

.preview-emoji {
	font-size: 28px;
}

.preview-code {
	font-size: 0.85rem;
	color: var(--text-light);
}

.preview-meta {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.preview-name {
	font-size: 0.85rem;
	color: var(--text);
}

.category-editor {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 0.9rem;
}

.category-editor select {
	padding: 6px 8px;
	border-radius: var(--border-radius);
}

.reset-btn {
	padding: 6px 10px;
	border-radius: var(--border-radius);
	cursor: pointer;
}

.groups {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.group-label {
	font-size: 0.85rem;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--text-light);
	margin-bottom: 6px;
}

.emoji-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(36px, 1fr));
	gap: 6px;
}

.emoji-btn {
	border: 1px solid transparent;
	border-radius: 8px;
	cursor: pointer;
	font-size: 20px;
	height: 36px;
	display: grid;
	place-items: center;
	transition: transform 0.1s, border-color 0.1s;

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
	font-size: 0.9rem;
	color: var(--text-light);
}
</style>
