import { useAuthStore } from '@/stores/auth.js';

/** @type {string|undefined} Google People API のベース URL */
export const API_BASE_URL = import.meta.env.VITE_GOOGLE_PEOPLE_API_BASE_URL;

/**
 * ============================================================================
 * 1. Contacts (連絡先) 関連 API (.../auth/contacts)
 * ============================================================================
 */

/**
 * 連絡先一覧の取得 (people.connections.list)
 * @param {string} token アクセストークン
 * @param {GooglePeopleConnectionsListQueryParams} [query={ personFields: 'names,emailAddresses,phoneNumbers,photos' }] クエリパラメータ
 * @param {string} [resourceName='people/me'] リソース名 (通常 'people/me')
 * @returns {Promise<GooglePeopleConnectionsListResponse>} 連絡先一覧レスポンス
 */
export function listConnections(
  token,
  query = { personFields: 'names,emailAddresses,phoneNumbers,photos' },
  resourceName = 'people/me'
) {
  return fetchPeopleAPI(token, 'GET', `/$resourceName/connections`, {
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
export function getPerson(
  token,
  resourceName,
  query = { personFields: 'names,emailAddresses,phoneNumbers,photos,birthdays,organizations,addresses' }
) {
  return fetchPeopleAPI(token, 'GET', `/$resourceName`, {
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
export function batchGetPeople(
  token,
  resourceNames,
  query = { personFields: 'names,emailAddresses,phoneNumbers,photos' }
) {
  return fetchPeopleAPI(token, 'GET', `/people:batchGet`, {
    query: {
      resourceNames,
      ...query,
    },
  });
}

/**
 * 連絡先の新規作成 (people.createContact)
 * @param {string} token アクセストークン
 * @param {Partial<GooglePeoplePerson>} body 登録する連絡先データ
 * @param {{ personFields?: string }} [query={ personFields: 'names,emailAddresses,phoneNumbers,photos' }] レスポンスに含めるフィールド
 * @returns {Promise<GooglePeoplePerson>} 作成された連絡先データ
 */
export function createContact(
  token,
  body,
  query = { personFields: 'names,emailAddresses,phoneNumbers,photos' }
) {
  return fetchPeopleAPI(token, 'POST', `/people:createContact`, {
    body,
    query,
  });
}

/**
 * 連絡先の更新 (people.updateContact)
 * @param {string} token アクセストークン
 * @param {string} resourceName 更新対象のリソース名 (例: 'people/c1234567890')
 * @param {Partial<GooglePeoplePerson>} body 更新する連絡先データ (etag 必須)
 * @param {{ updatePersonFields: string, personFields?: string }} query 更新対象フィールドの指定
 * @returns {Promise<GooglePeoplePerson>} 更新された連絡先データ
 */
export function updateContact(token, resourceName, body, query) {
  return fetchPeopleAPI(token, 'PATCH', `/$resourceName:updateContact`, {
    params: { resourceName },
    body,
    query,
  });
}

/**
 * 連絡先の削除 (people.deleteContact)
 * @param {string} token アクセストークン
 * @param {string} resourceName 削除対象のリソース名 (例: 'people/c1234567890')
 * @returns {Promise<null>} 削除成功時は 200 または 204 (空レスポンス)
 */
export function deleteContact(token, resourceName) {
  return fetchPeopleAPI(token, 'DELETE', `/$resourceName:deleteContact`, {
    params: { resourceName },
  });
}

/**
 * 連絡先の検索 (people.searchContacts)
 * @param {string} token アクセストークン
 * @param {string} queryText 検索クエリ
 * @param {{ readMask: string, pageSize?: number }} [options={ readMask: 'names,emailAddresses,phoneNumbers,photos' }] 検索オプション
 * @returns {Promise<{ results: Array<{ person: GooglePeoplePerson }> }>} 検索結果
 */
export function searchContacts(
  token,
  queryText,
  options = { readMask: 'names,emailAddresses,phoneNumbers,photos' }
) {
  return fetchPeopleAPI(token, 'GET', `/people:searchContacts`, {
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
export function listOtherContacts(
  token,
  query = { readMask: 'names,emailAddresses,phoneNumbers,photos' }
) {
  return fetchPeopleAPI(token, 'GET', `/otherContacts`, { query });
}

/**
 * 「その他の連絡先」の検索 (otherContacts.search)
 * @param {string} token アクセストークン
 * @param {string} queryText 検索クエリ
 * @param {{ readMask: string, pageSize?: number }} [options={ readMask: 'names,emailAddresses,phoneNumbers,photos' }] 検索オプション
 * @returns {Promise<{ results: Array<{ person: GooglePeoplePerson }> }>} 検索結果
 */
export function searchOtherContacts(
  token,
  queryText,
  options = { readMask: 'names,emailAddresses,phoneNumbers,photos' }
) {
  return fetchPeopleAPI(token, 'GET', `/otherContacts:search`, {
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
 * Google People API エンドポイントへリクエストを送信
 * @template T
 * @param {string|null} token アクセストークン
 * @param {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} method HTTP メソッド
 * @param {string} endpoint エンドポイントのパス（例: /$resourceName/connections）
 * @param {object} [options={}] リクエストオプション
 * @param {Record<string, any>} [options.params={}] パスパラメータ（'$'プレフィックスは自動置換）
 * @param {Record<string, any>} [options.query={}] クエリパラメータ
 * @param {any|null} [options.body=null] リクエストボディ
 * @returns {Promise<T>} レスポンスデータ（204 の場合は null を返却）
 * @throws {Error & { status: number, details?: GoogleApiErrorResponse }} HTTP エラー発生時
 */
async function fetchPeopleAPI(token, method, endpoint, { params = {}, query = {}, body = null } = {}) {
  if (!method || typeof method !== 'string' || !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    throw new Error('HTTP method is not set or invalid');
  }
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

  console.log(`Calling Google People API: ${method} ${epUrl.toString()}`);

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

  // 204 No Content または空レスポンスのハンドリング
  if (res.status === 204) {
    return /** @type {T} */ (null);
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const errorMsg = data?.error?.message || `People API Error: ${method} ${res.status} ${res.statusText}`;
    console.error(errorMsg);
    const error = new Error(errorMsg);
    Object.assign(error, { status: res.status, details: data });
    throw error;
  }

  return /** @type {T} */ (data);
}
