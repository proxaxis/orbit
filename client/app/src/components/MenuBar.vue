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
  font-size: 1.2rem;
  padding: 0.3rem 0 1rem 0;

  :deep(.title) {
    display: inline;
    user-select: none;
    font-weight: bold;
    font-size: 1.2rem;
  }

  .main,
  .sub {
    display: flex;
    gap: 1rem;
    align-items: center;
    justify-content: center;
  }
}
</style>
