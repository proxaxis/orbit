<template>
  <header class="menu-bar">
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

  &>div {
    display: flex;
    justify-content: space-between;
    align-items: center;

    :deep(.title) {
      display: inline;
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

  &>p {
    font-size: var(--text-size-sm);
    color: var(--text-light);
  }
}
</style>
