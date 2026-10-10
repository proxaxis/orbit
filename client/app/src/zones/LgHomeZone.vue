<script setup>
import IconEllipsisVertical from "@/components/icons/IconEllipsisVertical.vue";
import QuickAddFab from "@/components/QuickAddFab.vue";
import { useUserStore } from "@/stores/user.js";

const userStore = useUserStore();

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
    <aside
      :style="{
        width: userStore.navPaneCollapsed ? '44px' : `${props.navWidth}px`,
      }"
      :class="{ 'is-collapsed': userStore.navPaneCollapsed }"
    >
      <div class="aside-content nav-pane-content">
        <router-view name="nav" v-slot="{ Component }">
          <component
            :is="Component"
            :select-pane="props.selectPane"
            :collapse-mobile-sub-pane="props.collapseMobileSubPane"
          />
        </router-view>
      </div>
    </aside>

    <div
      class="resize-handle"
      v-show="!userStore.navPaneCollapsed"
      @pointerdown.prevent="handleResizeNav"
    >
      <icon-ellipsis-vertical />
    </div>

    <main>
      <div class="main-content">
        <router-view v-slot="{ Component }">
          <component
            :is="Component"
            :select-pane="props.selectPane"
            :collapse-mobile-sub-pane="props.collapseMobileSubPane"
          />
        </router-view>
      </div>
      <QuickAddFab />
    </main>

    <div
      class="resize-handle"
      v-show="!userStore.formDatePick"
      @pointerdown.prevent="handleResizeSub"
    >
      <icon-ellipsis-vertical />
    </div>

    <aside
      :style="{ width: `${props.subWidth}px` }"
      v-show="!userStore.formDatePick"
    >
      <div class="aside-content sub-pane-content">
        <router-view name="sub" v-slot="{ Component }">
          <component
            :is="Component"
            :select-pane="props.selectPane"
            :collapse-mobile-sub-pane="props.collapseMobileSubPane"
          />
        </router-view>
      </div>
    </aside>
  </div>
</template>

<style lang="scss" scoped>
.lg-home-zone main {
  position: relative;
}

.lg-home-zone aside.is-collapsed .aside-content {
  padding: var(--space-xxs) 0;
  overflow: hidden;
}
</style>
