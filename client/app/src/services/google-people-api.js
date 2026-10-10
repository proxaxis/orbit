import { postBffRequest } from '@/services/bff-request.js';

/** @type {(() => Promise<string|null>)|null} 401 応答時に新しいアクセストークンを返すコールバック（呼び出し側が注入） */
let tokenRefresher = null;

/**
 * 401 応答時に呼び出すトークン再取得コールバックを登録する。
 * API クライアントを Pinia ストアから切り離すため、認証処理を外部から注入する。
 * @param {() => Promise<string|null>} refresher 新しいアクセストークンを返すコールバック
 * @returns {void}
 */
export function setTokenRefresher(refresher) {
  tokenRefresher = refresher;
}

/** @type {string|undefined} Google People API のベース URL */
export const API_BASE_URL = import.meta.env.VITE_GOOGLE_API_BASE_URL_PEOPLE;

/**
 * ============================================================================
 * 1. Contacts (連絡先) 関連 API (.../auth/contacts.readonly)
 * ============================================================================
 */

/**
 * 連絡先一覧の取得 (people.connections.list)
 * @param {string} token アクセストークン
 * @param {GooglePeopleConnectionsListQueryParams} [query={ personFields: 'names,emailAddresses,phoneNumbers,photos' }] クエリパラメータ
 * @param {string} [resourceName='people/me'] リソース名 (通常 'people/me')
 * @returns {Promise<GooglePeopleConnectionsListResponse>} 連絡先一覧レスポンス
 */
export function listConnections(token, query = { personFields: 'names,emailAddresses,phoneNumbers,photos' }, resourceName = 'people/me') {
  return fetchPeopleAPI(token, `/$resourceName/connections`, {
    params: { resourceName },
    query,
  });
}

/**
 * 特定の連絡先情報の取得 (people.get)
 * @param {string} token アクセストークン
 * @param {string} resourceName リソース名 (例: 'people/c1234567890')
 * @param {{ personFields: string }} [query={ personFields: 'names,emailAddresses,phoneNumbers,photos,birthdays,organizations,addresses' }] クエリパラメータ
 * @returns {Promise<GooglePeoplePerson>} 連絡先データ
 */
export function getPerson(token, resourceName, query = { personFields: 'names,emailAddresses,phoneNumbers,photos,birthdays,organizations,addresses' }) {
  return fetchPeopleAPI(token, `/$resourceName`, {
    params: { resourceName },
    query,
  });
}

/**
 * 複数の連絡先を一括取得 (people.getBatchGet)
 * @param {string} token アクセストークン
 * @param {string[]} resourceNames 取得対象のリソース名リスト (例: ['people/c1...', 'people/c2...'])
 * @param {{ personFields: string }} [query={ personFields: 'names,emailAddresses,phoneNumbers,photos' }] クエリパラメータ
 * @returns {Promise<{ responses: Array<{ httpStatusCode: number, person?: GooglePeoplePerson, requestedResourceName?: string, status?: any }> }>} 一括取得レスポンス
 */
export function batchGetPeople(token, resourceNames, query = { personFields: 'names,emailAddresses,phoneNumbers,photos' }) {
  return fetchPeopleAPI(token, `/people:batchGet`, {
    query: {
      resourceNames,
      ...query,
    },
  });
}

/**
 * 連絡先の検索 (people.searchContacts)
 * @param {string} token アクセストークン
 * @param {string} queryText 検索クエリ
 * @param {{ readMask: string, pageSize?: number }} [options={ readMask: 'names,emailAddresses,phoneNumbers,photos' }] 検索オプション
 * @returns {Promise<{ results: Array<{ person: GooglePeoplePerson }> }>} 検索結果
 */
export function searchContacts(token, queryText, options = { readMask: 'names,emailAddresses,phoneNumbers,photos' }) {
  return fetchPeopleAPI(token, `/people:searchContacts`, {
    query: {
      query: queryText,
      ...options,
    },
  });
}

/**
 * ============================================================================
 * 2. Other Contacts (その他の連絡先) 関連 API (.../auth/contacts.other.readonly)
 * ============================================================================
 */

/**
 * 「その他の連絡先」一覧の取得 (otherContacts.list)
 * @param {string} token アクセストークン
 * @param {GooglePeopleOtherContactsListQueryParams} [query={ readMask: 'names,emailAddresses,phoneNumbers,photos' }] クエリパラメータ
 * @returns {Promise<GooglePeopleOtherContactsListResponse>} その他の連絡先一覧レスポンス
 */
export function listOtherContacts(token, query = { readMask: 'names,emailAddresses,phoneNumbers,photos' }) {
  return fetchPeopleAPI(token, `/otherContacts`, { query });
}

/**
 * 「その他の連絡先」の検索 (otherContacts.search)
 * @param {string} token アクセストークン
 * @param {string} queryText 検索クエリ
 * @param {{ readMask: string, pageSize?: number }} [options={ readMask: 'names,emailAddresses,phoneNumbers,photos' }] 検索オプション
 * @returns {Promise<{ results: Array<{ person: GooglePeoplePerson }> }>} 検索結果
 */
export function searchOtherContacts(token, queryText, options = { readMask: 'names,emailAddresses,phoneNumbers,photos' }) {
  return fetchPeopleAPI(token, `/otherContacts:search`, {
    query: {
      query: queryText,
      ...options,
    },
  });
}

/**
 * ============================================================================
 * 3. 共通 fetch ヘルパー関数
 * ============================================================================
 */

/**
 * Google People API エンドポイントへ GET リクエストを送信。
 * 直接 Google API を呼ばず、BFF の `POST /request` へ転送を依頼する。
 * @template T
 * @param {string|null} token アクセストークン（認証済み確認と BFF 側の予備トークンとして使用）
 * @param {string} endpoint エンドポイントのパス（例: /$resourceName/connections）
 * @param {object} [options={}] リクエストオプション
 * @param {Record<string, any>} [options.params={}] パスパラメータ（'$'プレフィックスは自動置換）
 * @param {Record<string, any>} [options.query={}] クエリパラメータ
 * @returns {Promise<T>} レスポンスデータ
 * @throws {Error & { status: number, details?: GoogleApiErrorResponse }} HTTP エラー発生時
 */
async function fetchPeopleAPI(token, endpoint, { params = {}, query = {} } = {}) {
  if (!endpoint) throw new Error('Endpoint is not set');
  if (!token) throw new Error('Access token is not available');

  // パスパラメータの置換 ($key -> value)
  // 注意: resourceName が 'people/c123' などの場合、スラッシュはエンコードせず維持する
  let resolvedEndpoint = endpoint;
  Object.entries(params).forEach(([key, value]) => {
    const stringVal = String(value);
    const replacement = key === 'resourceName' ? stringVal : encodeURIComponent(stringVal);
    resolvedEndpoint = resolvedEndpoint.replace(`$${key}`, replacement);
  });

  /** @type {string} People API のベース URL */
  const base = (API_BASE_URL || 'https://people.googleapis.com/v1').replace(/\/+$/, '');
  const epUrl = new URL(`${base}${resolvedEndpoint.startsWith('/') ? '' : '/'}${resolvedEndpoint}`);

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

  // console.log(`Calling Google People API via BFF: GET ${epUrl.toString()}`);

  /** @type {import('@/services/bff-request.js').BffApiRequest} BFF へ転送を依頼するリクエスト内容 */
  const request = {
    service: 'people',
    method: 'GET',
    url: epUrl.toString(),
    accessToken: token,
  };

  let res = await postBffRequest(request);

  // トークン期限切れ (401) 時のリフレッシュと再試行
  if (res.status === 401) {
    /** @type {string|null} 注入されたリフレッシュ処理で再取得したアクセストークン */
    const refreshedToken = (await tokenRefresher?.()) ?? null;
    if (refreshedToken) {
      request.accessToken = refreshedToken;
      res = await postBffRequest(request);
    }
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const errorMsg = data?.error?.message || `People API Error: GET ${res.status} ${res.statusText}`;
    console.error(errorMsg);
    const error = new Error(errorMsg);
    Object.assign(error, { status: res.status, details: data });
    throw error;
  }

  return /** @type {T} */ (data);
}
