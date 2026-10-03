<template>
  <header class="menu-bar">
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
  </header>
</template>

<style lang="scss" scoped>
.menu-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: var(--space-md);

  :deep(.title) {
    display: inline;
    user-select: none;
    font-weight: bold;
    font-size: var(--text-size-lg);
  }

  .main,
  .sub {
    display: flex;
    align-items: center;
    justify-content: center;
  }
}
</style>
