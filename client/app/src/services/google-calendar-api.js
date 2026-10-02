import { useAuthStore } from '@/stores/auth.js';

/** @type {string|undefined} Google Calendar API のベース URL */
export const API_BASE_URL = import.meta.env.VITE_GOOGLE_CALENDAR_API_BASE_URL;

/**
 * 予定の一覧取得
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {EventsListQueryParams} [query={}] クエリパラメータ
 * @returns {Promise<EventsListResponse>} API レスポンス
 */
export function listEvents(token, gCalendarId, query = {}) {
  return fetchCalendarAPI(token, 'GET', `/calendars/$gCalendarId/events`, { params: { gCalendarId }, query });
}

/**
 * 特定の予定の取得
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {string} gEventId 予定 ID
 * @param {Object} [query={}] クエリパラメータ
 * @returns {Promise<Response>} API レスポンス
 */
export function getEvent(token, gCalendarId, gEventId, query = {}) {
  return fetchCalendarAPI(token, 'GET', `/calendars/$gCalendarId/events/$gEventId`, { params: { gCalendarId, gEventId }, query });
}

/**
 * 予定の作成
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {Object} body リクエストボディ
 * @param {Object} [query={}] クエリパラメータ
 * @returns {Promise<Response>} API レスポンス
 */
export function insertEvent(token, gCalendarId, body, query = {}) {
  return fetchCalendarAPI(token, 'POST', `/calendars/$gCalendarId/events`, { params: { gCalendarId }, body, query });
}

/**
 * 予定の完全更新（PUT による完全置換）
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {string} gEventId 予定 ID
 * @param {Object} body リクエストボディ
 * @param {Object} [query={}] クエリパラメータ
 * @returns {Promise<Response>} API レスポンス
 */
export function updateEvent(token, gCalendarId, gEventId, body, query = {}) {
  return fetchCalendarAPI(token, 'PUT', `/calendars/$gCalendarId/events/$gEventId`, { params: { gCalendarId, gEventId }, body, query });
}

/**
 * 予定の部分更新
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {string} gEventId 予定 ID
 * @param {Object} body リクエストボディ
 * @param {Object} [query={}] クエリパラメータ
 * @returns {Promise<Response>} API レスポンス
 */
export function patchEvent(token, gCalendarId, gEventId, body, query = {}) {
  return fetchCalendarAPI(token, 'PATCH', `/calendars/$gCalendarId/events/$gEventId`, { params: { gCalendarId, gEventId }, body, query });
}

/**
 * 予定の削除
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {string} gEventId 予定 ID
 * @param {Object} [query={}] クエリパラメータ
 * @returns {Promise<Response>} API レスポンス
 */
export function deleteEvent(token, gCalendarId, gEventId, query = {}) {
  return fetchCalendarAPI(token, 'DELETE', `/calendars/$gCalendarId/events/$gEventId`, { params: { gCalendarId, gEventId }, query });
}

/**
 * 予定を別のカレンダーに移動
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {string} gEventId 予定 ID
 * @param {string} destinationCalendarId 移動先のカレンダー ID
 * @param {Object} [query={}] クエリパラメータ
 * @returns {Promise<Response>} API レスポンス
 */
export function moveEvent(token, gCalendarId, gEventId, destinationCalendarId, query = {}) {
  return fetchCalendarAPI(token, 'POST', `/calendars/$gCalendarId/events/$gEventId/move`, { params: { gCalendarId, gEventId, destination: destinationCalendarId }, query });
}

/**
 * 予定のインポート（iCal 形式のメタデータを含む作成）
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {Object} body リクエストボディ
 * @param {Object} [query={}] クエリパラメータ
 * @returns {Promise<Response>} API レスポンス
 */
export function importEvent(token, gCalendarId, body, query = {}) {
  return fetchCalendarAPI(token, 'POST', `/calendars/$gCalendarId/events/import`, { params: { gCalendarId }, body, query });
}

/**
 * 繰り返し予定の各インスタンスを取得
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {string} gEventId 予定 ID
 * @param {Object} [query={}] クエリパラメータ
 * @returns {Promise<Response>} API レスポンス
 */
export function listEventInstances(token, gCalendarId, gEventId, query = {}) {
  return fetchCalendarAPI(token, 'GET', `/calendars/$gCalendarId/events/$gEventId/instances`, { params: { gCalendarId, gEventId }, query });
}

/**
 * イベントの変更監視
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {Object} body リクエストボディ
 * @param {Object} [query={}] クエリパラメータ
 * @returns {Promise<Response>} API レスポンス
 */
export function watchEvents(token, gCalendarId, body, query = {}) {
  return fetchCalendarAPI(token, 'POST', `/calendars/$gCalendarId/events/watch`, { params: { gCalendarId }, body, query });
}

/**
 * カレンダーメタデータの取得
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @returns {Promise<Response>} API レスポンス
 */
export function getCalendar(token, gCalendarId) {
  return fetchCalendarAPI(token, 'GET', `/calendars/$gCalendarId`, { params: { gCalendarId } });
}

/**
 * 新しいセカンダリカレンダーの作成
 * @param {string} token アクセストークン
 * @param {Object} body リクエストボディ
 * @returns {Promise<Response>} API レスポンス
 */
export function insertCalendar(token, body) {
  return fetchCalendarAPI(token, 'POST', '/calendars', { body });
}

/**
 * カレンダーメタデータの完全更新（PUT による完全置換）
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {Object} body リクエストボディ
 * @returns {Promise<Response>} API レスポンス
 */
export function updateCalendar(token, gCalendarId, body) {
  return fetchCalendarAPI(token, 'PUT', `/calendars/$gCalendarId`, { params: { gCalendarId }, body });
}

/**
 * カレンダーメタデータの部分更新
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {Object} body リクエストボディ
 * @returns {Promise<Response>} API レスポンス
 */
export function patchCalendar(token, gCalendarId, body) {
  return fetchCalendarAPI(token, 'PATCH', `/calendars/$gCalendarId`, { params: { gCalendarId }, body });
}

/**
 * セカンダリカレンダーの削除
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @returns {Promise<Response>} API レスポンス
 */
export function deleteCalendar(token, gCalendarId) {
  return fetchCalendarAPI(token, 'DELETE', `/calendars/$gCalendarId`, { params: { gCalendarId } });
}

/**
 * カレンダーの内容をすべてクリア（初期化）
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @returns {Promise<Response>} API レスポンス
 */
export function clearCalendar(token, gCalendarId = 'primary') {
  return fetchCalendarAPI(token, 'POST', `/calendars/$gCalendarId/clear`, { params: { gCalendarId } });
}

/**
 * ユーザのカレンダーリストを取得
 * @param {string} token アクセストークン
 * @param {Object} [query={}] クエリパラメータ
 * @returns {Promise<{ items: GoogleCalendarListEntry[] }>} API レスポンス
 */
export function listCalendarList(token, query = {}) {
  return fetchCalendarAPI(token, 'GET', `/users/me/calendarList`, { query });
}

/**
 * 特定のカレンダーリストエントリを取得
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @returns {Promise<Response>} API レスポンス
 */
export function getCalendarListEntry(token, gCalendarId) {
  return fetchCalendarAPI(token, 'GET', `/users/me/calendarList/$gCalendarId`, { params: { gCalendarId } });
}

/**
 * カレンダーリストエントリをユーザーのカレンダー一覧に追加
 * @param {string} token アクセストークン
 * @param {Object} body リクエストボディ
 * @param {Object} [query={}] クエリパラメータ
 * @returns {Promise<Response>} API レスポンス
 */
export function insertCalendarListEntry(token, body, query = {}) {
  return fetchCalendarAPI(token, 'POST', `/users/me/calendarList`, { query, body });
}

/**
 * カレンダーリストエントリの完全更新（PUT による完全置換）
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {Object} body リクエストボディ
 * @param {Object} [query={}] クエリパラメータ
 * @returns {Promise<Response>} API レスポンス
 */
export function updateCalendarListEntry(token, gCalendarId, body, query = {}) {
  return fetchCalendarAPI(token, 'PUT', `/users/me/calendarList/$gCalendarId`, { params: { gCalendarId }, body, query });
}

/**
 * カレンダーリストエントリの部分更新
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {Object} body リクエストボディ
 * @param {Object} [query={}] クエリパラメータ
 * @returns {Promise<Response>} API レスポンス
 */
export function patchCalendarListEntry(token, gCalendarId, body, query = {}) {
  return fetchCalendarAPI(token, 'PATCH', `/users/me/calendarList/$gCalendarId`, { params: { gCalendarId }, body, query });
}

/**
 * カレンダーリストエントリを削除
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @returns {Promise<Response>} API レスポンス
 */
export function deleteCalendarListEntry(token, gCalendarId) {
  return fetchCalendarAPI(token, 'DELETE', `/users/me/calendarList/$gCalendarId`, { params: { gCalendarId } });
}

/**
 * カレンダーリストの変更監視
 * @param {string} token アクセストークン
 * @param {Object} body リクエストボディ
 * @param {Object} [query={}] クエリパラメータ
 * @returns {Promise<Response>} API レスポンス
 */
export function watchCalendarListEntry(token, body, query = {}) {
  return fetchCalendarAPI(token, 'POST', `/users/me/calendarList/watch`, { body, query });
}

/**
 * カレンダーの権限ルール一覧を取得
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {Object} [query={}] クエリパラメータ
 * @returns {Promise<Response>} API レスポンス
 */
export function listAcl(token, gCalendarId, query = {}) {
  return fetchCalendarAPI(token, 'GET', `/calendars/$gCalendarId}/acl`, { params: { gCalendarId }, query });
}

/**
 * 特定の権限ルールを取得
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {string} gRuleId 権限ルール ID
 * @returns {Promise<Response>} API レスポンス
 */
export function getAcl(token, gCalendarId, gRuleId) {
  return fetchCalendarAPI(token, 'GET', `/calendars/$gCalendarId/acl/$gRuleId`, { params: { gCalendarId, gRuleId } });
}

/**
 * 新しい権限ルールを作成
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {Object} body リクエストボディ
 * @param {Object} [query={}] クエリパラメータ
 * @returns {Promise<Response>} API レスポンス
 */
export function insertAcl(token, gCalendarId, body, query = {}) {
  return fetchCalendarAPI(token, 'POST', `/calendars/$gCalendarId/acl`, { params: { gCalendarId }, body, query });
}

/**
 * 権限ルールの完全更新（PUT による完全置換）
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {string} gRuleId 権限ルール ID
 * @param {Object} body リクエストボディ
 * @param {Object} [query={}] クエリパラメータ
 * @returns {Promise<Response>} API レスポンス
 */
export function updateAcl(token, gCalendarId, gRuleId, body, query = {}) {
  return fetchCalendarAPI(token, 'PUT', `/calendars/$gCalendarId/acl/$gRuleId`, { params: { gCalendarId, gRuleId }, body, query });
}

/**
 * 権限ルールの部分更新
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {string} gRuleId 権限ルール ID
 * @param {Object} body リクエストボディ
 * @param {Object} [query={}] クエリパラメータ
 * @returns {Promise<Response>} API レスポンス
 */
export function patchAcl(token, gCalendarId, gRuleId, body, query = {}) {
  return fetchCalendarAPI(token, 'PATCH', `/calendars/$gCalendarId/acl/$gRuleId`, { params: { gCalendarId, gRuleId }, body, query });
}

/**
 * 権限ルールの削除
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {string} gRuleId 権限ルール ID
 * @returns {Promise<Response>} API レスポンス
 */
export function deleteAcl(token, gCalendarId, gRuleId) {
  return fetchCalendarAPI(token, 'DELETE', `/calendars/$gCalendarId/acl/$gRuleId`, { params: { gCalendarId, gRuleId } });
}

/**
 * 権限ルールの変更監視
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {Object} body リクエストボディ
 * @param {Object} [query={}] クエリパラメータ
 * @returns {Promise<Response>} API レスポンス
 */
export function watchAcl(token, gCalendarId, body, query = {}) {
  return fetchCalendarAPI(token, 'POST', `/calendars/$gCalendarId/acl/watch`, { params: { gCalendarId }, body, query });
}

/**
 * 指定した時間範囲のカレンダーの空き時間情報を取得
 * @param {string} token アクセストークン
 * @param {Object} body リクエストボディ
 * @returns {Promise<Response>} API レスポンス
 */
export function queryFreebusy(token, body) {
  return fetchCalendarAPI(token, 'POST', `/freeBusy`, { body });
}

/**
 * ユーザー設定の一覧を取得
 * @param {string} token アクセストークン
 * @param {Object} [query={}] クエリパラメータ
 * @returns {Promise<Response>} API レスポンス
 */
export function listSettings(token, query = {}) {
  return fetchCalendarAPI(token, 'GET', `/users/me/settings`, { query });
}

/**
 * 特定のユーザー設定を取得
 * @param {string} token アクセストークン
 * @param {string} gSettingId 設定 ID
 * @returns {Promise<Response>} API レスポンス
 */
export function getSetting(token, gSettingId) {
  return fetchCalendarAPI(token, 'GET', `/users/me/settings/$gSettingId`, { params: { gSettingId } });
}

/**
 * ユーザー設定の変更監視
 * @param {string} token アクセストークン
 * @param {Object} body リクエストボディ
 * @param {Object} [query={}] クエリパラメータ
 * @returns {Promise<Response>} API レスポンス
 */
export function watchSettings(token, body, query = {}) {
  return fetchCalendarAPI(token, 'POST', `/users/me/settings/watch`, { body, query });
}

/**
 * カレンダーおよび予定で使用可能なカラーパレット情報を取得
 * @param {string} token アクセストークン
 * @returns {Promise<Response>} API レスポンス
 */
export function getColors(token) {
  return fetchCalendarAPI(token, 'GET', '/colors');
}

/**
 * Push通知チャネルを停止
 * @param {string} token アクセストークン
 * @param {Object} body リクエストボディ
 * @returns {Promise<Response>} API レスポンス
 */
export function stopChannel(token, body) {
  return fetchCalendarAPI(token, 'POST', '/channels/stop', { body });
}

/**
 * Google Calendar API エンドポイントへリクエストを送信
 * @param {string|null} token アクセストークン
 * @param {string} method HTTP メソッド
 * @param {string} endpoint エンドポイントのパス（ベース URL からの相対パス、例: /calendars）
 * @param {object} [options={}] リクエストオプション
 * @param {object} [options.query={}] URL パラメータ（自動で $ が付与される、例: $id => 123）
 * @param {object} [options.params={}] クエリパラメータ
 * @param {object|null} [options.body=null] リクエストボディ
 * @returns {Promise<any|null>} レスポンスデータ
 * @throws {Error} HTTP エラーが発生した場合にスローされる
 */
async function fetchCalendarAPI(token, method, endpoint, { params = {}, query = {}, body = null } = {}) {
  if (!method || typeof method !== 'string' || !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) throw new Error('HTTP method is not set or invalid');
  if (!endpoint) throw new Error('Endpoint is not set');
  if (!token) throw new Error('Access token is not available');

  // URL パラメータの置換
  Object.entries(params).forEach(([key, value]) => {
    endpoint = endpoint.replace(`\$${key}`, encodeURIComponent(String(value)));
  });

  const epUrl = new URL(`${API_BASE_URL}${endpoint}`);

  // クエリパラメータの追加
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null) epUrl.searchParams.append(key, String(value));
  });

  console.log(`Calling Google Calendar API: ${method} ${epUrl.toString()}`);

  /**
   * API を fetch で呼び出す
   * @param {Object} [args={}] 呼び出し時の追加引数
   * @returns {Promise<Response>}
   */
  const call = (args = {}) =>
    fetch(epUrl.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      ...args,
    });

  let res;
  if (body && ['POST', 'PUT', 'PATCH'].includes(method)) res = await call({ body: JSON.stringify(body) });
  else res = await call();

  if (res.status === 401) {
    const authStore = useAuthStore();
    const refreshedToken = await authStore.fetchToken();
    if (refreshedToken) {
      token = refreshedToken;
      if (body && ['POST', 'PUT', 'PATCH'].includes(method)) res = await call({ body: JSON.stringify(body) });
      else res = await call();
    }
  }

  // 204 No Content などのレスポンスハンドリング
  if (res.status === 204) return null;

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const errorMsg = data?.error?.message || `API: ${method} ${res.status} ${res.statusText}`;
    console.error(errorMsg);
    const error = new Error(errorMsg);
    Object.assign(error, { status: res.status, details: data });
    throw error;
  }

  return data;
}
