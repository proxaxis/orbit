<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue';

const emit = defineEmits(['close']);

const isOpen = ref(false);
/** @type {Ref<HTMLElement|null>} */
const rfContainer = ref(null);
/** @type {Ref<HTMLElement|null>} */
const rfMenu = ref(null);
const screenWidth = ref(window.innerWidth);
/** @type {Ref<{top: number, left: number}>} */
const position = ref({ top: 0, left: 0 });

/** @param {MouseEvent|null} event */
const calculatePosition = async (event = null) => {
  if (!rfContainer.value) return;
  const rect = rfContainer.value.getBoundingClientRect();
  const marginRight = 8; // 画面右端との余白

  // クリックイベントがあればその位置に、なければボタンの左下に表示
  let proposedLeft = 0;
  if (event) {
    proposedLeft = event.clientX;
  } else if (rfContainer.value) {
    proposedLeft = rect.left;
  }

  // メニューの位置を仮設定
  position.value = {
    top: event ? event.clientY : rect.bottom,
    left: proposedLeft,
  };

  // nextTick 後は DOM 反映済み・ブラウザのペイント前なので、実測幅から位置を
  // 補正しても途中位置が描画されず、右端でも滑らかに正しい位置へ表示される
  await nextTick();
  const menuWidth = rfMenu.value?.getBoundingClientRect().width;
  if (menuWidth === undefined) return;
  const maxLeft = Math.max(marginRight, window.innerWidth - menuWidth - marginRight);
  position.value.left = Math.min(Math.max(proposedLeft, marginRight), maxLeft);
};

// メニューを開く
/** @param {MouseEvent|null} event メニューを開く位置の基準イベント */
const openMenu = async (event = null) => {
  isOpen.value = true;
  await calculatePosition(event);
};

// メニューを閉じる
/** メニューを閉じる */
const closeMenu = () => {
  if (!isOpen.value) return;
  isOpen.value = false;
  emit('close');
};

// 外側クリックおよび外側右クリックの検知
/** @param {MouseEvent} event */
const handleClickOutside = (event) => {
  const target = event.target;
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  if (!isOpen.value || !(target instanceof Node) || (rfContainer.value && rfContainer.value.contains(target)) || (rfMenu.value && rfMenu.value.contains(target)) || (rfContainer.value && path.includes(rfContainer.value)) || (rfMenu.value && path.includes(rfMenu.value))) return;
  closeMenu();
};

// ウィンドウリサイズやスクロール時に位置がずれるのを防ぐため閉じる
/** スクロール時にメニューを閉じる */
const handleScroll = () => {
  if (isOpen.value) closeMenu();
};

/** 画面リサイズ時にメニューを閉じる */
const handleResize = () => {
  screenWidth.value = window.innerWidth;
  if (isOpen.value) {
    closeMenu();
  }
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
  document.addEventListener('contextmenu', handleClickOutside, true);
  window.addEventListener('scroll', handleScroll, true);
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
  document.removeEventListener('contextmenu', handleClickOutside, true);
  window.removeEventListener('scroll', handleScroll, true);
  window.removeEventListener('resize', handleResize);
});

// メニューの開閉を切り替え
/** メニューの開閉を切り替える */
const toggleMenu = async () => {
  if (isOpen.value) {
    closeMenu();
  } else {
    openMenu();
  }
};

// 親から制御できるように公開
defineExpose({
  toggle: toggleMenu,
  open: openMenu,
  close: closeMenu,
});
</script>

<template>
  <div class="dropdown-menu" ref="rfContainer">
    <div @pointerdown.stop @click.stop="toggleMenu" @click.right.prevent="toggleMenu" class="dropdown-button">
      <slot name="button"></slot>
    </div>

    <teleport to="body">
      <transition name="fade">
        <div ref="rfMenu" v-if="isOpen" class="dropdown-content" :style="{ top: `${position.top}px`, left: `${position.left}px` }" @pointerdown.stop @click.stop="closeMenu" @contextmenu.prevent>
          <slot></slot>
        </div>
      </transition>
    </teleport>
  </div>
</template>

<style lang="scss" scoped>
.dropdown-menu {
  position: relative;
  display: inline-block;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dropdown-button {
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dropdown-content {
  position: fixed;
  box-sizing: border-box;
  gap: var(--space-sm);
  margin-top: var(--space-xs);
  background-color: var(--bg-1);
  border-radius: var(--border-radius);
  min-width: 160px;
  box-shadow: 0 2px 6px var(--shadow);
  z-index: 9999;
  overflow: hidden;
  padding: var(--space-xs) 0;

  :deep(> button) {
    /* ドロップダウン内のボタンは App.vue 定義の共通スタイルを上書きする */
    border-radius: 0;
    text-align: left;
    justify-content: flex-start;
    width: 100%;
    font-size: var(--text-size-md);
    background-color: var(--bg-1);
    padding: var(--space-sm) var(--space-md);

    &:hover {
      background-color: var(--bg-2);
    }

    &.danger {
      color: var(--danger);
    }
  }
}

.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 0.1s,
    transform 0.1s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-5px);
}
</style>
