<script setup>
const props = defineProps({
  navWidth: { type: Number, required: true },
  subWidth: { type: Number, required: true },
  selectPane: { type: Function, required: true },
  collapseMobileSubPane: { type: Function, required: true },
  startResizeNav: { type: Function, required: true },
  startResizeSub: { type: Function, required: true },
});

/** @param {PointerEvent} evt */
function handleResizeNav(evt) {
  props.startResizeNav(evt);
}

/** @param {PointerEvent} evt */
function handleResizeSub(evt) {
  props.startResizeSub(evt);
}
</script>

<template>
  <div class="home-zone lg-home-zone">
    <aside :style="{ width: `${props.navWidth}px` }">
      <div class="aside-content nav-pane-content">
        <router-view name="nav" v-slot="{ Component }">
          <component :is="Component" :select-pane="props.selectPane" :collapse-mobile-sub-pane="props.collapseMobileSubPane" />
        </router-view>
      </div>
    </aside>

    <div class="resize-handle" @pointerdown.prevent="handleResizeNav"></div>

    <main>
      <div class="main-content">
        <router-view v-slot="{ Component }">
          <component :is="Component" :select-pane="props.selectPane" :collapse-mobile-sub-pane="props.collapseMobileSubPane" />
        </router-view>
      </div>
    </main>

    <div class="resize-handle" @pointerdown.prevent="handleResizeSub"></div>

    <aside :style="{ width: `${props.subWidth}px` }">
      <div class="aside-content sub-pane-content">
        <router-view name="sub" v-slot="{ Component }">
          <component :is="Component" :select-pane="props.selectPane" :collapse-mobile-sub-pane="props.collapseMobileSubPane" />
        </router-view>
      </div>
    </aside>
  </div>
</template>
