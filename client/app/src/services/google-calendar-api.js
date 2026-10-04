import { useAuthStore } from '@/stores/auth.js';

/** @type {string|undefined} Google Calendar API のベース URL */
export const API_BASE_URL = import.meta.env.VITE_GOOGLE_CALENDAR_API_BASE_URL;

/**
 * 予定の一覧取得
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {GoogleCalendarEventsListQueryParams} [query={}] クエリパラメータ
 * @returns {Promise<GoogleCalendarEventsListResponse>} API レスポンス
 */
export function listEvents(token, gCalendarId, query = {}) {
  return fetchCalendarAPI(token, 'GET', `/calendars/$gCalendarId/events`, { params: { gCalendarId }, query });
}

/**
 * 特定の予定の取得
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {string} gEventId 予定 ID
 * @param {Record<string, any>} [query={}] クエリパラメータ
 * @returns {Promise<GoogleCalendarEvent>} API レスポンス
 */
export function getEvent(token, gCalendarId, gEventId, query = {}) {
  return fetchCalendarAPI(token, 'GET', `/calendars/$gCalendarId/events/$gEventId`, { params: { gCalendarId, gEventId }, query });
}

/**
 * 予定の作成
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {Partial<GoogleCalendarEvent>} body 登録する予定データ
 * @param {Record<string, any>} [query={}] クエリパラメータ (例: { conferenceDataVersion: 1 })
 * @returns {Promise<GoogleCalendarEvent>} 作成されたイベントデータ
 */
export function insertEvent(token, gCalendarId, body, query = {}) {
  return fetchCalendarAPI(token, 'POST', `/calendars/$gCalendarId/events`, { params: { gCalendarId }, body, query });
}

/**
 * 予定の完全更新（PUT による完全置換）
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {string} gEventId 予定 ID
 * @param {GoogleCalendarEvent} body 更新後の予定データ
 * @param {Record<string, any>} [query={}] クエリパラメータ (例: { conferenceDataVersion: 1 })
 * @returns {Promise<GoogleCalendarEvent>} 更新されたイベントデータ
 */
export function updateEvent(token, gCalendarId, gEventId, body, query = {}) {
  return fetchCalendarAPI(token, 'PUT', `/calendars/$gCalendarId/events/$gEventId`, { params: { gCalendarId, gEventId }, body, query });
}

/**
 * 予定の部分更新
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {string} gEventId 予定 ID
 * @param {Partial<GoogleCalendarEvent>} body 更新する予定の差分プロパティ
 * @param {Record<string, any>} [query={}] クエリパラメータ (例: { conferenceDataVersion: 1 })
 * @returns {Promise<GoogleCalendarEvent>} 更新されたイベントデータ
 */
export function patchEvent(token, gCalendarId, gEventId, body, query = {}) {
  return fetchCalendarAPI(token, 'PATCH', `/calendars/$gCalendarId/events/$gEventId`, { params: { gCalendarId, gEventId }, body, query });
}

/**
 * 予定の削除
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {string} gEventId 予定 ID
 * @param {Record<string, any>} [query={}] クエリパラメータ (例: { sendUpdates: 'all' })
 * @returns {Promise<null>} 削除成功時は 204 (null)
 */
export function deleteEvent(token, gCalendarId, gEventId, query = {}) {
  return fetchCalendarAPI(token, 'DELETE', `/calendars/$gCalendarId/events/$gEventId`, { params: { gCalendarId, gEventId }, query });
}

/**
 * 予定を別のカレンダーに移動
 * @param {string} token アクセストークン
 * @param {string} gCalendarId 移動元のカレンダー ID
 * @param {string} gEventId 予定 ID
 * @param {string} destinationCalendarId 移動先のカレンダー ID
 * @param {Record<string, any>} [query={}] クエリパラメータ
 * @returns {Promise<GoogleCalendarEvent>} 移動後のイベントデータ
 */
export function moveEvent(token, gCalendarId, gEventId, destinationCalendarId, query = {}) {
  return fetchCalendarAPI(token, 'POST', `/calendars/$gCalendarId/events/$gEventId/move`, { params: { gCalendarId, gEventId, destination: destinationCalendarId }, query });
}

/**
 * 予定のインポート（iCal 形式のメタデータを含む作成）
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {Partial<GoogleCalendarEvent>} body iCalUID を含む予定データ
 * @param {Record<string, any>} [query={}] クエリパラメータ
 * @returns {Promise<GoogleCalendarEvent>} インポートされたイベントデータ
 */
export function importEvent(token, gCalendarId, body, query = {}) {
  return fetchCalendarAPI(token, 'POST', `/calendars/$gCalendarId/events/import`, { params: { gCalendarId }, body, query });
}

/**
 * 繰り返し予定の各インスタンスを取得
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {string} gEventId 繰り返し親イベント ID
 * @param {GoogleCalendarEventsListQueryParams} [query={}] クエリパラメータ
 * @returns {Promise<GoogleCalendarEventsListResponse>} インスタンス一覧レスポンス
 */
export function listEventInstances(token, gCalendarId, gEventId, query = {}) {
  return fetchCalendarAPI(token, 'GET', `/calendars/$gCalendarId/events/$gEventId/instances`, { params: { gCalendarId, gEventId }, query });
}

/**
 * イベントの変更監視チャネル登録
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {{ id: string, type: 'web_hook', address: string, token?: string, expiration?: string }} body 通知チャネル設定
 * @param {GoogleCalendarEventsListQueryParams} [query={}] クエリパラメータ
 * @returns {Promise<{ kind: 'api#channel', id: string, resourceId: string, resourceUri: string, expiration?: string }>} チャネル登録情報
 */
export function watchEvents(token, gCalendarId, body, query = {}) {
  return fetchCalendarAPI(token, 'POST', `/calendars/$gCalendarId/events/watch`, { params: { gCalendarId }, body, query });
}

/**
 * カレンダーメタデータの取得
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @returns {Promise<GoogleCalendarResource>} カレンダーメタデータ
 */
export function getCalendar(token, gCalendarId) {
  return fetchCalendarAPI(token, 'GET', `/calendars/$gCalendarId`, { params: { gCalendarId } });
}

/**
 * 新しいセカンダリカレンダーの作成
 * @param {string} token アクセストークン
 * @param {Pick<GoogleCalendarResource, 'summary'> & Partial<GoogleCalendarResource>} body カレンダー作成設定
 * @returns {Promise<GoogleCalendarResource>} 作成されたカレンダーメタデータ
 */
export function insertCalendar(token, body) {
  return fetchCalendarAPI(token, 'POST', '/calendars', { body });
}

/**
 * カレンダーメタデータの完全更新（PUT による完全置換）
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {GoogleCalendarResource} body カレンダーメタデータ
 * @returns {Promise<GoogleCalendarResource>} 更新されたカレンダーメタデータ
 */
export function updateCalendar(token, gCalendarId, body) {
  return fetchCalendarAPI(token, 'PUT', `/calendars/$gCalendarId`, { params: { gCalendarId }, body });
}

/**
 * カレンダーメタデータの部分更新
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {Partial<GoogleCalendarResource>} body カレンダーメタデータの差分
 * @returns {Promise<GoogleCalendarResource>} 更新されたカレンダーメタデータ
 */
export function patchCalendar(token, gCalendarId, body) {
  return fetchCalendarAPI(token, 'PATCH', `/calendars/$gCalendarId`, { params: { gCalendarId }, body });
}

/**
 * セカンダリカレンダーの削除
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @returns {Promise<null>} 削除完了時は 204 (null)
 */
export function deleteCalendar(token, gCalendarId) {
  return fetchCalendarAPI(token, 'DELETE', `/calendars/$gCalendarId`, { params: { gCalendarId } });
}

/**
 * カレンダーの内容をすべてクリア（プライマリカレンダーの初期化）
 * @param {string} token アクセストークン
 * @param {string} [gCalendarId='primary'] カレンダー ID (通常 primary)
 * @returns {Promise<null>} 初期化完了時は 204 (null)
 */
export function clearCalendar(token, gCalendarId = 'primary') {
  return fetchCalendarAPI(token, 'POST', `/calendars/$gCalendarId/clear`, { params: { gCalendarId } });
}

/**
 * ユーザのカレンダーリスト（UI表示用一覧）を取得
 * @param {string} token アクセストークン
 * @param {Record<string, any>} [query={}] クエリパラメータ (例: { minAccessRole: 'writer' })
 * @returns {Promise<GoogleCalendarListResponse>} カレンダー一覧レスポンス
 */
export function listCalendarList(token, query = {}) {
  return fetchCalendarAPI(token, 'GET', `/users/me/calendarList`, { query });
}

/**
 * 特定のカレンダーリストエントリを取得
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @returns {Promise<GoogleCalendarListEntry>} カレンダーリストエントリ
 */
export function getCalendarListEntry(token, gCalendarId) {
  return fetchCalendarAPI(token, 'GET', `/users/me/calendarList/$gCalendarId`, { params: { gCalendarId } });
}

/**
 * カレンダーリストエントリをユーザーのカレンダー一覧に追加
 * @param {string} token アクセストークン
 * @param {{ id: string } & Partial<GoogleCalendarListEntry>} body 追加対象のカレンダー情報
 * @param {Record<string, any>} [query={}] クエリパラメータ
 * @returns {Promise<GoogleCalendarListEntry>} 追加されたカレンダーリストエントリ
 */
export function insertCalendarListEntry(token, body, query = {}) {
  return fetchCalendarAPI(token, 'POST', `/users/me/calendarList`, { query, body });
}

/**
 * カレンダーリストエントリの完全更新（PUT による完全置換）
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {GoogleCalendarListEntry} body 更新後のエントリデータ
 * @param {Record<string, any>} [query={}] クエリパラメータ
 * @returns {Promise<GoogleCalendarListEntry>} 更新されたエントリデータ
 */
export function updateCalendarListEntry(token, gCalendarId, body, query = {}) {
  return fetchCalendarAPI(token, 'PUT', `/users/me/calendarList/$gCalendarId`, { params: { gCalendarId }, body, query });
}

/**
 * カレンダーリストエントリの部分更新
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {Partial<GoogleCalendarListEntry>} body 更新するエントリの差分プロパティ
 * @param {Record<string, any>} [query={}] クエリパラメータ
 * @returns {Promise<GoogleCalendarListEntry>} 更新されたエントリデータ
 */
export function patchCalendarListEntry(token, gCalendarId, body, query = {}) {
  return fetchCalendarAPI(token, 'PATCH', `/users/me/calendarList/$gCalendarId`, { params: { gCalendarId }, body, query });
}

/**
 * カレンダーリストエントリを削除（一覧からの非表示・解除）
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @returns {Promise<null>} 削除完了時は 204 (null)
 */
export function deleteCalendarListEntry(token, gCalendarId) {
  return fetchCalendarAPI(token, 'DELETE', `/users/me/calendarList/$gCalendarId`, { params: { gCalendarId } });
}

/**
 * カレンダーリストの変更監視
 * @param {string} token アクセストークン
 * @param {{ id: string, type: 'web_hook', address: string, token?: string, expiration?: string }} body 通知チャネル設定
 * @param {Record<string, any>} [query={}] クエリパラメータ
 * @returns {Promise<{ kind: 'api#channel', id: string, resourceId: string, resourceUri: string, expiration?: string }>} チャネル登録情報
 */
export function watchCalendarListEntry(token, body, query = {}) {
  return fetchCalendarAPI(token, 'POST', `/users/me/calendarList/watch`, { body, query });
}

/**
 * カレンダーの権限ルール一覧を取得
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {Record<string, any>} [query={}] クエリパラメータ
 * @returns {Promise<GoogleCalendarAclResponse>} ACL リスト
 */
export function listAcl(token, gCalendarId, query = {}) {
  return fetchCalendarAPI(token, 'GET', `/calendars/$gCalendarId/acl`, { params: { gCalendarId }, query });
}

/**
 * 特定の権限ルールを取得
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {string} gRuleId 権限ルール ID
 * @returns {Promise<GoogleCalendarAclRule>} ACL ルール
 */
export function getAcl(token, gCalendarId, gRuleId) {
  return fetchCalendarAPI(token, 'GET', `/calendars/$gCalendarId/acl/$gRuleId`, { params: { gCalendarId, gRuleId } });
}

/**
 * 新しい権限ルールを作成
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {Pick<GoogleCalendarAclRule, 'role'|'scope'>} body 権限設定
 * @param {Record<string, any>} [query={}] クエリパラメータ
 * @returns {Promise<GoogleCalendarAclRule>} 作成された ACL ルール
 */
export function insertAcl(token, gCalendarId, body, query = {}) {
  return fetchCalendarAPI(token, 'POST', `/calendars/$gCalendarId/acl`, { params: { gCalendarId }, body, query });
}

/**
 * 権限ルールの完全更新（PUT による完全置換）
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {string} gRuleId 権限ルール ID
 * @param {Pick<GoogleCalendarAclRule, 'role'|'scope'>} body 権限設定
 * @param {Record<string, any>} [query={}] クエリパラメータ
 * @returns {Promise<GoogleCalendarAclRule>} 更新された ACL ルール
 */
export function updateAcl(token, gCalendarId, gRuleId, body, query = {}) {
  return fetchCalendarAPI(token, 'PUT', `/calendars/$gCalendarId/acl/$gRuleId`, { params: { gCalendarId, gRuleId }, body, query });
}

/**
 * 権限ルールの部分更新
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {string} gRuleId 権限ルール ID
 * @param {Partial<Pick<GoogleCalendarAclRule, 'role'|'scope'>>} body 権限設定の差分
 * @param {Record<string, any>} [query={}] クエリパラメータ
 * @returns {Promise<GoogleCalendarAclRule>} 更新された ACL ルール
 */
export function patchAcl(token, gCalendarId, gRuleId, body, query = {}) {
  return fetchCalendarAPI(token, 'PATCH', `/calendars/$gCalendarId/acl/$gRuleId`, { params: { gCalendarId, gRuleId }, body, query });
}

/**
 * 権限ルールの削除
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {string} gRuleId 権限ルール ID
 * @returns {Promise<null>} 削除完了時は 204 (null)
 */
export function deleteAcl(token, gCalendarId, gRuleId) {
  return fetchCalendarAPI(token, 'DELETE', `/calendars/$gCalendarId/acl/$gRuleId`, { params: { gCalendarId, gRuleId } });
}

/**
 * 権限ルールの変更監視
 * @param {string} token アクセストークン
 * @param {string} gCalendarId カレンダー ID
 * @param {{ id: string, type: 'web_hook', address: string, token?: string, expiration?: string }} body 通知チャネル設定
 * @param {Record<string, any>} [query={}] クエリパラメータ
 * @returns {Promise<{ kind: 'api#channel', id: string, resourceId: string, resourceUri: string, expiration?: string }>} チャネル登録情報
 */
export function watchAcl(token, gCalendarId, body, query = {}) {
  return fetchCalendarAPI(token, 'POST', `/calendars/$gCalendarId/acl/watch`, { params: { gCalendarId }, body, query });
}

/**
 * 指定した時間範囲のカレンダーの空き時間情報を取得
 * @param {string} token アクセストークン
 * @param {GoogleCalendarFreeBusyRequest} body 空き時間リクエストパラメータ
 * @returns {Promise<GoogleCalendarFreeBusyResponse>} 各カレンダーの空き状況データ
 */
export function queryFreebusy(token, body) {
  return fetchCalendarAPI(token, 'POST', `/freeBusy`, { body });
}

/**
 * ユーザー設定の一覧を取得
 * @param {string} token アクセストークン
 * @param {Record<string, any>} [query={}] クエリパラメータ
 * @returns {Promise<{ kind: 'calendar#settings', items: Array<{ id: string, value: string }> }>} ユーザー設定一覧
 */
export function listSettings(token, query = {}) {
  return fetchCalendarAPI(token, 'GET', `/users/me/settings`, { query });
}

/**
 * 特定のユーザー設定を取得
 * @param {string} token アクセストークン
 * @param {string} gSettingId 設定 ID (例: 'format24HourTime', 'weekStart')
 * @returns {Promise<{ kind: 'calendar#setting', id: string, value: string }>} ユーザー設定
 */
export function getSetting(token, gSettingId) {
  return fetchCalendarAPI(token, 'GET', `/users/me/settings/$gSettingId`, { params: { gSettingId } });
}

/**
 * ユーザー設定の変更監視
 * @param {string} token アクセストークン
 * @param {{ id: string, type: 'web_hook', address: string, token?: string, expiration?: string }} body 通知チャネル設定
 * @param {Record<string, any>} [query={}] クエリパラメータ
 * @returns {Promise<{ kind: 'api#channel', id: string, resourceId: string, resourceUri: string, expiration?: string }>} チャネル登録情報
 */
export function watchSettings(token, body, query = {}) {
  return fetchCalendarAPI(token, 'POST', `/users/me/settings/watch`, { body, query });
}

/**
 * カレンダーおよび予定で使用可能なカラーパレット情報を取得
 * @param {string} token アクセストークン
 * @returns {Promise<GoogleCalendarColorsResponse>} カラーパレット情報
 */
export function getColors(token) {
  return fetchCalendarAPI(token, 'GET', '/colors');
}

/**
 * Push通知チャネルを停止
 * @param {string} token アクセストークン
 * @param {{ id: string, resourceId: string }} body 停止するチャネル情報
 * @returns {Promise<null>} 停止完了時は 204 (null)
 */
export function stopChannel(token, body) {
  return fetchCalendarAPI(token, 'POST', '/channels/stop', { body });
}

/**
 * Google Calendar API エンドポイントへリクエストを送信
 * @template T
 * @param {string|null} token アクセストークン
 * @param {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} method HTTP メソッド
 * @param {string} endpoint エンドポイントのパス（例: /calendars/$gCalendarId）
 * @param {object} [options={}] リクエストオプション
 * @param {Record<string, any>} [options.params={}] パスパラメータ（'$'プレフィックスは自動置換）
 * @param {Record<string, any>} [options.query={}] クエリパラメータ
 * @param {any|null} [options.body=null] リクエストボディ
 * @returns {Promise<T>} レスポンスデータ（204 の場合は null を T として返却）
 * @throws {Error & { status: number, details?: GoogleApiErrorResponse }} HTTP エラー発生時
 */
async function fetchCalendarAPI(token, method, endpoint, { params = {}, query = {}, body = null } = {}) {
  if (!method || typeof method !== 'string' || !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    throw new Error('HTTP method is not set or invalid');
  }
  if (!endpoint) throw new Error('Endpoint is not set');
  if (!token) throw new Error('Access token is not available');

  // パスパラメータの置換 ($key -> value)
  let resolvedEndpoint = endpoint;
  Object.entries(params).forEach(([key, value]) => {
    resolvedEndpoint = resolvedEndpoint.replace(`\$${key}`, encodeURIComponent(String(value)));
  });

  const epUrl = new URL(`${API_BASE_URL}${resolvedEndpoint}`);

  // クエリパラメータの追加
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      if (Array.isArray(value)) {
        value.forEach((v) => epUrl.searchParams.append(key, String(v)));
      } else {
        epUrl.searchParams.append(key, String(value));
      }
    }
  });

  // console.log(`Calling Google Calendar API: ${method} ${epUrl.toString()}`);

  /**
   * API を fetch で呼び出す
   * @param {RequestInit} [args={}]
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
  if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
    res = await call({ body: JSON.stringify(body) });
  } else {
    res = await call();
  }

  // トークン期限切れ (401) 時のリフレッシュと再試行
  if (res.status === 401) {
    const authStore = useAuthStore();
    const refreshedToken = await authStore.fetchToken();
    if (refreshedToken) {
      token = refreshedToken;
      if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
        res = await call({ body: JSON.stringify(body) });
      } else {
        res = await call();
      }
    }
  }

  // 204 No Content のハンドリング (ボディパースをスキップ)
  if (res.status === 204) {
    return /** @type {T} */ (null);
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const errorMsg = data?.error?.message || `API: ${method} ${res.status} ${res.statusText}`;
    console.error(errorMsg);
    const error = new Error(errorMsg);
    Object.assign(error, { status: res.status, details: data });
    throw error;
  }

  return /** @type {T} */ (data);
}
