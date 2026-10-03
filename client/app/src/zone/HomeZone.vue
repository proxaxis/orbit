<script setup>
import { computed, ref, onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useUserStore } from '@/stores/user.js';

const route = useRoute();
const userStore = useUserStore();

// 初期幅設定
const navWidth = ref(userStore.navPaneWidth);
const subWidth = ref(userStore.subPaneWidth);
const isResizingNav = ref(false);
const isResizingSub = ref(false);
const activePane = ref('main');
const layoutMode = computed(() => {
  if (userStore.isMobile) return 'mobile';
  if (userStore.isTablet) return 'tablet';
  return 'desktop';
});

const subPaneRoutes = new Set(['EventCreator', 'EventDetail', 'EventEditor', 'SharingConfig', 'CalendarCreator', 'CalendarDetail', 'UserConfig']);

function selectPane(pane) {
  activePane.value = pane;
}

function selectPaneForRoute(routeName) {
  if (layoutMode.value === 'mobile' && subPaneRoutes.has(String(routeName))) activePane.value = 'sub';
  else if (layoutMode.value === 'mobile') activePane.value = 'main';
  else if (layoutMode.value === 'tablet' && subPaneRoutes.has(String(routeName))) activePane.value = 'sub';
  else if (layoutMode.value === 'tablet') activePane.value = 'main';
}

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

watch(navWidth, (width) => userStore.setNavPaneWidth(width));
watch(subWidth, (width) => userStore.setSubPaneWidth(width));

onMounted(() => {
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', stopResize);
});

watch(() => route.name, selectPaneForRoute, { immediate: true });
watch(layoutMode, (mode) => {
  if (mode === 'desktop') activePane.value = 'main';
  else selectPaneForRoute(route.name);
});

onUnmounted(() => {
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('mouseup', stopResize);
});
</script>

<template>
  <div :class="['home-zone', `layout-${layoutMode}`, `active-pane-${activePane}`]">
    <nav v-if="layoutMode !== 'desktop'" class="pane-switcher" aria-label="表示ペイン">
      <button :class="{ active: activePane === 'nav' }" @click="selectPane('nav')">カレンダー</button>
      <button :class="{ active: activePane === 'main' }" @click="selectPane('main')">月表示</button>
      <button :class="{ active: activePane === 'sub' }" @click="selectPane('sub')">詳細</button>
    </nav>

    <aside class="nav-pane" :style="{ width: `${navWidth}px` }">
      <router-view name="nav" />
    </aside>

    <div class="resize-handle" @mousedown="startResizeNav"></div>

    <div class="workspace-pane">
      <main>
        <router-view />
      </main>

      <div class="resize-handle" @mousedown="startResizeSub"></div>

      <aside class="sub-pane" :style="{ width: `${subWidth}px` }">
        <router-view name="sub" />
      </aside>
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

.pane-switcher {
  display: none;
}

aside {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-1);
  padding: var(--space-md);
  height: 100vh;
  box-sizing: border-box;
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

  .pane-switcher {
    display: flex;
    flex: 0 0 auto;
    align-items: stretch;
    gap: 1px;
    min-height: 2.5rem;
    background: var(--border);

    button {
      flex: 1;
      justify-content: center;
      padding: var(--space-xs) var(--space-sm);
      background: var(--bg-1);
      color: var(--text-light);

      &.active {
        background: var(--bg-0);
        color: var(--primary);
        font-weight: bold;
      }
    }
  }

  .nav-pane {
    position: absolute;
    top: 2.5rem;
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
</style>
