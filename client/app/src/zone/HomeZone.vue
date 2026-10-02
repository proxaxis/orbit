<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

// 初期幅設定
const navWidth = ref(260); // px
const subWidth = ref(360); // px
const isResizingNav = ref(false);
const isResizingSub = ref(false);

// リサイズ開始（Nav）
const startResizeNav = () => {
  isResizingNav.value = true;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
};

// リサイズ開始（Sub）
const startResizeSub = () => {
  isResizingSub.value = true;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
};

// 幅の最小値および最大値
const MIN_WIDTH_NAV = 260;
const MAX_WIDTH_NAV = 600;
const MIN_WIDTH_SUB = 260;
const MAX_WIDTH_SUB = 600;

// マウス移動時の処理
const handleMouseMove = (/** @type {MouseEvent} */ evt) => {
  if (isResizingNav.value) {
    const newWidth = evt.clientX;
    if (MIN_WIDTH_NAV <= newWidth && newWidth <= MAX_WIDTH_NAV) {
      navWidth.value = newWidth;
    }
  } else if (isResizingSub.value) {
    // 右端からの距離を計算
    const newWidth = window.innerWidth - evt.clientX;
    if (MIN_WIDTH_SUB <= newWidth && newWidth <= MAX_WIDTH_SUB) {
      subWidth.value = newWidth;
    }
  }
};

// リサイズ終了
const stopResize = () => {
  isResizingNav.value = false;
  isResizingSub.value = false;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
};

onMounted(() => {
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', stopResize);
});

onUnmounted(() => {
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('mouseup', stopResize);
});
</script>

<template>
  <div class="home-zone">
    <aside :style="{ width: `${navWidth}px` }">
      <router-view name="nav" />
    </aside>

    <div class="resize-handle" @mousedown="startResizeNav"></div>

    <main>
      <router-view />
    </main>

    <div class="resize-handle" @mousedown="startResizeSub"></div>

    <aside class="sub" :style="{ width: `${subWidth}px` }">
      <router-view name="sub" />
    </aside>
  </div>
</template>

<style lang="scss" scoped>
.home-zone {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

aside {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-1);
  padding: 1rem;
  height: 100vh;
  box-sizing: border-box;
}

main {
  display: flex;
  flex-direction: row;
  flex: 1 1 auto;
  overflow-y: auto;
  min-width: 0;
  background-color: var(--bg-0);
}

.resize-handle {
  width: 0.5rem;
  cursor: col-resize;
  background-color: var(--border);
  transition: background-color 0.2s;
  flex: 0 0 0.5rem;
  z-index: 10;

  &:hover,
  &:active {
    background-color: var(--primary);
  }
}
</style>
