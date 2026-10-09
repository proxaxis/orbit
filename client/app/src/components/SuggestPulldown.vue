<script setup>
/**
 * 入力ボックスとサジェストプルダウンの共通コンポーネント。
 * v-model で入力文字列を双方向バインドし、suggestions に渡した項目を
 * フォーカス中にプルダウン表示する。項目選択は select イベントで通知する。
 */
import { computed, ref } from 'vue';

const props = defineProps({
  /** @type {import('vue').PropType<any[]>} サジェスト候補（文字列または slot で描画する任意のアイテム） */
  suggestions: { type: Array, default: () => [] },
  /** 候補取得中（「検索中...」行を表示する） */
  isSearching: { type: Boolean, default: false },
  /** 検索中に表示するテキスト */
  searchingText: { type: String, default: '検索中...' },
  /** 候補が空のときに空行を表示するか */
  showEmpty: { type: Boolean, default: false },
  /** 候補が空のときに表示するテキスト */
  emptyText: { type: String, default: '候補が見つかりません' },
  /** extra スロットの行を表示するか（例: 未知のメールアドレスを追加する行） */
  showExtra: { type: Boolean, default: false },
  placeholder: { type: String, default: '' },
  inputId: { type: String, default: '' },
  ariaLabel: { type: String, default: '' },
  autocomplete: { type: String, default: 'off' },
  inputmode: { type: String, default: '' },
  maxlength: { type: [Number, String], default: undefined },
  required: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  autofocus: { type: Boolean, default: false },
  /** data-enter-focus を付与するか（フォーム内で Enter によるフォーカス移動を有効化） */
  enterFocus: { type: Boolean, default: false },
  /** @type {import('vue').PropType<(item: any) => string|number|null>} :key 導出関数（アイテムが文字列でない場合に指定） */
  itemKey: { type: Function, default: null },
});

/** @type {ModelRef<string>} 入力文字列 */
const model = defineModel({ type: String, default: '' });

const emit = defineEmits(['select', 'focus', 'blur', 'enter', 'keydown']);

const isFocused = ref(false);
/** @type {Ref<boolean>} 選択・Esc による一時的な閉鎖状態（次の入力で再オープン） */
const dismissed = ref(false);
const activeIndex = ref(-1);

/** @type {ComputedRef<boolean>} プルダウンを開いているか */
const isOpen = computed(() => isFocused.value && !dismissed.value && (props.isSearching || props.suggestions.length > 0 || props.showExtra || props.showEmpty));

/** @param {any} item @param {number} index @returns {string|number} li の key */
function keyOf(item, index) {
  if (props.itemKey) return props.itemKey(item) ?? index;
  return typeof item === 'string' ? item : index;
}

/** @param {any} item @returns {string} 既定描画用ラベル */
function labelOf(item) {
  if (typeof item === 'string') return item;
  return item?.label ?? '';
}

/** @param {FocusEvent} evt */
function onFocus(evt) {
  isFocused.value = true;
  dismissed.value = false;
  emit('focus', evt);
}

/** @param {FocusEvent} evt */
function onBlur(evt) {
  isFocused.value = false;
  emit('blur', evt);
}

/** 入力があれば閉鎖状態を解除して候補を再表示する */
function onInput() {
  dismissed.value = false;
  activeIndex.value = -1;
}

/** @param {any} item 候補を選択して通知する */
function selectItem(item) {
  emit('select', item);
  activeIndex.value = -1;
  dismissed.value = true;
}

/** @param {KeyboardEvent} evt 矢印キー移動・Enter 選択・Esc 閉鎖 */
function onKeydown(evt) {
  if (evt.key === 'ArrowDown' || evt.key === 'ArrowUp') {
    if (!isOpen.value || !props.suggestions.length) return;
    evt.preventDefault();
    const dir = evt.key === 'ArrowDown' ? 1 : -1;
    activeIndex.value = (activeIndex.value + dir + props.suggestions.length) % props.suggestions.length;
    return;
  }
  if (evt.key === 'Enter') {
    const active = activeIndex.value >= 0 ? props.suggestions[activeIndex.value] : undefined;
    if (isOpen.value && active !== undefined) {
      evt.preventDefault();
      selectItem(active);
      return;
    }
    emit('enter', evt);
  } else if (evt.key === 'Escape' && isOpen.value) {
    dismissed.value = true;
  }
  emit('keydown', evt);
}
</script>

<template>
  <div class="suggest-pulldown">
    <input
      :id="props.inputId || undefined"
      v-model="model"
      type="text"
      :placeholder="props.placeholder"
      :aria-label="props.ariaLabel || undefined"
      :autocomplete="props.autocomplete"
      :inputmode="props.inputmode || undefined"
      :maxlength="props.maxlength ?? undefined"
      :required="props.required"
      :disabled="props.disabled"
      :autofocus="props.autofocus"
      :data-enter-focus="props.enterFocus || undefined"
      :aria-expanded="isOpen"
      role="combobox"
      @focus="onFocus"
      @blur="onBlur"
      @input="onInput"
      @keydown="onKeydown" />
    <ul v-if="isOpen" class="suggest-list">
      <li v-if="props.isSearching" class="suggest-status">{{ props.searchingText }}</li>
      <li v-for="(item, index) in props.suggestions" :key="keyOf(item, index)" :class="{ 'is-active': index === activeIndex }">
        <button type="button" @mousedown.prevent="selectItem(item)" @mouseenter="activeIndex = index">
          <slot name="suggestion" :item="item">{{ labelOf(item) }}</slot>
        </button>
      </li>
      <li v-if="!props.isSearching && !props.suggestions.length && props.showEmpty" class="suggest-status">{{ props.emptyText }}</li>
      <template v-if="props.showExtra">
        <slot name="extra" />
      </template>
    </ul>
  </div>
</template>

<style lang="scss" scoped>
.suggest-pulldown {
  position: relative;
  display: flex;
  flex-direction: column;

  > input {
    width: 100%;
  }

  .suggest-list {
    position: absolute;
    top: calc(100% + var(--space-xxs));
    left: 0;
    right: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: var(--space-xxs);
    margin: 0;
    padding: var(--space-xs);
    border: 1px solid var(--border);
    border-radius: var(--border-radius);
    background: var(--bg-2);
    box-shadow: 0 4px 12px rgb(0 0 0 / 15%);
    list-style: none;
    max-height: 16rem;
    overflow-y: auto;

    .suggest-status {
      padding: var(--space-xs) var(--space-sm);
      color: var(--text-light);
      font-size: var(--text-size-sm);
    }

    button {
      display: flex;
      flex-direction: column;
      width: 100%;
      align-items: flex-start;
      padding: var(--space-xs) var(--space-sm);
      border: 0;
      background: transparent;
      text-align: left;

      &:hover {
        background: var(--bg-3);
      }

      small {
        color: var(--text-light);
        overflow-wrap: anywhere;
      }
    }

    li.is-active button {
      background: var(--bg-3);
    }
  }
}
</style>
