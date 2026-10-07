import { useAuthStore } from '@/stores/auth.js';

/** @type {string} Google Photos Library API のベース URL */
export const API_BASE_URL = import.meta.env.VITE_GOOGLE_PHOTOS_API_BASE_URL ?? 'https://photoslibrary.googleapis.com/v1';
/** @type {string} Google Photos Picker API のベース URL */
export const PICKER_API_BASE_URL = import.meta.env.VITE_GOOGLE_PHOTOS_PICKER_API_BASE_URL ?? 'https://photospicker.googleapis.com/v1';

/**
 * ============================================================================
 * 1. Library API: アルバム関連
 * ============================================================================
 */

/**
 * アルバムの作成（アプリ作成データとして保存される）
 * @param {string} token Photos スコープのアクセストークン
 * @param {string} title アルバムタイトル
 * @returns {Promise<GooglePhotosAlbum>} 作成されたアルバム
 */
export function createAlbum(token, title) {
  return fetchPhotosAPI(token, 'POST', '/albums', { body: { album: { title } } });
}

/**
 * アルバムの取得（所有・参加済みのアプリ作成アルバムのみ）
 * @param {string} token アクセストークン
 * @param {string} albumId アルバム ID
 * @returns {Promise<GooglePhotosAlbum>}
 */
export function getAlbum(token, albumId) {
  return fetchPhotosAPI(token, 'GET', '/albums/$albumId', { params: { albumId } });
}

/**
 * アルバムを共有する。コラボレーションを有効にすると参加者も写真を追加できる。
 * @param {string} token アクセストークン
 * @param {string} albumId アルバム ID
 * @param {GooglePhotosSharedAlbumOptions} [options={}] 共有オプション
 * @returns {Promise<GooglePhotosShareInfo>} 共有情報（shareableUrl / shareToken を含む）
 */
export async function shareAlbum(token, albumId, options = { isCollaborative: true, isCommentable: true }) {
  const response = await fetchPhotosAPI(token, 'POST', '/albums/$albumId:share', { params: { albumId }, body: { sharedAlbumOptions: options } });
  return /** @type {{shareInfo?: GooglePhotosShareInfo}} */ (response)?.shareInfo ?? /** @type {GooglePhotosShareInfo} */ (response);
}

/**
 * 共有トークンを使って共有アルバムに参加する（共有された側の操作用）
 * @param {string} token アクセストークン
 * @param {string} shareToken 共有トークン
 * @returns {Promise<GooglePhotosJoinSharedAlbumResponse>}
 */
export function joinSharedAlbum(token, shareToken) {
  return fetchPhotosAPI(token, 'POST', '/sharedAlbums:join', { body: { shareToken } });
}

/**
 * ============================================================================
 * 2. Library API: メディアアイテム関連
 * ============================================================================
 */

/**
 * バイト列をアップロードしてアップロードトークンを得る（raw upload）
 * @param {string} token アクセストークン
 * @param {Blob|Uint8Array} bytes ファイルのバイト列
 * @param {string} fileName ファイル名
 * @param {string} [mimeType='application/octet-stream'] MIME タイプ
 * @returns {Promise<string>} アップロードトークン
 */
export function uploadMediaBytes(token, bytes, fileName, mimeType = 'application/octet-stream') {
  return fetchPhotosAPI(token, 'POST', '/uploads', {
    rawBody: bytes,
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Goog-Upload-File-Name': fileName,
      'X-Goog-Upload-Protocol': 'raw',
      'X-Goog-Upload-Content-Type': mimeType,
    },
  });
}

/**
 * アップロードトークンからメディアアイテムを生成し、任意でアルバムに追加する
 * @param {string} token アクセストークン
 * @param {GooglePhotosNewMediaItem[]} newMediaItems 生成するメディア
 * @param {string} [albumId] 追加先アルバム ID（指定時はアルバムの末尾に追加）
 * @returns {Promise<GooglePhotosBatchCreateResponse>}
 */
export function batchCreateMediaItems(token, newMediaItems, albumId = '') {
  const body = { newMediaItems };
  if (albumId) {
    body.albumId = albumId;
    body.albumPosition = { position: 'LAST_IN_ALBUM' };
  }
  return fetchPhotosAPI(token, 'POST', '/mediaItems:batchCreate', { body });
}

/**
 * アルバム内のメディアアイテム一覧を取得する（アプリ作成データのみ）
 * @param {string} token アクセストークン
 * @param {string} albumId アルバム ID
 * @param {number} [pageSize=100] 1ページあたりの件数
 * @returns {Promise<GooglePhotosMediaItem[]>}
 */
export async function listAlbumMediaItems(token, albumId, pageSize = 100) {
  const items = [];
  let pageToken;
  do {
    const response = await fetchPhotosAPI(token, 'POST', '/mediaItems:search', {
      body: { albumId, pageSize, ...(pageToken ? { pageToken } : {}) },
    });
    if (Array.isArray(response?.mediaItems)) items.push(...response.mediaItems);
    pageToken = response?.nextPageToken;
  } while (pageToken);
  return items;
}

/**
 * メディアアイテムのバイト列を取得する（Picker API のファイルは認証が必要）
 * @param {string} token アクセストークン
 * @param {string} baseUrl メディアのベース URL
 * @returns {Promise<Blob>} ファイル内容
 */
export async function downloadMediaFile(token, baseUrl) {
  const res = await fetch(baseUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Failed to download media file: ${res.status}`);
  return res.blob();
}

/**
 * ============================================================================
 * 3. Picker API: 写真選択セッション
 * ============================================================================
 */

/**
 * 写真選択セッションを作成する
 * @param {string} token Photos Picker スコープのアクセストークン
 * @returns {Promise<GooglePhotosPickerSession>} pickerUri を含むセッション
 */
export function createPickerSession(token) {
  return fetchPhotosAPI(token, 'POST', '/sessions', { base: PICKER_API_BASE_URL });
}

/**
 * 写真選択セッションの状態を取得する（ポーリング用）
 * @param {string} token アクセストークン
 * @param {string} sessionId セッション ID
 * @returns {Promise<GooglePhotosPickerSession>}
 */
export function getPickerSession(token, sessionId) {
  return fetchPhotosAPI(token, 'GET', '/sessions/$sessionId', { base: PICKER_API_BASE_URL, params: { sessionId } });
}

/**
 * 写真選択セッションを削除する
 * @param {string} token アクセストークン
 * @param {string} sessionId セッション ID
 * @returns {Promise<null>}
 */
export function deletePickerSession(token, sessionId) {
  return fetchPhotosAPI(token, 'DELETE', '/sessions/$sessionId', { base: PICKER_API_BASE_URL, params: { sessionId } });
}

/**
 * 選択済みのメディアアイテムを取得する
 * @param {string} token アクセストークン
 * @param {string} sessionId セッション ID
 * @returns {Promise<GooglePhotosPickedMediaItem[]>}
 */
export async function listPickedMediaItems(token, sessionId) {
  const items = [];
  let pageToken;
  do {
    const response = await fetchPhotosAPI(token, 'GET', '/mediaItems', {
      base: PICKER_API_BASE_URL,
      query: { sessionId, ...(pageToken ? { pageToken } : {}) },
    });
    if (Array.isArray(response?.mediaItems)) items.push(...response.mediaItems);
    pageToken = response?.nextPageToken;
  } while (pageToken);
  return items;
}

/**
 * ============================================================================
 * 共通リクエスト処理
 * ============================================================================
 */

/**
 * Google Photos API エンドポイントへリクエストを送信
 * @template T
 * @param {string|null} token Photos 用アクセストークン
 * @param {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} method HTTP メソッド
 * @param {string} endpoint エンドポイントのパス（例: /albums/$albumId）
 * @param {object} [options={}] リクエストオプション
 * @param {string} [options.base=API_BASE_URL] ベース URL（Picker API は別ホスト）
 * @param {Record<string, any>} [options.params={}] パスパラメータ（'$'プレフィックスは自動置換）
 * @param {Record<string, any>} [options.query={}] クエリパラメータ
 * @param {any|null} [options.body=null] JSON リクエストボディ
 * @param {Blob|Uint8Array|null} [options.rawBody=null] 生のリクエストボディ（アップロード用）
 * @param {Record<string, string>} [options.headers={}] 追加ヘッダ
 * @returns {Promise<T>} レスポンスデータ（テキストレスポンスもそのまま返す）
 */
async function fetchPhotosAPI(token, method, endpoint, { base = API_BASE_URL, params = {}, query = {}, body = null, rawBody = null, headers = {} } = {}) {
  if (!method || typeof method !== 'string' || !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    throw new Error('HTTP method is not set or invalid');
  }
  if (!endpoint) throw new Error('Endpoint is not set');
  if (!token) throw new Error('Access token is not available');

  let resolvedEndpoint = endpoint;
  Object.entries(params).forEach(([key, value]) => {
    resolvedEndpoint = resolvedEndpoint.replace(`\$${key}`, encodeURIComponent(String(value)));
  });

  const epUrl = new URL(`${base}${resolvedEndpoint}`);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null) epUrl.searchParams.append(key, String(value));
  });

  /** @param {string} accessToken @returns {Promise<Response>} */
  const call = (accessToken) =>
    fetch(epUrl.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: rawBody ?? (body ? JSON.stringify(body) : undefined),
    });

  let res = await call(token);

  // トークン期限切れ (401) 時は写真共有用トークンを再取得して再試行
  if (res.status === 401) {
    const authStore = useAuthStore();
    const refreshedToken = await authStore.fetchPhotoToken();
    if (refreshedToken) res = await call(refreshedToken);
  }

  if (res.status === 204) return /** @type {T} */ (null);

  // アップロードレスポンスはテキスト（アップロードトークン）
  const contentType = res.headers.get('Content-Type') ?? '';
  const data = contentType.includes('application/json') ? await res.json().catch(() => null) : await res.text();

  if (!res.ok) {
    const errorMsg = data?.error?.message || `API: ${method} ${res.status} ${res.statusText}`;
    console.error(errorMsg);
    const error = new Error(errorMsg);
    Object.assign(error, { status: res.status, details: data });
    throw error;
  }

  return /** @type {T} */ (data);
}
