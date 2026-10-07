<script setup>
import { ref, watch, nextTick } from 'vue';
import IconAngleRight from '@/components/icons/IconAngleRight.vue';
import IconAngleUp from '@/components/icons/IconAngleUp.vue';

const props = defineProps({
  /** summary スロット未使用時の見出しテキスト */
  label: {
    type: String,
    default: '',
  },
  /** 開閉状態（v-model:open で双方向バインド可能） */
  open: {
    type: Boolean,
    default: false,
  },
  useMenuSlot: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update:open']);

/** @type {Ref<boolean>} ユーザーの意図としての開閉状態 */
const isOpen = ref(props.open);
/** @type {Ref<boolean>} details の open 属性（閉じるアニメーション中も開いたままにする） */
const detailsOpen = ref(props.open);
/** @type {Ref<HTMLDivElement|null>} */
const rfContent = ref(null);
/** @type {(() => void)|null} 実行中アニメーションの終了待ちを中断する関数 */
let abortWaiting = null;

/**
 * transitionend またはタイムアウトでコールバックを実行する。
 * 新しいアニメーションが始まった場合は待ちを中断する。
 * @param {HTMLElement} el 高さ遷移を監視する要素
 * @param {() => void} callback 終了時に呼ぶ関数
 */
function afterTransition(el, callback) {
  abortWaiting?.();
  const timer = window.setTimeout(finish, 400);
  /** @param {TransitionEvent} event */
  const onEnd = (event) => {
    if (event.target !== el || event.propertyName !== 'height') return;
    finish();
  };
  function finish() {
    window.clearTimeout(timer);
    el.removeEventListener('transitionend', onEnd);
    if (abortWaiting === abort) abortWaiting = null;
    callback();
  }
  function abort() {
    window.clearTimeout(timer);
    el.removeEventListener('transitionend', onEnd);
    abortWaiting = null;
  }
  abortWaiting = abort;
  el.addEventListener('transitionend', onEnd);
}

/** コンテンツを下に伸ばしながら開く */
async function expand() {
  if (isOpen.value && detailsOpen.value) return;
  // 完全に閉じていた場合、open 適用直後のフォールバック CSS（height: auto）で実測が全高になるため 0 から始める
  const fromClosed = !detailsOpen.value;
  isOpen.value = true;
  emit('update:open', true);
  detailsOpen.value = true;
  await nextTick();

  const el = rfContent.value;
  if (!el) return;
  // 現在の高さからコンテンツの全高まで遷移させる（アニメーション中の反転にも対応）
  el.style.height = fromClosed ? '0px' : `${el.getBoundingClientRect().height}px`;
  void el.offsetHeight;
  el.style.height = `${el.scrollHeight}px`;
  afterTransition(el, () => {
    if (isOpen.value) el.style.height = 'auto';
  });
}

/** コンテンツを畳みながら閉じる（完了後に details を閉じる） */
function collapse() {
  if (!isOpen.value) return;
  isOpen.value = false;
  emit('update:open', false);

  const el = rfContent.value;
  if (!el) {
    detailsOpen.value = false;
    return;
  }
  el.style.height = `${el.getBoundingClientRect().height}px`;
  void el.offsetHeight;
  el.style.height = '0px';
  afterTransition(el, () => {
    if (!isOpen.value) detailsOpen.value = false;
  });
}

/** 開閉を切り替える */
function toggle() {
  if (isOpen.value) collapse();
  else expand();
}

watch(
  () => props.open,
  (value) => {
    if (value === isOpen.value) return;
    if (value) expand();
    else collapse();
  },
);

defineExpose({
  open: expand,
  close: collapse,
  toggle,
});
</script>

<template>
  <details class="accordion-menu" :open="detailsOpen">
    <summary :aria-expanded="isOpen" @click.prevent="toggle">
      <div class="toggle-area">
        <span class="summary-label"
          ><slot name="summary">{{ label }}</slot></span
        >
        <span class="caret" :data-open="isOpen">
          <IconAngleUp v-if="isOpen" size="0.8em" />
          <IconAngleRight v-else size="0.8em" />
        </span>
      </div>
      <div class="menu-area" v-if="props.useMenuSlot">
        <slot name="menu"></slot>
      </div>
    </summary>
    <div ref="rfContent" class="accordion-content">
      <slot></slot>
    </div>
  </details>
</template>

<style lang="scss" scoped>
.accordion-menu {
  > summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);

    .toggle-area {
      flex: 1 1 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-sm);
      padding: var(--space-sm) var(--space-md);
      cursor: pointer;
      user-select: none;
      list-style: none;
      border-radius: var(--border-radius, 6px);
      transition: background-color 0.15s ease;

      &::-webkit-details-marker {
        display: none;
      }

      &::marker {
        content: none;
      }

      &:hover {
        background-color: var(--bg-2);
      }
    }
  }

  .summary-label {
    flex: 1;
    min-width: 0;
  }

  .caret {
    display: inline-flex;
    color: var(--text-light);

    svg {
      animation: caret-in 0.25s ease;
    }
  }

  .accordion-content {
    height: 0;
    overflow: hidden;
    transition: height 0.25s ease;
  }

  &[open] > summary {
    margin-bottom: var(--space-xxs);
  }

  // JS による高さ制御前（初期 open / スクリプト未実行）でも内容が見えるようにする
  &[open] .accordion-content:not([style]) {
    height: auto;
  }
}

@keyframes caret-in {
  from {
    opacity: 0;
    transform: scale(0.6);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .accordion-menu {
    .caret svg {
      animation: none;
    }

    .accordion-content {
      transition-duration: 0.01s;
    }
  }
}
</style>
