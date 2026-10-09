<script setup>
/**
 * UserConfigView のデータ管理欄。
 * 個人設定とオフラインキャッシュの削除を担う。
 */
import { useUserStore } from '@/stores/user.js';
import { CACHE_KEYS, clearCache, deleteCache } from '@/composables/useCache.js';
import IconTrash from '@/components/icons/IconTrash.vue';

const userStore = useUserStore();

/** 保存した個人設定を削除して初期設定に戻す */
async function clearSettings() {
  const confirmed = await userStore.confirm({
    title: '設定を削除',
    message: '保存した個人設定を削除して初期設定に戻します。続行しますか？',
  });
  if (!confirmed) return;

  try {
    await deleteCache(CACHE_KEYS.USER_SETTINGS);
    window.location.reload();
  } catch (error) {
    console.warn('Failed to clear user settings.', error);
    userStore.setError(true, '設定を削除できませんでした。');
  }
}

/** 設定以外の全てのオフラインデータとアプリのキャッシュを削除する */
async function clearAppCache() {
  const confirmed = await userStore.confirm({
    title: 'キャッシュを削除',
    message: '設定以外のオフラインデータとアプリのキャッシュを削除します。続行しますか？',
  });
  if (!confirmed) return;

  try {
    await clearCache([CACHE_KEYS.USER_SETTINGS]);
    window.location.reload();
  } catch (error) {
    console.warn('Failed to clear offline cache.', error);
    userStore.setError(true, 'キャッシュを削除できませんでした。');
  }
}
</script>

<template>
  <section class="config-section">
    <p class="hint">設定のデータを削除します.</p>
    <button type="button" class="clear-cache-button" @click="clearSettings"><IconTrash />設定を削除</button>
    <p class="hint">設定以外の全てのオフラインデータを削除します.</p>
    <button type="button" class="clear-cache-button" @click="clearAppCache"><IconTrash />キャッシュを削除</button>
  </section>
</template>

<style lang="scss" scoped>
.hint {
  font-size: var(--text-size-xs);
}
.clear-cache-button {
  align-self: flex-start;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--border);
  border-radius: var(--border-radius);

  &:hover {
    background-color: var(--bg-2);
  }
}
</style>
