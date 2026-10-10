/**
 * Google Drive appDataFolder を使ったアプリデータ同期を担うコンポーザブル。
 * 個人設定やセッションカレンダーなど、Google Calendar API では保持できない
 * データを JSON ファイル（orbit-sync.json）として保存し、デバイス間で同期する。
 *
 * 起動時にリモートを取得してローカルへ反映（リモートが新しい場合）し、
 * その後は設定・セッションカレンダーの変更を監視してデバウンス付きで
 * リモートへ書き込む。書き込みはバックグラウンドで行い UI をブロックしない。
 */
import { watch, nextTick } from 'vue';
import { useAuthStore } from '@/stores/auth.js';
import { useUserStore } from '@/stores/user.js';
import { useCalendarStore } from '@/stores/calendar.js';
import { useAuth } from '@/composables/useAuth.js';
import { CACHE_KEYS, readCache, writeCache } from '@/composables/useCache.js';
import * as driveAPI from '@/services/google-drive-api.js';

/** @type {number} 同期データのスキーマバージョン */
const SYNC_FILE_VERSION = 1;

/** @type {number} 変更検知からリモート書き込みまでのデバウンス時間 (ms) */
const PUSH_DEBOUNCE_MS = 5000;

/** @type {boolean} 初期化済みか（watcher の二重登録防止） */
let initialized = false;

/** @type {boolean} リモートデータを適用中か（適用による push のループ防止） */
let applyingRemote = false;

/** @type {ReturnType<typeof setTimeout>|null} push のデバウンスタイマー */
let pushTimer = null;

/** @type {(() => void)|null} watch の停止関数 */
let stopWatch = null;

/**
 * Drive 同期の開始・停止を提供するコンポーザブル
 * @returns {Object} 同期操作関数群
 */
export function useDriveSync() {
  const authStore = useAuthStore();
  const userStore = useUserStore();
  const calendarStore = useCalendarStore();
  const auth = useAuth();

  /**
   * Drive へ書き込む同期データを構築する
   * @returns {OrbitDriveSyncData} 同期データ
   */
  function buildSyncData() {
    return {
      version: SYNC_FILE_VERSION,
      updatedAt: new Date().toISOString(),
      settings: userStore.exportSettings(),
      sessionCalendars: calendarStore.sessionCalendars.map((entry) => ({ ...entry })),
    };
  }

  /**
   * 現在のローカル状態を Drive へ書き込む（なければファイルを作成）
   * @returns {Promise<void>}
   */
  async function pushRemote() {
    if (!userStore.useDriveSync) return;
    const token = authStore.driveToken || (await auth.ensureDriveToken());
    if (!token) return;
    const data = buildSyncData();
    const fileId = await driveAPI.writeSyncFile(token, JSON.stringify(data));
    if (fileId) await writeCache(CACHE_KEYS.DRIVE_SYNC_AT, data.updatedAt);
  }

  /**
   * 変更検知から遅延してリモートへ書き込む（連続した変更をまとめる）
   * @returns {void}
   */
  function schedulePush() {
    if (applyingRemote) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      pushTimer = null;
      pushRemote().catch((error) => {
        console.warn('Failed to push app data to Drive.', error);
      });
    }, PUSH_DEBOUNCE_MS);
  }

  /**
   * Drive 上の同期データを取得し、ローカルより新しければ state へ反映する。
   * リモートが無い・古い場合はローカル状態を書き込んで揃える。
   * @returns {Promise<boolean>} Drive との疎通に成功したか
   */
  async function pullRemote() {
    const token = authStore.driveToken || (await auth.ensureDriveToken());
    if (!token) return false;

    const remote = await driveAPI.readSyncFile(token);
    const lastSyncAt = await readCache(CACHE_KEYS.DRIVE_SYNC_AT, '');

    // リモートにファイルが無ければローカル状態を初期書き込みする
    if (!remote) {
      await pushRemote();
      return true;
    }

    const remoteAt = typeof remote.data?.updatedAt === 'string' ? remote.data.updatedAt : '';
    if (remoteAt && remoteAt > lastSyncAt) {
      // リモートが新しい → ローカルへ適用（この適用は push の対象にしない）
      applyingRemote = true;
      try {
        if (remote.data.settings) await userStore.applyRemoteSettings(remote.data.settings);
        if (Array.isArray(remote.data.sessionCalendars)) calendarStore.setSessionCalendars(remote.data.sessionCalendars);
        await writeCache(CACHE_KEYS.DRIVE_SYNC_AT, remoteAt);
      } finally {
        // 適用で発火する watcher のフラッシュが済むまで push を抑制する
        nextTick(() => {
          applyingRemote = false;
        });
      }
    } else if (remoteAt !== lastSyncAt) {
      // ローカルが新しい・updatedAt が読めない（ファイル破損）場合はローカルで上書きする
      await pushRemote();
    }
    return true;
  }

  /**
   * Drive 同期を開始する。リモートを取り込んでから変更監視を開始する。
   * 複数回呼ばれても初期化は一度だけ行う。
   * @returns {Promise<void>}
   */
  async function initDriveSync() {
    if (initialized || !userStore.useDriveSync || !authStore.isAuthenticated) return;
    initialized = true;
    try {
      await pullRemote();
    } catch (error) {
      console.warn('Failed to pull app data from Drive.', error);
    }
    // 設定・セッションカレンダーの変更を監視してバックグラウンドで同期する
    stopWatch = watch(
      () => JSON.stringify([userStore.exportSettings(), calendarStore.sessionCalendars]),
      () => schedulePush(),
    );
  }

  /**
   * Drive 同期を停止する（機能の無効化時に使用）
   * @returns {void}
   */
  function stopDriveSync() {
    initialized = false;
    if (pushTimer) {
      clearTimeout(pushTimer);
      pushTimer = null;
    }
    if (stopWatch) {
      stopWatch();
      stopWatch = null;
    }
  }

  return {
    initDriveSync,
    stopDriveSync,
    pullRemote,
    pushRemote,
  };
}
