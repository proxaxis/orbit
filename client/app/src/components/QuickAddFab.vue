<script setup>
/**
 * 自然言語登録（QuickAdd）を起動するフローティングボタン。
 * デスクトップでは中央ペイン、モバイル・タブレットでは Sub ペインの隅に配置される。
 * 個人設定で左右を切り替えられる。フォーカスされていないときは半透明で表示する。
 */
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useUserStore } from '@/stores/user.js';
import IconWandMagicSparkles from '@/components/icons/IconWandMagicSparkles.vue';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();

/** @type {ComputedRef<boolean>} QuickAdd 画面自身と日付ピック中はボタンを出さない */
const visible = computed(() => route.name !== 'EventQuickAdd' && !userStore.formDatePick);
</script>

<template>
  <button v-if="visible" type="button" class="quick-add-fab" :class="{ 'is-left': userStore.quickAddButtonSide === 'left' }" title="自然言語で登録" aria-label="自然言語で登録" @click="router.push({ name: 'EventQuickAdd' })">
    <IconWandMagicSparkles size="1.2rem" />
  </button>
</template>

<style lang="scss" scoped>
.quick-add-fab {
  position: absolute;
  right: var(--space-md);
  bottom: var(--space-md);
  z-index: 20;
  width: 3rem;
  height: 3rem;
  padding: 0;
  border: none;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--primary);
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.35);
  opacity: 0.45;
  transition: opacity 0.2s ease;

  &.is-left {
    right: auto;
    left: var(--space-md);
  }

  &:hover,
  &:focus,
  &:focus-visible {
    opacity: 1;
  }

  .icons {
    fill: var(--text);
  }
}
</style>
