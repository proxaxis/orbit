/**
 * カレンダーの取得・作成・更新・削除と共有設定（ACL）を担うコンポーザブル。
 * Google Calendar API の呼び出しとストア状態の同期をここに集約する。
 */
import * as gCalAPI from '@/services/google-calendar-api.js';
import { useAuthStore } from '@/stores/auth.js';
import { useCalendarStore } from '@/stores/calendar.js';
import { useUserStore } from '@/stores/user.js';
import { CACHE_KEYS, readCache } from '@/composables/useCache.js';

/**
 * カレンダー操作のコンポーザブル
 * @returns {Object} カレンダー操作関数群
 */
export function useCalendars() {
  const authStore = useAuthStore();
  const calendarStore = useCalendarStore();
  const userStore = useUserStore();

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
    searchSessionCalendar,
    createCalendar,
    addCalendarListEntry,
    updateCalendarResource,
    updateCalendarListEntry,
    fetchCalendarListEntry,
    fetchCalendarResource,
    deleteCalendar,
    listAclRules,
    addAclRule,
    updateAclRule,
    removeAclRule,
  };
}
