<script setup>
import { useUserStore } from '@/stores/user.js';

const userStore = useUserStore();

const props = defineProps({
  navWidth: { type: Number, required: true },
  subWidth: { type: Number, required: true },
  activePane: { type: String, required: true },
  selectPane: { type: Function, required: true },
  collapseMobileSubPane: { type: Function, required: true },
  startNavSwipe: { type: Function, required: true },
  moveNavSwipe: { type: Function, required: true },
  finishNavSwipe: { type: Function, required: true },
  cancelNavSwipe: { type: Function, required: true },
  startResizeSub: { type: Function, required: true },
});

/** @param {TouchEvent} evt */
function onNavTouchStart(evt) {
  props.startNavSwipe(evt);
}
/** @param {TouchEvent} evt */
function onNavTouchMove(evt) {
  props.moveNavSwipe(evt);
}
/** @param {TouchEvent} evt */
function onNavTouchEnd(evt) {
  props.finishNavSwipe(evt);
}
/** @param {TouchEvent} evt */
function onNavTouchCancel(evt) {
  props.cancelNavSwipe(evt);
}
/** @param {PointerEvent} evt */
function onSubResizeStart(evt) {
  props.startResizeSub(evt);
}
</script>

<template>
  <div :class="['home-zone', 'md-home-zone', `active-pane-${props.activePane}`]">
    <aside class="nav-pane" @touchstart="onNavTouchStart" @touchmove="onNavTouchMove" @touchend="onNavTouchEnd" @touchcancel="onNavTouchCancel">
      <div class="aside-content nav-pane-content">
        <router-view name="nav" v-slot="{ Component }">
          <component :is="Component" :select-pane="props.selectPane" :collapse-mobile-sub-pane="props.collapseMobileSubPane" />
        </router-view>
      </div>
    </aside>

    <main>
      <div class="main-content">
        <router-view v-slot="{ Component }">
          <component :is="Component" :select-pane="props.selectPane" :collapse-mobile-sub-pane="props.collapseMobileSubPane" />
        </router-view>
      </div>
    </main>

    <div class="resize-handle" v-show="!userStore.formDatePick" @pointerdown.prevent="onSubResizeStart"><icon-ellipsis-vertical /></div>

    <aside class="sub-pane" :style="{ width: `${props.subWidth}px` }" v-show="!userStore.formDatePick">
      <div class="aside-content sub-pane-content">
        <router-view name="sub" v-slot="{ Component }">
          <component :is="Component" :select-pane="props.selectPane" :collapse-mobile-sub-pane="props.collapseMobileSubPane" />
        </router-view>
      </div>
    </aside>
  </div>
</template>

<style lang="scss" scoped>
.md-home-zone {
  .nav-pane {
    position: absolute;
    inset: 0 auto 0 0;
    width: min(360px, 88vw);
    z-index: 30;
    transform: translateX(-105%);
    transition: transform 0.2s ease;
  }

  &.active-pane-nav .nav-pane {
    transform: translateX(0);
  }

  main {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
  }

  .sub-pane {
    display: flex;
    width: min(360px, 42vw);
    height: 100%;
  }

  .resize-handle {
    display: block;
  }
}
</style>
