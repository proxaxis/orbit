/**
 * イベントの状態管理のみを担当するストア。
 * API 通信やオフラインキューの再生などのロジックは
 * `composables/useEvents.js` と `services/event-offline.js` に置く。
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { isValidOperation } from '@/services/event-offline.js';

export const useEventStore = defineStore('event', () => {
  /** @type {Ref<Map<string, any>>} @description カレンダー ID・年月・イベント ID をキーにしたイベントのメモリキャッシュ */
  const eventCache = ref(new Map());

  /** @type {Ref<import('@/services/event-offline.js').EventOperation[]>} @description オフラインで保留中のイベント操作キュー */
  const pendingOperations = ref([]);

  /** @type {Ref<number>} @description 予定データのバージョン。作成・更新・削除のたびに増え、各ビューの再取得トリガーになる */
  const eventsVersion = ref(0);

  /** 予定データが変更されたことをビューへ通知する */
  function bumpEventsVersion() {
    eventsVersion.value += 1;
  }

  /**
   * メモリキャッシュからエントリを取得する
   * @param {string} key キャッシュキー
   * @returns {any} キャッシュされた値（未登録なら null）
   */
  function getCachedEntry(key) {
    return eventCache.value.get(key) ?? null;
  }

  /**
   * メモリキャッシュにエントリを登録する
   * @param {string} key キャッシュキー
   * @param {any} value キャッシュする値
   * @returns {void}
   */
  function setCachedEntry(key, value) {
    eventCache.value.set(key, value);
  }

  /**
   * イベントのメモリキャッシュを全て破棄する
   * @returns {void}
   */
  function clearEventCache() {
    eventCache.value = new Map();
  }

  /**
   * キャッシュ全件を「期限切れ」にする。表示用の items は保持するため、
   * 次回の listEvents で古い内容が表示されたままバックグラウンド再取得に入り、
   * 中間状態による画面のちらつきを防ぐ。アカウント切替など完全な破棄が必要な場合は clearEventCache を使う。
   * @returns {void}
   */
  function invalidateEventCache() {
    const next = new Map();
    eventCache.value.forEach((value, key) => {
      next.set(key, { ...value, at: 0 });
    });
    eventCache.value = next;
  }

  /**
   * 保留中のイベント操作キューを置き換える
   * @param {import('@/services/event-offline.js').EventOperation[]} operations 操作一覧
   * @returns {void}
   */
  function setPendingOperations(operations) {
    pendingOperations.value = (Array.isArray(operations) ? operations : []).filter(isValidOperation);
  }

  /**
   * 保留中のイベント操作キューへ操作を追加する
   * @param {import('@/services/event-offline.js').EventOperation} operation 追加する操作
   * @returns {void}
   */
  function pushPendingOperation(operation) {
    if (!isValidOperation(operation)) return;
    pendingOperations.value = [...pendingOperations.value, operation];
  }

  return {
    eventCache,
    pendingOperations,
    eventsVersion,
    bumpEventsVersion,
    getCachedEntry,
    setCachedEntry,
    clearEventCache,
    invalidateEventCache,
    setPendingOperations,
    pushPendingOperation,
  };
});
