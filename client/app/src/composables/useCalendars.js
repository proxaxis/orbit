/**
 * カレンダーの取得・作成・更新・削除と共有設定（ACL）を担うコンポーザブル。
 * Google Calendar API の呼び出しとストア状態の同期をここに集約する。
 */
import * as gCalAPI from '@/services/google-calendar-api.js';
import { useAuthStore } from '@/stores/auth.js';
import { useCalendarStore } from '@/stores/calendar.js';
import { useEventStore } from '@/stores/event.js';
import { useShareStore } from '@/stores/share.js';
import { useUserStore } from '@/stores/user.js';
import { CACHE_KEYS, deleteCache, readCache, writeCache } from '@/composables/useCache.js';
import { resetSharedEventCache } from '@/composables/useCalendarEvents.js';
import { resetNotificationHistory } from '@/composables/useNotifications.js';
import { resetSearchCache } from '@/composables/usePeople.js';

/** アカウント切替時に破棄するアカウント由来の IndexedDB キャッシュキー */
const ACCOUNT_SCOPED_CACHE_KEYS = [
  CACHE_KEYS.EVENTS,
  CACHE_KEYS.CALENDARS,
  CACHE_KEYS.SESSION_CALENDARS,
  CACHE_KEYS.EVENT_OPERATIONS,
  CACHE_KEYS.SHARE_SPECS,
  CACHE_KEYS.NOTIFIED_EVENTS,
  CACHE_KEYS.NOTIFICATION_SCHEDULE,
  CACHE_KEYS.RECENT_EVENT_TITLES,
  CACHE_KEYS.RECENT_EVENT_TAGS,
  CACHE_KEYS.REMOTE_SYNC_CHECKED_AT,
];

/**
 * カレンダー操作のコンポーザブル
 * @returns {Object} カレンダー操作関数群
 */
export function useCalendars() {
  const authStore = useAuthStore();
  const calendarStore = useCalendarStore();
  const eventStore = useEventStore();
  const shareStore = useShareStore();
  const userStore = useUserStore();

  /** 前アカウント由来の永続キャッシュとメモリキャッシュを全て破棄する */
  async function resetAccountScopedData() {
    await Promise.all(ACCOUNT_SCOPED_CACHE_KEYS.map((key) => deleteCache(key)));
    eventStore.clearEventCache();
    eventStore.setPendingOperations([]);
    shareStore.setSpecs([]);
    calendarStore.setSessionCalendars([]);
    userStore.clearEventInputHistories();
    resetSharedEventCache();
    resetNotificationHistory();
    resetSearchCache();
  }

  /**
   * 取得済みトークンのアカウントと前回ログイン時のアカウントを比較し、
   * 変わっていれば前アカウント由来のキャッシュを破棄する。
   * @param {GoogleCalendarListEntry[]} listEntries calendarList の最新一覧
   * @returns {Promise<void>}
   */
  async function syncAccountIdentity(listEntries) {
    // プライマリカレンダーの ID はアカウントのメールアドレスなので、アカウント識別子として使う
    const accountId = listEntries.find((entry) => entry.primary)?.id ?? null;
    if (!accountId) return;
    const previousAccountId = await readCache(CACHE_KEYS.ACCOUNT_ID, null);
    if (previousAccountId === accountId) return;
    if (previousAccountId) await resetAccountScopedData();
    await writeCache(CACHE_KEYS.ACCOUNT_ID, accountId);
  }

  /**
   * オフラインキャッシュと API からカレンダー一覧を読み込み、ストアへ反映する
   * @returns {Promise<void>}
   */
  async function loadCalendars() {
    const savedCalendars = await readCache(CACHE_KEYS.CALENDARS, []);
    const savedSessionCalendars = await readCache(CACHE_KEYS.SESSION_CALENDARS, []);
    if (Array.isArray(savedCalendars) && savedCalendars.length > 0) calendarStore.setCalendars(savedCalendars);
    if (Array.isArray(savedSessionCalendars)) calendarStore.setSessionCalendars(savedSessionCalendars);
    if (!authStore.isAuthenticated || userStore.isOffline) return;

    userStore.setLoading(true, 'Loading calendars...');
    try {
      const response = await gCalAPI.listCalendarList(authStore.token);
      const listEntries = Array.isArray(response?.items) ? response.items : [];
      await syncAccountIdentity(listEntries);
      calendarStore.setCalendars(listEntries);
    } catch (err) {
      userStore.setError(true, err);
    } finally {
      userStore.setLoading(false);
    }
  }

  /**
   * カレンダー ID でカレンダーを検索し、セッションカレンダーとして保存する
   * @param {string} calendarId カレンダー ID
   * @returns {Promise<GoogleCalendarListEntry|null>} 見つかったカレンダー
   */
  async function searchSessionCalendar(calendarId) {
    const normalizedId = calendarId.trim();
    if (!normalizedId || !authStore.isAuthenticated || userStore.isOffline) return null;
    const resource = await gCalAPI.getCalendar(authStore.token, normalizedId);
    calendarStore.addSessionCalendar(resource);
    return calendarStore.list.find((item) => item.id === normalizedId) ?? null;
  }

  /**
   * 新しいカレンダーを作成し、一覧へ追加する
   * @param {GoogleCalendarResource} body 作成するカレンダーの内容
   * @param {string} [colorId] カレンダーリストへ適用する色 ID
   * @returns {Promise<GoogleCalendarResource>} 作成されたカレンダー
   */
  async function createCalendar(body, colorId) {
    const resource = await gCalAPI.insertCalendar(authStore.token, body);
    if (colorId && resource?.id) await gCalAPI.patchCalendarListEntry(authStore.token, resource.id, { colorId });
    await loadCalendars();
    return resource;
  }

  /**
   * 既存カレンダーをカレンダーリストへ追加する
   * @param {GoogleCalendarListEntry} body 追加するカレンダーリストエントリ
   * @returns {Promise<GoogleCalendarListEntry>} 追加されたエントリ
   */
  async function addCalendarListEntry(body) {
    const entry = await gCalAPI.insertCalendarListEntry(authStore.token, body);
    await loadCalendars();
    return entry;
  }

  /**
   * カレンダー本体の内容を更新する
   * @param {string} calendarId カレンダー ID
   * @param {Partial<GoogleCalendarResource>} body 更新内容
   * @returns {Promise<GoogleCalendarResource>} 更新されたカレンダー
   */
  async function updateCalendarResource(calendarId, body) {
    return gCalAPI.patchCalendar(authStore.token, calendarId, body);
  }

  /**
   * カレンダーリストエントリの表示設定（色など）を更新し、ストアへ反映する
   * @param {string} calendarId カレンダー ID
   * @param {Partial<GoogleCalendarListEntry>} body 更新内容
   * @returns {Promise<GoogleCalendarListEntry>} 更新されたエントリ
   */
  async function updateCalendarListEntry(calendarId, body) {
    const entry = await gCalAPI.patchCalendarListEntry(authStore.token, calendarId, body);
    if (entry?.id) calendarStore.updateCalendar(entry);
    return entry;
  }

  /**
   * カレンダーリストエントリ（表示設定を含む自分のリスト上の情報）を取得する
   * @param {string} calendarId カレンダー ID
   * @returns {Promise<GoogleCalendarListEntry>} リストエントリ
   */
  function fetchCalendarListEntry(calendarId) {
    return gCalAPI.getCalendarListEntry(authStore.token, calendarId);
  }

  /**
   * カレンダー本体（共有されている側のリソース情報）を取得する
   * @param {string} calendarId カレンダー ID
   * @returns {Promise<GoogleCalendarResource>} カレンダーリソース
   */
  function fetchCalendarResource(calendarId) {
    return gCalAPI.getCalendar(authStore.token, calendarId);
  }

  /**
   * カレンダーを削除して一覧から除去する。共有されたカレンダーはリストからの除去のみを試みる。
   * @param {string} calendarId カレンダー ID
   * @param {{deleteResource: boolean}} options カレンダー本体も削除するか
   * @returns {Promise<void>}
   */
  async function deleteCalendar(calendarId, { deleteResource } = { deleteResource: true }) {
    if (deleteResource) await gCalAPI.deleteCalendar(authStore.token, calendarId);
    else await gCalAPI.deleteCalendarListEntry(authStore.token, calendarId);
    calendarStore.removeCalendar(calendarId);
  }

  /**
   * カレンダーの共有設定（ACL）一覧を取得する
   * @param {string} calendarId カレンダー ID
   * @returns {Promise<GoogleCalendarAclRule[]>} ACL ルール一覧
   */
  async function listAclRules(calendarId) {
    const response = await gCalAPI.listAcl(authStore.token, calendarId, { maxResults: 250 });
    return Array.isArray(response?.items) ? response.items : [];
  }

  /**
   * 複数カレンダーの共有設定（ACL）一覧を BFF のバッチリクエストでまとめて取得する
   * @param {string[]} calendarIds カレンダー ID の一覧
   * @returns {Promise<(GoogleCalendarAclRule[]|null)[]>} calendarIds と同じ順序のルール一覧（失敗時は null）
   */
  function listAclRulesBatch(calendarIds) {
    return gCalAPI.listAclBatch(authStore.token, calendarIds, { maxResults: 250 });
  }

  /**
   * 共有設定画面の初期読み込み。対象カレンダーの ACL 一覧とカレンダー一覧を
   * BFF のバッチリクエストで 1 ジョブにまとめて取得する。
   * @param {string} calendarId カレンダー ID
   * @returns {Promise<{rules: GoogleCalendarAclRule[], listEntries: GoogleCalendarListEntry[]|null}>} ACL 一覧とカレンダー一覧（一覧の取得失敗時は null）
   */
  async function listAclRulesWithCalendarList(calendarId) {
    const [aclResult, listResult] = await gCalAPI.fetchCalendarAPIBatch(authStore.token, [
      { method: 'GET', endpoint: `/calendars/$gCalendarId/acl`, params: { gCalendarId: calendarId }, query: { maxResults: 250 } },
      { method: 'GET', endpoint: `/users/me/calendarList` },
    ]);
    if (!aclResult.ok) {
      const error = new Error(aclResult.data?.error?.message || `API: GET ${aclResult.status}`);
      Object.assign(error, { status: aclResult.status, details: aclResult.data });
      throw error;
    }
    return {
      rules: Array.isArray(aclResult.data?.items) ? aclResult.data.items : [],
      listEntries: listResult.ok && Array.isArray(listResult.data?.items) ? listResult.data.items : null,
    };
  }

  /**
   * カレンダーへ共有設定（ACL）を追加する
   * @param {string} calendarId カレンダー ID
   * @param {GoogleCalendarAclRule} body ACL ルール
   * @returns {Promise<GoogleCalendarAclRule>} 追加されたルール
   */
  function addAclRule(calendarId, body) {
    return gCalAPI.insertAcl(authStore.token, calendarId, body, { sendNotifications: true });
  }

  /**
   * カレンダーの共有設定（ACL）を更新する
   * @param {string} calendarId カレンダー ID
   * @param {string} ruleId ACL ルール ID
   * @param {{role: string}} body 更新内容
   * @returns {Promise<GoogleCalendarAclRule>} 更新されたルール
   */
  function updateAclRule(calendarId, ruleId, body) {
    return gCalAPI.patchAcl(authStore.token, calendarId, ruleId, body);
  }

  /**
   * カレンダーの共有設定（ACL）を削除する
   * @param {string} calendarId カレンダー ID
   * @param {string} ruleId ACL ルール ID
   * @returns {Promise<void>}
   */
  function removeAclRule(calendarId, ruleId) {
    return gCalAPI.deleteAcl(authStore.token, calendarId, ruleId);
  }

  return {
    loadCalendars,
    syncAccountIdentity,
    searchSessionCalendar,
    createCalendar,
    addCalendarListEntry,
    updateCalendarResource,
    updateCalendarListEntry,
    fetchCalendarListEntry,
    fetchCalendarResource,
    deleteCalendar,
    listAclRules,
    listAclRulesBatch,
    listAclRulesWithCalendarList,
    addAclRule,
    updateAclRule,
    removeAclRule,
  };
}
