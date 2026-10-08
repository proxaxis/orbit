<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useUserStore } from '@/stores/user.js';
import SmHomeZone from '@/zones/SmHomeZone.vue';
import MdHomeZone from '@/zones/MdHomeZone.vue';
import LgHomeZone from '@/zones/LgHomeZone.vue';

const route = useRoute();
const userStore = useUserStore();
const navWidth = ref(userStore.navPaneWidth);
const subWidth = ref(userStore.subPaneWidth);
const isResizingNav = ref(false);
const isResizingSub = ref(false);
/** @type {import('vue').Ref<number|null>} */
const subResizeStartX = ref(null);
const subResizeStartWidth = ref(360);
const MOBILE_SUB_MIN_HEIGHT = 160;
const mobileSubPaneHeight = ref(typeof window !== 'undefined' ? Math.min(300, Math.max(MOBILE_SUB_MIN_HEIGHT, window.innerHeight * 0.34)) : 300);
const isCollapsingMobileSub = ref(false);
const isResizingMobileSub = ref(false);
const mobileSubResizeStartY = ref(0);
const mobileSubResizeStartHeight = ref(0);
const mobileSubResizeLastY = ref(0);
/** @type {import('vue').Ref<HTMLElement|null>} */
const mobileSubContent = ref(null);
/** @type {import('vue').Ref<{x: number, y: number}|null>} */
const navSwipeStart = ref(null);
const activePane = ref('main');

const layoutComponent = computed(() => {
  if (userStore.isMobile) return SmHomeZone;
  if (userStore.isTablet) return MdHomeZone;
  return LgHomeZone;
});

/** @param {'main'|'nav'|'sub'} pane */
function selectPane(pane) {
  activePane.value = pane;
}

/** モバイル表示の下部ペインを閉じる */
function collapseMobileSubPane() {
  if (!userStore.isMobile) return;
  isCollapsingMobileSub.value = true;
  mobileSubPaneHeight.value = MOBILE_SUB_MIN_HEIGHT;
  window.setTimeout(() => {
    isCollapsingMobileSub.value = false;
  }, 260);
}

/** @param {TouchEvent} evt */
function startNavSwipe(evt) {
  if (userStore.isDesktop || activePane.value !== 'nav' || evt.touches.length !== 1) return;
  const touch = evt.touches[0];
  navSwipeStart.value = { x: touch.clientX, y: touch.clientY };
}

/** @param {TouchEvent} evt */
function moveNavSwipe(evt) {
  const start = navSwipeStart.value;
  if (!start || evt.touches.length !== 1) return;
  const touch = evt.touches[0];
  const deltaX = touch.clientX - start.x;
  const deltaY = touch.clientY - start.y;
  if (deltaX < -12 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) evt.preventDefault();
}

/** @param {TouchEvent} evt */
function finishNavSwipe(evt) {
  const start = navSwipeStart.value;
  navSwipeStart.value = null;
  if (!start || activePane.value !== 'nav' || evt.changedTouches.length !== 1) return;
  const touch = evt.changedTouches[0];
  const deltaX = touch.clientX - start.x;
  const deltaY = touch.clientY - start.y;
  if (deltaX <= -60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) activePane.value = 'main';
}

/** ナビゲーションのスワイプをキャンセルする */
function cancelNavSwipe() {
  navSwipeStart.value = null;
}

/** @param {TouchEvent} evt */
function handleMobileSubContentTouchStart(evt) {
  if (evt.target instanceof Element && evt.target.closest('.menu-bar')) return;
  evt.stopPropagation();
}

/** @param {TouchEvent} evt */
function startMobileSubResize(evt) {
  if (!userStore.isMobile || activePane.value === 'sub' || evt.touches.length !== 1) return;
  const touch = evt.touches[0];
  isResizingMobileSub.value = true;
  mobileSubResizeStartY.value = touch.clientY;
  mobileSubResizeStartHeight.value = mobileSubPaneHeight.value;
  mobileSubResizeLastY.value = touch.clientY;
}

/** @param {TouchEvent} evt */
function resizeMobileSub(evt) {
  if (!isResizingMobileSub.value || evt.touches.length !== 1) return;
  const touch = evt.touches[0];
  if (evt.cancelable) evt.preventDefault();
  const maxHeight = Math.max(240, window.innerHeight);
  const nextHeight = mobileSubResizeStartHeight.value + mobileSubResizeStartY.value - touch.clientY;
  if (nextHeight >= maxHeight && mobileSubContent.value instanceof HTMLElement) {
    mobileSubPaneHeight.value = maxHeight;
    mobileSubContent.value.scrollTop += mobileSubResizeLastY.value - touch.clientY;
  } else {
    mobileSubPaneHeight.value = Math.min(maxHeight, Math.max(MOBILE_SUB_MIN_HEIGHT, nextHeight));
  }
  mobileSubResizeLastY.value = touch.clientY;
}

/** モバイル下部ペインのリサイズを終了する */
function stopMobileSubResize() {
  isResizingMobileSub.value = false;
}

/** @param {unknown} routeName */
function selectPaneForRoute(routeName) {
  if (userStore.isMobile) activePane.value = routeName === 'Home' ? 'main' : 'sub';
  else activePane.value = 'main';
}

/** @param {PointerEvent} evt */
function startResizeNav(evt) {
  isResizingNav.value = true;
  if (evt.currentTarget instanceof HTMLElement) evt.currentTarget.setPointerCapture(evt.pointerId);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
}

/** @param {PointerEvent} evt */
function startResizeSub(evt) {
  isResizingSub.value = true;
  subResizeStartX.value = evt.clientX;
  subResizeStartWidth.value = subWidth.value;
  if (evt.currentTarget instanceof HTMLElement) evt.currentTarget.setPointerCapture(evt.pointerId);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
}

/** @param {PointerEvent} evt */
function handleResizeMove(evt) {
  if (isResizingNav.value) {
    const newWidth = evt.clientX;
    if (userStore.isDesktop && newWidth >= 260 && newWidth <= 600) navWidth.value = newWidth; // デスクトップは 260px～600px の範囲でリサイズ可能
    else if (newWidth >= 260 && newWidth <= 460) navWidth.value = newWidth; // タブレットは 260px～460px の範囲でリサイズ可能
  } else if (isResizingSub.value && subResizeStartX.value !== null) {
    const newWidth = subResizeStartWidth.value + subResizeStartX.value - evt.clientX;
    if (userStore.isDesktop && newWidth >= 260 && newWidth <= 600) subWidth.value = newWidth; // デスクトップは 260px～600px の範囲でリサイズ可能
    else if (newWidth >= 260 && newWidth <= 460) subWidth.value = newWidth; // タブレットは 260px～460px の範囲でリサイズ可能
  }
}

/** ペインのリサイズを終了する */
function stopResize() {
  isResizingNav.value = false;
  isResizingSub.value = false;
  subResizeStartX.value = null;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
}

watch(navWidth, (width) => userStore.setNavPaneWidth(width));
watch(subWidth, (width) => userStore.setSubPaneWidth(width));
watch(
  () => route.name,
  (name) => {
    selectPaneForRoute(name);
    // 別画面へ遷移した場合は未完了の日付ピック要求を破棄する
    if (userStore.formDatePick) userStore.cancelFormDatePick();
  },
  { immediate: true },
);
// イベントフォームの日付ピック中はメインカレンダーを全面に出す（モバイルでは Sub ペインを隠す）
watch(
  () => userStore.formDatePick,
  (picking) => {
    if (picking) activePane.value = 'main';
    else if (userStore.isMobile && route.name !== 'Home') activePane.value = 'sub';
  },
);
watch(
  () => userStore.device,
  () => selectPaneForRoute(route.name),
);

onMounted(() => {
  window.addEventListener('pointermove', handleResizeMove);
  window.addEventListener('pointerup', stopResize);
});

onUnmounted(() => {
  window.removeEventListener('pointermove', handleResizeMove);
  window.removeEventListener('pointerup', stopResize);
});
</script>

<template>
  <component
    :is="layoutComponent"
    :nav-width="navWidth"
    :sub-width="subWidth"
    :active-pane="activePane"
    :mobile-sub-pane-height="mobileSubPaneHeight"
    :is-collapsing-mobile-sub="isCollapsingMobileSub"
    :mobile-sub-content="mobileSubContent"
    :select-pane="selectPane"
    :collapse-mobile-sub-pane="collapseMobileSubPane"
    :start-resize-nav="startResizeNav"
    :start-resize-sub="startResizeSub"
    :start-nav-swipe="startNavSwipe"
    :move-nav-swipe="moveNavSwipe"
    :finish-nav-swipe="finishNavSwipe"
    :cancel-nav-swipe="cancelNavSwipe"
    :handle-mobile-sub-content-touch-start="handleMobileSubContentTouchStart"
    :start-mobile-sub-resize="startMobileSubResize"
    :resize-mobile-sub="resizeMobileSub"
    :stop-mobile-sub-resize="stopMobileSubResize" />
</template>

<style lang="scss">
.home-zone {
  display: flex;
  height: 100vh;
  width: 100%;
  max-width: 100vw;
  overflow: hidden;
  box-sizing: border-box;
}

.home-zone aside {
  flex: 0 0 auto;
  flex-direction: column;
  background-color: var(--bg-1);
}

.home-zone .aside-content {
  flex: 0 0 auto;
  padding: var(--space-sm);
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--border-radius);
  height: calc(100% - var(--space-xs) * 2);
  box-sizing: border-box;
}

.home-zone {
  &.lg-home-zone {
    .nav-pane-content {
      margin: var(--space-xs) 0 var(--space-xs) var(--space-xs);
    }

    .main-content {
      margin: var(--space-xs) 0;
    }

    .sub-pane-content {
      margin: var(--space-xs) var(--space-xs) var(--space-xs) 0;
    }
  }

  &.md-home-zone {
    .nav-pane-content {
      margin: var(--space-xs);
    }

    .main-content {
      margin: var(--space-xs) 0 var(--space-xs) var(--space-xs);
    }

    .sub-pane-content {
      margin: var(--space-xs) var(--space-xs) var(--space-xs) 0;
    }
  }

  &.sm-home-zone {
    .nav-pane-content {
      margin: var(--space-xs);
    }

    .main-content {
      margin: var(--space-xs);
    }

    .sub-pane-content {
      margin: 0 var(--space-xs) var(--space-xs) var(--space-xs);
      height: calc(100% - var(--space-xs));
    }
  }
}

.home-zone main {
  flex: 1 1 auto;
  overflow-y: hidden;
  min-width: 0;
  background-color: var(--bg-1);
}

.home-zone .main-content {
  flex: 1 1 auto;
  border: 1px solid var(--border);
  border-radius: var(--border-radius);
  height: calc(100% - var(--space-xs) * 2);
  box-sizing: border-box;
}

.home-zone .resize-handle {
  width: var(--space-xs);
  cursor: col-resize;
  touch-action: none;
  background-color: var(--bg-1);
  transition: background-color 0.4s ease;
  flex: 0 0 var(--space-xs);
  z-index: 10;

  &:hover,
  &:active {
    background-color: var(--primary);
  }
}
</style>
