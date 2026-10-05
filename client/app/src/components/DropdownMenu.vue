<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue';

const isOpen = ref(false);
const rfContainer = ref(null);
const screenWidth = ref(window.innerWidth);
const position = ref({ top: 0, left: 0 });

const calculatePosition = async (event = null) => {
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
    top: event ? `${event.clientY}px` : `${rect.bottom}px`,
    left: `${proposedLeft}px`,
  };

  // 次のフレームでメニューが描画された後、実際の幅を取得
  await nextTick();
  const menu = document.querySelector('.dropdown-content');
  if (menu) {
    const menuRect = menu.getBoundingClientRect();

    // メニューが画面右端を超えている場合、左にシフト
    if (menuRect.right > screenWidth.value - marginRight) {
      const offset = menuRect.right - (screenWidth.value - marginRight);
      const newLeft = proposedLeft - offset;

      // さらに左シフトしてボタンの左端を超える場合は、ボタン右端に合わせる
      position.value.left = `${Math.max(newLeft, marginRight)}px`;
    }
  }
};

// メニューを開く
const openMenu = async (event = null) => {
  isOpen.value = true;
  await calculatePosition(event);
};

// メニューを閉じる
const closeMenu = () => {
  isOpen.value = false;
};

// 外側クリックおよび外側右クリックの検知
const handleClickOutside = (event) => {
  if (!isOpen.value || (rfContainer.value && rfContainer.value.contains(event.target))) return;
  closeMenu();
};

// ウィンドウリサイズやスクロール時に位置がずれるのを防ぐため閉じる
const handleScroll = () => {
  if (isOpen.value) closeMenu();
};

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
    <div @click.stop="toggleMenu" @click.right.prevent="toggleMenu" class="dropdown-button">
      <slot name="button"></slot>
    </div>

    <teleport to="body">
      <transition name="fade">
        <div v-if="isOpen" class="dropdown-content" :style="{ ...position }" @click.stop="closeMenu" @contextmenu.prevent>
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
}

.dropdown-button {
  cursor: pointer;
  user-select: none;
  display: flex;
}

.dropdown-content {
  position: fixed;
  gap: var(--space-sm);
  margin-top: var(--space-xs);
  background-color: var(--bg-1);
  min-width: 160px;
  box-shadow: 0 4px 12px var(--shadow);
  border-radius: var(--border-radius);
  border: 1px solid var(--border);
  z-index: 9999;
  overflow: hidden;
  padding: var(--space-xs) 0;

  :deep(button) {
    width: 100%;
    padding: var(--space-xs) var(--space-md);
    background: none;
    border: none;
    text-align: left;
    cursor: pointer;
    font-size: 1rem;
    color: var(--text);
    display: flex;
    align-items: center;
    gap: var(--space-sm);

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
