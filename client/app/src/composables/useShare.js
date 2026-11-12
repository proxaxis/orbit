/**
 * 範囲指定共有カレンダーの作成・同期・削除を担うコンポーザブル。
 * 実際のコピー・同期処理は `services/share-sync.js` の純粋関数に委譲し、
 * ここではストア状態の更新とバックグラウンド同期の予約を行う。
 */
import { useAuthStore } from '@/stores/auth.js';
import { useCalendarStore } from '@/stores/calendar.js';
import { useShareStore } from '@/stores/share.js';
import { useUserStore } from '@/stores/user.js';
import { useCalendars } from '@/composables/useCalendars.js';
import { SYNC_TAGS, registerBackgroundSync } from '@/composables/useCache.js';
import { createShareSpec, deleteShareCalendar, isShareSpecExpired, loadShareSpecs, saveShareSpecs, syncShareSpec } from '@/services/share-sync.js';

/** 共有同期の定期実行間隔 */
const SYNC_INTERVAL_MS = 5 * 60_000;
/** イベント変更から共有同期をまとめて実行するまでの待ち時間 */
const SYNC_DEBOUNCE_MS = 10_000;

/** @type {Set<string>} 同期中の共有 ID */
const syncingIds = new Set();
/** @type {Set<string>} 同期中に再度同期を要求された共有 ID */
const queuedIds = new Set();
/** @type {number|null} イベント変更からの遅延同期タイマー */
let debounceTimer = null;
/** @type {boolean} 定期実行が開始済みかどうか */
let initialized = false;

/**
 * 共有管理のコンポーザブル
 * @returns {Object} 共有操作関数群
 */
export function useShare() {
  const authStore = useAuthStore();
  const userStore = useUserStore();
  const shareStore = useShareStore();
  const calendarStore = useCalendarStore();
  const calendars = useCalendars();

  /**
   * 共有条件一覧をストアとキャッシュの両方へ保存する
   * @param {OrbitShareSpec[]} specs 共有条件一覧
   * @returns {Promise<void>}
   */
  async function persistSpecs(specs) {
    shareStore.setSpecs(specs);
    await saveShareSpecs(specs);
  }

  /**
   * キャッシュから共有条件を読み込み、ストアへ反映する
   * @returns {Promise<void>}
   */
  async function loadSpecs() {
    shareStore.setSpecs(await loadShareSpecs());
  }

  /**
   * 共有が有効期限切れかどうか（expiresAt の当日終了までは有効）
   * @param {OrbitShareSpec} spec 共有条件
   * @returns {boolean}
   */
  function isExpired(spec) {
    return isShareSpecExpired(spec);
  }

  /**
   * 1件の共有についてコピーカレンダーとコピー元を同期する。
   * 期限切れの場合はコピーカレンダーごと削除する。
   * @param {OrbitShareSpec} spec 共有条件
   * @returns {Promise<boolean>} 同期に成功したかどうか
   */
  async function syncShare(spec) {
    if (!authStore.token || userStore.isOffline) return false;
    if (syncingIds.has(spec.id)) {
      queuedIds.add(spec.id);
      return false;
    }
    syncingIds.add(spec.id);
    try {
      const { spec: synced, removed } = await syncShareSpec(spec, authStore.token);
      if (removed) {
        shareStore.removeSpec(spec.id);
        if (spec.copyCalendarId) calendarStore.removeCalendar(spec.copyCalendarId);
      }
      await saveShareSpecs(shareStore.specs);
      shareStore.setLastSyncError(null);
      return true;
    } catch (error) {
      console.warn(`Failed to sync shared calendar ${spec.copyCalendarId}.`, error);
      shareStore.setLastSyncError(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      syncingIds.delete(spec.id);
      if (queuedIds.delete(spec.id)) syncShare(spec);
    }
  }

  /**
   * 全ての共有を確認する。期限切れは削除し、有効なものはコピー元と同期する。
   * @returns {Promise<void>}
   */
  async function syncAllShares() {
    if (!authStore.token || userStore.isOffline) return;
    for (const spec of [...shareStore.specs]) {
      await syncShare(spec);
    }
    // Service Worker にもバックグラウンド同期を委譲する
    await registerBackgroundSync(SYNC_TAGS.SHARE_SYNC);
  }

  /**
   * 共有条件に従ってコピーカレンダーの作成・予定コピー・ACL 共有を行う。
   * @param {{title: string, recipient: string, calendarIds: string[], rangeStart: string, rangeEnd: string, expiresAt: string, role: 'freeBusyReader'|'reader'}} input 共有条件
   * @returns {Promise<OrbitShareSpec>} 作成された共有条件
   */
  async function createShare(input) {
    if (!authStore.token || userStore.isOffline) throw new Error('共有を作成するにはオンラインでログインしている必要があります。');
    userStore.setLoading(true, '共有用のカレンダーを作成しています...');
    try {
      const spec = await createShareSpec(input, authStore.token, (message) => userStore.setLoading(true, message));
      shareStore.addSpec(spec);
      await saveShareSpecs(shareStore.specs);
      // 作成したコピーカレンダーを一覧へ反映する（セッションリストに表示するため）
      await calendars.loadCalendars();
      return spec;
    } finally {
      userStore.setLoading(false);
    }
  }

  /**
   * 共有を解除してコピーカレンダーを削除する（カレンダーの削除で相手側からも消える）。
   * @param {string} specId 共有 ID
   * @returns {Promise<void>}
   */
  async function removeShare(specId) {
    const spec = shareStore.specs.find((item) => item.id === specId);
    if (!spec) return;
    if (!userStore.isOffline) await deleteShareCalendar(spec, authStore.token);
    shareStore.removeSpec(specId);
    if (spec.copyCalendarId) calendarStore.removeCalendar(spec.copyCalendarId);
    await saveShareSpecs(shareStore.specs);
  }

  return {
    loadSpecs,
    isExpired,
    syncShare,
    syncAllShares,
    createShare,
    removeShare,
  };
}

/**
 * 予定の変更に応じて共有同期を予約する（短時間の連続変更はまとめる）。
 * @returns {void}
 */
export function scheduleShareSync() {
  if (!initialized || typeof window === 'undefined') return;
  if (debounceTimer !== null) window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    debounceTimer = null;
    useShare().syncAllShares();
  }, SYNC_DEBOUNCE_MS);
}

/**
 * 共有同期の定期実行を開始する。アプリ起動時に一度だけ呼ぶ。
 * @returns {Promise<void>}
 */
export async function initShareSync() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  const share = useShare();
  await share.loadSpecs();
  window.setInterval(share.syncAllShares, SYNC_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) share.syncAllShares();
  });
  window.addEventListener('online', share.syncAllShares);
  await share.syncAllShares();
}
