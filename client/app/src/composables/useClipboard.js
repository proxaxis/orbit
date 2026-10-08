/**
 * クリップボードへのコピーを担うコンポーザブル。
 */
import { useUserStore } from '@/stores/user.js';

/**
 * クリップボード操作を提供するコンポーザブル
 * @returns {Object} クリップボード操作関数群
 */
export function useClipboard() {
  const userStore = useUserStore();

  /**
   * クリップボードにテキストをコピーする
   * @param {string} text コピーするテキスト
   * @returns {void}
   */
  function writeClipboard(text) {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      userStore.setError(true, new Error('Clipboard API is not available in this environment.'));
      return;
    }
    navigator.clipboard.writeText(text).catch((err) => userStore.setError(true, err));
  }

  return { writeClipboard };
}
