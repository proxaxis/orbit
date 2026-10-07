import { defineStore } from 'pinia';
import { ref } from 'vue';
import dayjs from '@/services/dayjs.js';
import { useAuthStore } from '@/stores/auth.js';
import { useUserStore } from '@/stores/user.js';
import * as gCalAPI from '@/services/google-calendar-api.js';
import { readOffline, writeOffline } from '@/services/offline-storage.js';

/**
 * @typedef {Object} OrbitShareSpec 範囲指定共有の条件
 * @property {string} id 共有の一意な ID
 * @property {string} title 共有カレンダーの表示名
 * @property {string} recipient 共有相手のメールアドレス
 * @property {string[]} calendarIds コピー元カレンダー ID の一覧
 * @property {string} rangeStart 共有範囲の開始日（YYYY-MM-DD）
 * @property {string} rangeEnd 共有範囲の終了日（YYYY-MM-DD、当日を含む）
 * @property {string} expiresAt 共有の有効期限（YYYY-MM-DD、当日を含む）
 * @property {'freeBusyReader'|'reader'} role 共有相手の権限
 * @property {string|null} copyCalendarId 作成したコピーカレンダーの ID
 * @property {string|null} aclRuleId 共有相手に付与した ACL ルール ID
 * @property {string} createdAt 作成日時（ISO 文字列）
 * @property {string|null} lastSyncedAt 最後にコピー同期を行った日時
 */

/** オフラインストレージ上の共有条件キー */
const SHARE_SPECS_KEY = 'share-specs';
/** コピーイベントのコピー元を記録する拡張プロパティ名 */
const SOURCE_PROP = 'orbitShareSource';
/** コピーイベントに記録するコピー元の更新日時プロパティ名 */
const SOURCE_UPDATED_PROP = 'orbitShareUpdated';
/** 共有同期の定期実行間隔 */
const SYNC_INTERVAL_MS = 5 * 60_000;
/** イベント変更から共有同期をまとめて実行するまでの待ち時間 */
const SYNC_DEBOUNCE_MS = 10_000;

/**
 * コピー元イベントをコピー先カレンダー用のペイロードに変換する。
 * 出席者や会議データはコピーしない（招待通知や権限が漏れるのを防ぐため）。
 * freeBusyReader の場合は詳細を伏せて「予定あり」としてコピーする。
 * @param {GoogleCalendarEvent} evt コピー元イベント
 * @param {string} sourceKey コピー元を識別するキー
 * @param {OrbitShareSpec['role']} role 共有権限
 * @returns {Partial<GoogleCalendarEvent>}
 */
function toCopyBody(evt, sourceKey, role) {
  const isFreeBusy = role === 'freeBusyReader';
  return {
    summary: isFreeBusy ? '予定あり' : evt.summary,
    start: evt.start,
    end: evt.end,
    ...(isFreeBusy ? {} : { description: evt.description, location: evt.location }),
    transparency: evt.transparency,
    extendedProperties: {
      private: {
        [SOURCE_PROP]: sourceKey,
        [SOURCE_UPDATED_PROP]: evt.updated ?? '',
      },
    },
  };
}

/**
 * 指定カレンダーのイベントをページネーションを辿って全て取得する
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {GoogleCalendarEventsListQueryParams} [query={}] クエリパラメータ
 * @returns {Promise<GoogleCalendarEvent[]>}
 */
async function listAllEvents(token, gCalendarId, query = {}) {
  const items = [];
  let pageToken;
  do {
    const response = await gCalAPI.listEvents(token, gCalendarId, { ...query, ...(pageToken ? { pageToken } : {}) });
    if (Array.isArray(response?.items)) items.push(...response.items);
    pageToken = response?.nextPageToken;
  } while (pageToken);
  return items;
}

export const useShareStore = defineStore('share', () => {
  const authStore = useAuthStore();
  const userStore = useUserStore();

  /** @type {Ref<OrbitShareSpec[]>} 有効な共有条件の一覧 */
  const specs = ref([]);
  /** @type {Ref<boolean>} 共有処理を実行中かどうか */
  const isBusy = ref(false);
  /** @type {Ref<string>} 共有処理中のメッセージ */
  const busyMessage = ref('');
  /** @type {Ref<string|null>} 直近の同期エラー */
  const lastSyncError = ref(null);

  /** @type {Set<string>} 同期中の共有 ID */
  const syncingIds = new Set();
  /** @type {Set<string>} 同期中に再度同期を要求された共有 ID */
  const queuedIds = new Set();
  /** @type {number|null} イベント変更からの遅延同期タイマー */
  let debounceTimer = null;
  /** @type {boolean} 定期実行が開始済みかどうか */
  let initialized = false;

  async function persistSpecs() {
    await writeOffline(SHARE_SPECS_KEY, specs.value);
  }

  async function loadSpecs() {
    const saved = await readOffline(SHARE_SPECS_KEY, []);
    if (!Array.isArray(saved)) return;
    specs.value = saved.filter((/** @type {any} */ spec) => spec && typeof spec.id === 'string' && Array.isArray(spec.calendarIds));
  }

  /**
   * 共有が有効期限切れかどうか（expiresAt の当日終了までは有効）
   * @param {OrbitShareSpec} spec
   * @returns {boolean}
   */
  function isExpired(spec) {
    return dayjs().isAfter(dayjs(spec.expiresAt).endOf('day'));
  }

  /**
   * 共有条件に合うコピー元イベントを全て取得する
   * @param {OrbitShareSpec} spec
   * @returns {Promise<Map<string, {evt: GoogleCalendarEvent, body: Partial<GoogleCalendarEvent>}>>} コピー元キー → イベントとコピー用ペイロード
   */
  async function listSourceEvents(spec) {
    const timeMin = dayjs(spec.rangeStart).startOf('day').toISOString();
    const timeMax = dayjs(spec.rangeEnd).add(1, 'day').startOf('day').toISOString();
    const wanted = new Map();
    for (const calendarId of spec.calendarIds) {
      const events = await listAllEvents(authStore.token, calendarId, { timeMin, timeMax, singleEvents: true, orderBy: 'startTime' });
      for (const evt of events) {
        if (!evt?.id || evt.status === 'cancelled') continue;
        const key = `${calendarId}:${evt.id}`;
        wanted.set(key, { evt, body: toCopyBody(evt, key, spec.role) });
      }
    }
    return wanted;
  }

  /**
   * コピーカレンダー内の既存コピーイベントを取得する
   * @param {string} copyCalendarId
   * @returns {Promise<Map<string, GoogleCalendarEvent>>} コピー元キー → コピーイベント
   */
  async function listCopyEvents(copyCalendarId) {
    const events = await listAllEvents(authStore.token, copyCalendarId, { showDeleted: false });
    const map = new Map();
    for (const evt of events) {
      const sourceKey = evt?.extendedProperties?.private?.[SOURCE_PROP];
      if (typeof sourceKey === 'string') map.set(sourceKey, evt);
    }
    return map;
  }

  /**
   * 1件の共有についてコピーカレンダーとコピー元を同期する。
   * 期限切れの場合はコピーカレンダーごと削除する。
   * @param {OrbitShareSpec} spec
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
      if (isExpired(spec)) {
        await removeShare(spec.id);
        return true;
      }
      if (!spec.copyCalendarId) return false;

      const [wanted, copyMap] = await Promise.all([listSourceEvents(spec), listCopyEvents(spec.copyCalendarId)]);

      for (const [key, { body }] of wanted) {
        const existing = copyMap.get(key);
        copyMap.delete(key);
        if (!existing?.id) {
          await gCalAPI.insertEvent(authStore.token, spec.copyCalendarId, body);
        } else if (existing.extendedProperties?.private?.[SOURCE_UPDATED_PROP] !== body.extendedProperties?.private?.[SOURCE_UPDATED_PROP]) {
          await gCalAPI.patchEvent(authStore.token, spec.copyCalendarId, existing.id, body);
        }
      }
      // コピー元に存在しないコピー（削除済み・範囲外になった予定）を除去
      for (const evt of copyMap.values()) {
        if (evt?.id) await gCalAPI.deleteEvent(authStore.token, spec.copyCalendarId, evt.id).catch(() => null);
      }

      spec.lastSyncedAt = new Date().toISOString();
      await persistSpecs();
      return true;
    } catch (error) {
      console.warn(`Failed to sync shared calendar ${spec.copyCalendarId}.`, error);
      lastSyncError.value = error instanceof Error ? error.message : String(error);
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
    for (const spec of [...specs.value]) {
      await syncShare(spec);
    }
  }

  /**
   * 予定の変更に応じて共有同期を予約する（短時間の連続変更はまとめる）。
   * @returns {void}
   */
  function scheduleShareSync() {
    if (!initialized) return;
    if (debounceTimer !== null) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      debounceTimer = null;
      syncAllShares();
    }, SYNC_DEBOUNCE_MS);
  }

  /**
   * 共有条件に従ってコピーカレンダーの作成・予定コピー・ACL 共有を行う。
   * @param {{title: string, recipient: string, calendarIds: string[], rangeStart: string, rangeEnd: string, expiresAt: string, role: 'freeBusyReader'|'reader'}} input 共有条件
   * @returns {Promise<OrbitShareSpec>} 作成された共有条件
   */
  async function createShare(input) {
    if (!authStore.token || userStore.isOffline) throw new Error('共有を作成するにはオンラインでログインしている必要があります。');
    const spec = /** @type {OrbitShareSpec} */ ({
      id: `share-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`,
      title: input.title,
      recipient: input.recipient.trim(),
      calendarIds: [...input.calendarIds],
      rangeStart: input.rangeStart,
      rangeEnd: input.rangeEnd,
      expiresAt: input.expiresAt,
      role: input.role,
      copyCalendarId: null,
      aclRuleId: null,
      createdAt: new Date().toISOString(),
      lastSyncedAt: null,
    });

    isBusy.value = true;
    busyMessage.value = '共有用のカレンダーを作成しています...';
    try {
      // コピーカレンダーの作成
      const calendar = await gCalAPI.insertCalendar(authStore.token, {
        summary: spec.title,
        description: `${spec.rangeStart} 〜 ${spec.rangeEnd} の予定を ${spec.recipient} と共有（Orbit により自動作成）`,
      });
      if (!calendar?.id) throw new Error('共有用カレンダーを作成できませんでした。');
      spec.copyCalendarId = calendar.id;

      // 条件に合う予定をコピー
      busyMessage.value = '予定をコピーしています...';
      const wanted = await listSourceEvents(spec);
      for (const { body } of wanted.values()) {
        await gCalAPI.insertEvent(authStore.token, calendar.id, body);
      }
      spec.lastSyncedAt = new Date().toISOString();

      // 相手に共有（閲覧権限を付与して招待メールを送信）
      busyMessage.value = '共有設定を登録しています...';
      const rule = await gCalAPI.insertAcl(authStore.token, calendar.id, { scope: { type: 'user', value: spec.recipient }, role: spec.role }, { sendNotifications: true });
      spec.aclRuleId = rule?.id ?? null;

      specs.value = [...specs.value, spec];
      await persistSpecs();
      return spec;
    } catch (error) {
      // 途中で失敗した場合は作成したカレンダーを掃除する
      if (spec.copyCalendarId) await gCalAPI.deleteCalendar(authStore.token, spec.copyCalendarId).catch(() => null);
      throw error;
    } finally {
      isBusy.value = false;
      busyMessage.value = '';
    }
  }

  /**
   * 共有を解除してコピーカレンダーを削除する（カレンダーの削除で相手側からも消える）。
   * @param {string} specId 共有 ID
   * @returns {Promise<void>}
   */
  async function removeShare(specId) {
    const spec = specs.value.find((item) => item.id === specId);
    if (!spec) return;
    if (spec.copyCalendarId && authStore.token && !userStore.isOffline) {
      await gCalAPI.deleteCalendar(authStore.token, spec.copyCalendarId).catch((error) => {
        if (error?.status !== 404 && error?.status !== 410) throw error;
      });
    }
    specs.value = specs.value.filter((item) => item.id !== specId);
    await persistSpecs();
  }

  /**
   * 共有同期の定期実行を開始する。
   * @returns {Promise<void>}
   */
  async function initShareSync() {
    if (initialized) return;
    initialized = true;
    await loadSpecs();
    window.setInterval(syncAllShares, SYNC_INTERVAL_MS);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) syncAllShares();
    });
    window.addEventListener('online', syncAllShares);
    syncAllShares();
  }

  return {
    specs,
    isBusy,
    busyMessage,
    lastSyncError,
    isExpired,
    createShare,
    removeShare,
    syncShare,
    syncAllShares,
    scheduleShareSync,
    initShareSync,
  };
});
