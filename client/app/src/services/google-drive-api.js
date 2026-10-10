/**
 * Google Drive API v3（appDataFolder）の薄いクライアント。
 * ページ側・Service Worker 双方から利用できるよう Vue に依存しない純粋モジュールとして実装する。
 * 個人設定・セッションカレンダー等、Google Calendar API で保持できないデータを
 * アプリケーション専用データ領域へ JSON ファイルとして保存する。
 */
import { postBffRequest, bytesToBase64 } from '@/services/bff-request.js';

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

/** @type {string} Google Drive API のベース URL */
export const API_BASE_URL = (import.meta.env.VITE_GOOGLE_API_BASE_URL_DRIVE || 'https://www.googleapis.com').replace(/\/+$/, '');

/** @type {string} アプリ設定を保存するファイル名（appDataFolder 直下） */
export const SYNC_FILE_NAME = 'orbit-sync.json';

/**
 * ============================================================================
 * 1. アプリケーション同期データ（appDataFolder）関連
 * ============================================================================
 */

/**
 * appDataFolder 内のファイルを名前で検索する (files.list)
 * @param {string} token アクセストークン
 * @param {string} name ファイル名
 * @returns {Promise<GoogleDriveFile|null>} 最初に見つかったファイル（なければ null）
 */
export async function findFileByName(token, name) {
  const data = await fetchDriveAPI(token, '/drive/v3/files', {
    query: {
      spaces: 'appDataFolder',
      q: `name='${String(name).replace(/'/g, "\\'")}'`,
      fields: 'files(id,name,modifiedTime)',
      pageSize: 10,
    },
  });
  return data?.files?.[0] ?? null;
}

/**
 * appDataFolder に新規ファイルを作成する (files.create、メタデータのみ)
 * @param {string} token アクセストークン
 * @param {string} name ファイル名
 * @returns {Promise<GoogleDriveFile|null>}
 */
export function createFile(token, name) {
  return fetchDriveAPI(token, '/drive/v3/files', {
    method: 'POST',
    query: { fields: 'id,name,modifiedTime' },
    body: { name, parents: ['appDataFolder'] },
  });
}

/**
 * ファイルの内容（JSON）を読み込む (files.get?alt=media)
 * @param {string} token アクセストークン
 * @param {string} fileId ファイル ID
 * @returns {Promise<object|null>} パース済み JSON。存在しない・空・壊れている場合は null
 */
export async function readFileContent(token, fileId) {
  try {
    return await fetchDriveAPI(token, `/drive/v3/files/${encodeURIComponent(fileId)}`, {
      query: { alt: 'media' },
    });
  } catch (error) {
    if (error?.status === 404) return null;
    throw error;
  }
}

/**
 * ファイルの内容を JSON 文字列で上書きする (files.update?uploadType=media)
 * @param {string} token アクセストークン
 * @param {string} fileId ファイル ID
 * @param {string} content JSON 文字列
 * @returns {Promise<GoogleDriveFile|null>}
 */
export function writeFileContent(token, fileId, content) {
  return fetchDriveAPI(token, `/upload/drive/v3/files/${encodeURIComponent(fileId)}`, {
    method: 'PATCH',
    query: { uploadType: 'media', fields: 'id,name,modifiedTime' },
    rawBody: new TextEncoder().encode(content),
  });
}

/**
 * appDataFolder 内の同期ファイルを読み込む
 * @param {string} token アクセストークン
 * @param {string} [fileName=SYNC_FILE_NAME] ファイル名
 * @returns {Promise<{fileId: string, data: OrbitDriveSyncData}|null>} ファイルまたは内容がなければ null
 */
export async function readSyncFile(token, fileName = SYNC_FILE_NAME) {
  const file = await findFileByName(token, fileName);
  if (!file?.id) return null;
  const data = await readFileContent(token, file.id);
  if (!data || typeof data !== 'object') return null;
  return { fileId: file.id, data };
}

/**
 * appDataFolder 内の同期ファイルを書き込む（存在しなければ作成）
 * @param {string} token アクセストークン
 * @param {string} content JSON 文字列
 * @param {string} [fileName=SYNC_FILE_NAME] ファイル名
 * @returns {Promise<string|null>} 書き込んだファイル ID
 */
export async function writeSyncFile(token, content, fileName = SYNC_FILE_NAME) {
  let file = await findFileByName(token, fileName);
  if (!file?.id) file = await createFile(token, fileName);
  if (!file?.id) return null;
  await writeFileContent(token, file.id, content);
  return file.id;
}

/**
 * ============================================================================
 * 2. 共通 fetch ヘルパー関数
 * ============================================================================
 */

/**
 * Google Drive API エンドポイントへリクエストを送信。
 * 直接 Google API を呼ばず、BFF の `POST /request` へ転送を依頼する。
 * @template T
 * @param {string|null} token アクセストークン（認証済み確認と BFF 側の予備トークンとして使用）
 * @param {string} endpoint エンドポイントのパス（例: /drive/v3/files）
 * @param {object} [options={}] リクエストオプション
 * @param {string} [options.method='GET'] HTTP メソッド
 * @param {Record<string, any>} [options.query={}] クエリパラメータ
 * @param {object} [options.body] JSON リクエストボディ
 * @param {Uint8Array} [options.rawBody] バイナリボディ（JSON テキスト含む。body より優先）
 * @returns {Promise<T>} レスポンスデータ
 * @throws {Error & { status: number, details?: GoogleApiErrorResponse }} HTTP エラー発生時
 */
async function fetchDriveAPI(token, endpoint, { method = 'GET', query = {}, body, rawBody } = {}) {
  if (!endpoint) throw new Error('Endpoint is not set');
  if (!token) throw new Error('Access token is not available');

  const epUrl = new URL(`${API_BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`);

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

  /** @type {import('@/services/bff-request.js').BffApiRequest} BFF へ転送を依頼するリクエスト内容 */
  const request = {
    service: 'drive',
    method,
    url: epUrl.toString(),
    headers: { 'Content-Type': 'application/json' },
    accessToken: token,
  };
  if (rawBody) request.bodyBase64 = await bytesToBase64(rawBody);
  else if (body) request.body = body;

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
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const errorMsg = data?.error?.message || `Drive API Error: ${method} ${res.status} ${res.statusText}`;
    console.error(errorMsg);
    const error = new Error(errorMsg);
    Object.assign(error, { status: res.status, details: data });
    throw error;
  }

  return /** @type {T} */ (data);
}
