<script setup>
const props = defineProps({
  activePane: { type: String, required: true },
  mobileSubPaneHeight: { type: Number, required: true },
  isCollapsingMobileSub: { type: Boolean, required: true },
  mobileSubContent: { type: Object, required: true },
  selectPane: { type: Function, required: true },
  collapseMobileSubPane: { type: Function, required: true },
  startNavSwipe: { type: Function, required: true },
  moveNavSwipe: { type: Function, required: true },
  finishNavSwipe: { type: Function, required: true },
  cancelNavSwipe: { type: Function, required: true },
  handleMobileSubContentTouchStart: { type: Function, required: true },
  startMobileSubResize: { type: Function, required: true },
  resizeMobileSub: { type: Function, required: true },
  stopMobileSubResize: { type: Function, required: true },
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
/** @param {TouchEvent} evt */
function onSubTouchStart(evt) {
  props.startMobileSubResize(evt);
}
/** @param {TouchEvent} evt */
function onSubTouchMove(evt) {
  props.resizeMobileSub(evt);
}
/** @param {TouchEvent} evt */
function onSubTouchEnd(evt) {
  props.stopMobileSubResize(evt);
}
/** @param {TouchEvent} evt */
function onContentTouchStart(evt) {
  props.handleMobileSubContentTouchStart(evt);
}
/** @param {Element|import('vue').ComponentPublicInstance|null} element */
function setMobileSubContent(element) {
  if (element instanceof HTMLElement && props.mobileSubContent && 'value' in props.mobileSubContent) props.mobileSubContent.value = element;
}
</script>

<template>
  <div :class="['home-zone', 'sm-home-zone', `active-pane-${props.activePane}`]">
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

    <aside class="sub-pane" :class="{ 'is-collapsing': props.isCollapsingMobileSub }" :style="{ flexBasis: `${props.mobileSubPaneHeight}px` }" @touchstart="onSubTouchStart" @touchmove="onSubTouchMove" @touchend="onSubTouchEnd" @touchcancel="onSubTouchEnd">
      <div :ref="setMobileSubContent" class="aside-content sub-pane-content" @touchstart="onContentTouchStart">
        <router-view name="sub" v-slot="{ Component }">
          <component :is="Component" :select-pane="props.selectPane" :collapse-mobile-sub-pane="props.collapseMobileSubPane" />
        </router-view>
      </div>
    </aside>
  </div>
</template>

<style lang="scss" scoped>
.sm-home-zone {
  flex-direction: column;

  main {
    display: flex;
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
  }

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

  .sub-pane {
    display: flex;
    flex: 0 0 auto;
    min-height: 0;
    width: 100%;
    height: auto;
  }

  &.active-pane-sub main {
    visibility: hidden;
  }

  &.active-pane-sub .sub-pane {
    position: absolute;
    inset: 0;
    border: 0;
    z-index: 40;
    margin-top: var(--space-xs);
  }
}
</style>
