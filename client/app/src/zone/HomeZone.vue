<script setup>
import { computed, reactive, ref, onMounted, onUnmounted, provide, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useUserStore } from '@/stores/user.js';

const route = useRoute();
const userStore = useUserStore();

// 初期幅設定
const navWidth = ref(userStore.navPaneWidth);
const subWidth = ref(userStore.subPaneWidth);
const isResizingNav = ref(false);
const isResizingSub = ref(false);
/** @type {Ref<number|null>} 右ペインのリサイズ開始 X 座標 */
const subResizeStartX = ref(null);
/** @type {Ref<number>} 右ペインのリサイズ開始幅 */
const subResizeStartWidth = ref(360);
/** @type {Ref<number>} モバイル右ペインの高さ */
const mobileSubPaneHeight = ref(typeof window !== 'undefined' ? Math.min(300, Math.max(160, window.innerHeight * 0.34)) : 240);
const isResizingMobileSub = ref(false);
const mobileSubResizeStartY = ref(0);
const mobileSubResizeStartHeight = ref(0);
/** @type {Ref<'main'|'nav'|'sub'>} 現在表示しているペイン */
const activePane = ref('main');
/** @type {{left: number, right: number}} 展開バーの縦位置（百分率） */
const togglePositions = reactive({ left: 35, right: 35 });
/** @type {Ref<'left'|'right'|null>} ドラッグ中の展開バー */
const draggingToggle = ref(/** @type {'left'|'right'|null} */(null));
const toggleDragStartY = ref(0);
const toggleDragStartPosition = ref(35);
const layoutMode = computed(() => {
  if (userStore.isMobile) return 'mobile';
  if (userStore.isTablet) return 'tablet';
  return 'desktop';
});

const subPaneRoutes = new Set(['EventCreator', 'EventDetail', 'EventEditor', 'SharingConfig', 'CalendarCreator', 'CalendarDetail', 'UserConfig']);

const selectPane = /** @type {(pane: 'main'|'nav'|'sub') => void} */ ((pane) => {
  activePane.value = pane;
});

provide('selectPane', selectPane);

/** 現在開いているペインを閉じる */
function closePane() {
  activePane.value = 'main';
}

/** @param {'left'|'right'} side @param {PointerEvent} evt */
function startToggleDrag(side, evt) {
  draggingToggle.value = side;
  toggleDragStartY.value = evt.clientY;
  toggleDragStartPosition.value = togglePositions[side];
  if (evt.currentTarget instanceof HTMLElement) evt.currentTarget.setPointerCapture(evt.pointerId);
}

/** @param {PointerEvent} evt */
function moveToggle(evt) {
  if (!draggingToggle.value || window.innerHeight <= 0) return;
  const deltaPercent = ((evt.clientY - toggleDragStartY.value) / window.innerHeight) * 100;
  const side = draggingToggle.value;
  if (side) togglePositions[side] = Math.min(88, Math.max(4, toggleDragStartPosition.value + deltaPercent));
}

function stopToggleDrag() {
  draggingToggle.value = null;
}

/** @param {PointerEvent} evt 下部ペインのリサイズ開始イベント */
function startMobileSubResize(evt) {
  isResizingMobileSub.value = true;
  mobileSubResizeStartY.value = evt.clientY;
  mobileSubResizeStartHeight.value = mobileSubPaneHeight.value;
  if (evt.currentTarget instanceof HTMLElement) evt.currentTarget.setPointerCapture(evt.pointerId);
}

/** @param {PointerEvent} evt 下部ペインのリサイズイベント */
function resizeMobileSub(evt) {
  if (!isResizingMobileSub.value) return;
  const maxHeight = Math.max(240, window.innerHeight * 0.75);
  const nextHeight = mobileSubResizeStartHeight.value + mobileSubResizeStartY.value - evt.clientY;
  mobileSubPaneHeight.value = Math.min(maxHeight, Math.max(160, nextHeight));
}

/** 下部ペインのリサイズを終了 */
function stopMobileSubResize() {
  isResizingMobileSub.value = false;
}

/** @param {unknown} routeName 現在のルート名 */
function selectPaneForRoute(routeName) {
  if (layoutMode.value === 'mobile') activePane.value = subPaneRoutes.has(String(routeName)) ? 'sub' : 'main';
  else if (layoutMode.value === 'tablet') activePane.value = 'main';
}

// リサイズ開始（Nav）
const startResizeNav = () => {
  isResizingNav.value = true;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
};

// リサイズ開始（Sub）
const startResizeSub = (/** @type {MouseEvent} */ evt) => {
  isResizingSub.value = true;
  subResizeStartX.value = evt.clientX;
  subResizeStartWidth.value = subWidth.value;
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
  } else if (isResizingSub.value && subResizeStartX.value !== null) {
    // ハンドルを左へ動かすと右ペインを広げ、右へ動かすと狭める
    const newWidth = subResizeStartWidth.value + subResizeStartX.value - evt.clientX;
    if (MIN_WIDTH_SUB <= newWidth && newWidth <= MAX_WIDTH_SUB) {
      subWidth.value = newWidth;
    }
  }
};

// リサイズ終了
const stopResize = () => {
  isResizingNav.value = false;
  isResizingSub.value = false;
  subResizeStartX.value = null;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
};

watch(navWidth, (width) => userStore.setNavPaneWidth(width));
watch(subWidth, (width) => userStore.setSubPaneWidth(width));

onMounted(() => {
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', stopResize);
  window.addEventListener('pointermove', moveToggle);
  window.addEventListener('pointerup', stopToggleDrag);
  window.addEventListener('pointermove', resizeMobileSub);
  window.addEventListener('pointerup', stopMobileSubResize);
});

watch(() => route.name, selectPaneForRoute, { immediate: true });
watch(layoutMode, (mode) => {
  if (mode === 'desktop') activePane.value = 'main';
  else selectPaneForRoute(route.name);
});

onUnmounted(() => {
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('mouseup', stopResize);
  window.removeEventListener('pointermove', moveToggle);
  window.removeEventListener('pointerup', stopToggleDrag);
  window.removeEventListener('pointermove', resizeMobileSub);
  window.removeEventListener('pointerup', stopMobileSubResize);
});
</script>

<template>
  <div :class="['home-zone', `layout-${layoutMode}`, `active-pane-${activePane}`]">
    <aside class="nav-pane" :style="{ width: `${navWidth}px` }">
      <div class="aside-content">
        <router-view name="nav" />
      </div>
    </aside>

    <div class="resize-handle" @mousedown.prevent="startResizeNav"></div>

    <div class="workspace-pane">
      <main>
        <router-view />
      </main>

      <div class="resize-handle" @mousedown.prevent="startResizeSub"></div>

      <aside class="sub-pane" :style="{ width: `${subWidth}px` }">
        <div v-if="layoutMode === 'mobile'" class="mobile-sub-resize-handle" role="separator" aria-label="下部ペインの高さを調整"
          @pointerdown="startMobileSubResize"></div>
        <div class="aside-content">
          <router-view name="sub" />
        </div>
      </aside>

      <button v-if="layoutMode !== 'desktop' && activePane === 'nav'" class="pane-backdrop" type="button"
        aria-label="ペインを閉じる" @click="closePane"></button>
    </div>
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
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;

  .aside-content {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    background-color: var(--bg-1);
    padding: var(--space-md);
    height: 100vh;
    box-sizing: border-box;
    overflow-y: auto;
  }
}

.workspace-pane {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
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

@media (max-width: 1023px) {
  .home-zone {
    flex-direction: column;
    position: relative;
  }

  .nav-pane {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: min(360px, 88vw) !important;
    height: auto;
    min-height: 0;
    overflow-y: auto;
    z-index: 30;
    box-shadow: 8px 0 20px var(--shadow);
    transform: translateX(-105%);
    transition: transform 0.2s ease;
  }

  .workspace-pane {
    width: 100%;
    min-height: 0;
    position: relative;
  }

  .pane-toggle {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    min-height: 8rem;
    padding: var(--space-xs) 0;
    background: var(--bg-1);
    opacity: 0.6;
    border: 1px solid var(--border);
    color: var(--text-light);
    writing-mode: vertical-rl;
    letter-spacing: 0.1em;
    z-index: 20;
    box-shadow: 0 2px 8px var(--shadow);
    cursor: grab;
    touch-action: none;

    &:hover {
      color: var(--primary);
      opacity: 1;
      background: var(--bg-2);
    }

    &:active {
      cursor: grabbing;
    }
  }

  .pane-toggle-left {
    left: 0;
    border-left: 0;
    border-radius: 0 var(--border-radius) var(--border-radius) 0;
  }

  .pane-toggle-right {
    right: 0;
    border-right: 0;
    border-radius: var(--border-radius) 0 0 var(--border-radius);
  }

  .pane-backdrop {
    position: fixed;
    inset: 0;
    display: block;
    background: var(--overlay-soft);
    border: 0;
    cursor: pointer;
    z-index: 25;
  }

  .resize-handle {
    display: none;
  }

  .sub-pane {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(360px, 88vw) !important;
    height: auto;
    z-index: 30;
    box-shadow: -8px 0 20px var(--shadow);
    transform: translateX(105%);
    transition: transform 0.2s ease;
  }

  .layout-tablet.active-pane-nav .nav-pane,
  .layout-mobile.active-pane-nav .nav-pane {
    transform: translateX(0);
  }

  .layout-tablet.active-pane-sub .sub-pane,
  .layout-mobile.active-pane-sub .sub-pane {
    transform: translateX(0);
  }
}

@media (min-width: 768px) and (max-width: 1023px) {
  .layout-tablet .workspace-pane {
    display: flex;
    flex-direction: row;
    flex: 1;
    width: 100%;
    height: 100vh;
  }

  .layout-tablet main {
    display: flex;
    flex: 1 1 auto;
    width: auto;
    height: 100%;
  }

  .layout-tablet .sub-pane {
    position: relative;
    inset: auto;
    display: flex;
    flex: 0 0 auto;
    width: min(360px, 42vw) !important;
    height: 100%;
    transform: none;
    box-shadow: none;
    z-index: auto;
  }

  .layout-tablet.active-pane-nav .nav-pane {
    transform: translateX(0);
  }

  .layout-tablet.active-pane-nav .sub-pane,
  .layout-tablet.active-pane-main .sub-pane {
    transform: none;
  }
}

@media (max-width: 767px) {
  .layout-mobile .workspace-pane {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100vh;
  }

  .layout-mobile main {
    display: flex;
    flex: 1 1 auto;
    width: 100%;
    min-height: 0;
  }

  .layout-mobile .sub-pane {
    position: relative;
    inset: auto;
    display: flex;
    flex: 0 0 v-bind('`${mobileSubPaneHeight}px`');
    width: 100% !important;
    height: auto;
    min-height: 0;
    border-top: 1px solid var(--border);
    box-shadow: 0 -6px 16px var(--shadow);
    transform: none;
    z-index: 5;
  }

  .layout-mobile .mobile-sub-resize-handle {
    flex: 0 0 0.5rem;
    width: 100%;
    background: var(--border);
    cursor: ns-resize;
    touch-action: none;
    z-index: 2;

    &:hover,
    &:active {
      background: var(--primary);
    }
  }

  .layout-mobile .pane-toggle-right {
    display: none;
  }

  .layout-mobile.active-pane-sub .workspace-pane {
    position: relative;
  }

  .layout-mobile.active-pane-sub main {
    visibility: hidden;
  }

  .layout-mobile.active-pane-sub .sub-pane {
    position: absolute;
    inset: 0;
    display: flex;
    flex: none;
    width: 100% !important;
    height: 100%;
    min-height: 100%;
    border: 0;
    box-shadow: none;
    z-index: 40;
  }

  .layout-mobile.active-pane-sub .mobile-sub-resize-handle {
    display: none;
  }
}
</style>
