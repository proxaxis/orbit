/**
 * 共有リンクの受け渡しを担うコンポーザブル。
 * Web Share API が使える環境では共有シートを開き、使えなければ
 * クリップボードへコピーしてトーストで知らせる。
 */
import { useClipboard } from '@/composables/useClipboard.js';
import { useUserStore } from '@/stores/user.js';

/**
 * 共有リンクの送信機能を提供するコンポーザブル
 * @returns {{shareOrCopyLink: (url: string|null, text: string) => Promise<void>}}
 */
export function useShareLink() {
  const clipboard = useClipboard();
  const userStore = useUserStore();

  /**
   * リンクを Web Share で送るか、クリップボードへコピーする
   * @param {string|null} url 共有する URL
   * @param {string} text 共有シートに表示する説明文
   * @returns {Promise<void>}
   */
  async function shareOrCopyLink(url, text) {
    if (!url) return;
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Orbit カレンダーの共有', text, url });
        return;
      } catch (error) {
        // ユーザのキャンセルは何もしない。それ以外の失敗はコピーへフォールバックする
        if (/** @type {any} */ (error)?.name === 'AbortError') return;
      }
    }
    clipboard.writeClipboard(url);
    userStore.showToast('共有リンクをコピーしました');
  }

  return { shareOrCopyLink };
}
