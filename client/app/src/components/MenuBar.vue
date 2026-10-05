<script setup>
import { computed } from 'vue';

const props = defineProps({
  useMobilePadding: {
    type: Boolean,
    default: false,
  },
});
</script>

<template>
  <header class="menu-bar" :class="{ 'mobile-padding': props.useMobilePadding }">
    <div>
      <div class="main">
        <slot name="main">
          <div class="dummy"></div>
        </slot>
      </div>
      <div>
        <slot name="center">
          <div class="dummy"></div>
        </slot>
      </div>
      <div class="sub">
        <slot name="sub">
          <div class="dummy"></div>
        </slot>
      </div>
    </div>
    <p>
      <slot></slot>
    </p>
  </header>
</template>

<style lang="scss" scoped>
header {
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid var(--border);
  padding-bottom: var(--space-sm);
  margin-bottom: var(--space-sm);

  &.mobile-padding {
    padding: 0 0 var(--space-xs) 0;
    margin: 0;
    border-bottom: none;
  }

  & > div {
    display: grid;
    grid-template-columns: 1fr auto 1fr;

    :deep(.title) {
      display: inline;
      font-weight: bold;
      font-size: var(--text-size-lg);
    }

    .main,
    .sub {
      display: flex;
      align-items: center;
    }

    .main {
      justify-content: flex-start;
    }

    .sub {
      justify-content: flex-end;
    }
  }

  & > p {
    font-size: var(--text-size-sm);
    color: var(--text-light);
  }
}
</style>
