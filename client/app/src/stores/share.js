/**
 * 範囲指定共有の状態管理のみを担当するストア。
 * コピーカレンダーの作成・同期・削除などのロジックは
 * `composables/useShare.js` と `services/share-sync.js` に置く。
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export const useShareStore = defineStore('share', () => {
  /** @type {Ref<OrbitShareSpec[]>} 有効な共有条件の一覧 */
  const specs = ref([]);

  /** @type {ComputedRef<Set<string>>} 期間指定共有で作成されたコピーカレンダー ID の集合 */
  const copyCalendarIds = computed(() => new Set(specs.value.map((spec) => spec.copyCalendarId).filter((id) => typeof id === 'string' && id.length > 0)));

  /** @type {Ref<string|null>} 直近の同期エラー */
  const lastSyncError = ref(null);

  /**
   * 共有条件の一覧を置き換える
   * @param {OrbitShareSpec[]} items 共有条件一覧
   * @returns {void}
   */
  function setSpecs(items) {
    specs.value = Array.isArray(items) ? items : [];
  }

  /**
   * 共有条件を1件追加する
   * @param {OrbitShareSpec} spec 追加する共有条件
   * @returns {void}
   */
  function addSpec(spec) {
    if (!spec?.id) return;
    specs.value = [...specs.value, spec];
  }

  /**
   * 共有条件を1件除去する
   * @param {string} specId 除去する共有 ID
   * @returns {void}
   */
  function removeSpec(specId) {
    specs.value = specs.value.filter((item) => item.id !== specId);
  }

  /**
   * 直近の同期エラーを設定する
   * @param {string|null} message エラーメッセージ
   * @returns {void}
   */
  function setLastSyncError(message) {
    lastSyncError.value = message;
  }

  return {
    specs,
    copyCalendarIds,
    lastSyncError,
    setSpecs,
    addSpec,
    removeSpec,
    setLastSyncError,
  };
});
