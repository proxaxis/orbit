/**
 * BFF サーバ経由で Google API へリクエストを転送する純粋モジュール。
 * Vue / Pinia に依存しないため、ページ側のサービスと
 * Service Worker（src/sw.js）のバックグラウンド同期の両方から利用できる。
 *
 * クライアントは Google API を直接呼ばず、`POST {BFF}/request` に
 * リクエスト内容を JSON で渡す。BFF はリクエストをキューに投入して
 * `202 Accepted` + `{ requestId }` を即座に返し、バックグラウンドで
 * Google API を代理呼び出しする。クライアントは `GET {BFF}/request/{requestId}`
 * をポーリングし、結果（上流レスポンスのステータス・ヘッダ・ボディ）を取得する。
 */

/** @type {string} BFF サーバのベース URL（未設定時は空文字 = 同一オリジンの相対パス） */
export const BFF_BASE_URL = (import.meta.env.VITE_BFF_BASE_URL ?? '').replace(/\/$/, '');

/** @type {number} 結果ポーリングの間隔 (ms) */
const POLL_INTERVAL_MS = 250;
/** @type {number} 結果ポーリングのタイムアウト (ms) */
const POLL_TIMEOUT_MS = 60_000;

/**
 * @typedef {Object} BffApiRequest
 * @property {'calendar'|'people'|'photos'|'drive'} service 転送先の Google API サービス（BFF が使用するトークンの選択にも使う）
 * @property {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} method HTTP メソッド
 * @property {string} url 転送先の完全な URL（クエリパラメータ含む）
 * @property {Record<string, string>} [headers] 転送する追加リクエストヘッダ
 * @property {any} [body] JSON リクエストボディ
 * @property {string} [bodyBase64] バイナリリクエストボディ（base64 エンコード）
 * @property {string} [accessToken] BFF 側に保存済みトークンが無い場合の予備アクセストークン
 */

/**
 * @typedef {Object} BffSerializedResponse
 * @property {number} status 上流レスポンスの HTTP ステータス
 * @property {Record<string, string>} headers 上流レスポンスのヘッダ
 * @property {string} bodyBase64 上流レスポンスボディ（base64）
 */

/**
 * @typedef {Object} BffRequestResult
 * @property {'pending'|'done'|'failed'} state 処理状態
 * @property {BffSerializedResponse} [response] state=done 時の上流レスポンス（単発リクエスト）
 * @property {BffSerializedResponse[]} [responses] state=done 時の上流レスポンス（バッチリクエスト）
 * @property {{status?: number, message?: string}} [error] state=failed 時のエラー情報
 */

/**
 * キュー投入されたリクエストの完了をポーリングで待つ
 * @param {string} requestId BFF が発行したリクエスト ID
 * @returns {Promise<BffRequestResult|Response>} ポーリング結果（通信エラー時は Response）
 */
async function pollRequestResult(requestId) {
  const pollUrl = `${BFF_BASE_URL}/request/${encodeURIComponent(requestId)}`;
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const pollRes = await fetch(pollUrl, { credentials: 'include' });
    if (!pollRes.ok) return pollRes;
    /** @type {BffRequestResult} ポーリング結果 */
    const result = await pollRes.json();
    if (result.state !== 'pending') return result;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  return { state: 'failed', error: { status: 504, message: 'BFF request timed out' } };
}

/**
 * BFF の /request エンドポイントへ API リクエストの転送を依頼する。
 * キュー投入後に結果をポーリングし、上流レスポンスを再構築した
 * fetch の Response として返す（呼び出し側は直接 API を呼んだ場合と
 * 同じく res.status / res.json() / res.text() で処理できる）。
 * @param {BffApiRequest} request 転送するリクエスト
 * @returns {Promise<Response>} Google API のレスポンスを再構築した Response
 */
export async function postBffRequest(request) {
  const res = await fetch(`${BFF_BASE_URL}/request`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  // キュー投入失敗（認証エラー・バリデーションエラー等）はそのまま返す
  if (res.status !== 202) return res;

  /** @type {{requestId: string}} キュー投入結果 */
  const { requestId } = await res.json();
  const result = await pollRequestResult(requestId);
  if (result instanceof Response) return result;
  return toResponse(result.state, result.response, result.error);
}

/**
 * 複数の API リクエストを 1 つの BFF ジョブとしてまとめて送信する。
 * `POST /request` に `{ requests: [...] }` を送り、1 回のポーリングで
 * 全レスポンスを受け取る（キューイング・ポーリングの往復を節約する）。
 * @param {BffApiRequest[]} requests 転送するリクエストの一覧
 * @returns {Promise<Response[]>} リクエストと同じ順序の Response 一覧
 */
export async function postBffRequestBatch(requests) {
  if (!requests.length) return [];
  const res = await fetch(`${BFF_BASE_URL}/request`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
  // キュー投入失敗は全リクエストに同じエラーを返す
  if (res.status !== 202) return requests.map(() => res.clone());

  /** @type {{requestId: string}} キュー投入結果 */
  const { requestId } = await res.json();
  const result = await pollRequestResult(requestId);
  if (result instanceof Response) return requests.map(() => result.clone());
  if (result.state === 'failed' || !result.responses) {
    const status = result.state === 'failed' ? (result.error?.status ?? 502) : 502;
    const message = result.state === 'failed' ? (result.error?.message ?? 'BFF request failed') : 'BFF returned an empty result';
    return requests.map(() => errorResponse(status, message));
  }
  return result.responses.map(serializedToResponse);
}

/**
 * ポーリング結果から fetch の Response を再構築する
 * @param {BffRequestResult['state']} state 処理状態
 * @param {BffSerializedResponse|undefined} upstream 上流レスポンス
 * @param {{status?: number, message?: string}} [error] state=failed 時のエラー情報
 * @returns {Response} 再構築した Response
 */
function toResponse(state, upstream, error) {
  if (state === 'failed') return errorResponse(error?.status ?? 502, error?.message ?? 'BFF request failed');
  if (!upstream) return errorResponse(502, 'BFF returned an empty result');
  return serializedToResponse(upstream);
}

/**
 * シリアライズされた上流レスポンスから fetch の Response を再構築する
 * @param {BffSerializedResponse} upstream 上流レスポンス
 * @returns {Response} 再構築した Response
 */
function serializedToResponse(upstream) {
  // fetch の Response コンストラクタが受理できるステータス範囲に正規化
  const status = Number.isInteger(upstream.status) && upstream.status >= 200 && upstream.status <= 599 ? upstream.status : 502;
  const body = status === 204 || status === 304 || !upstream.bodyBase64 ? null : base64ToBytes(upstream.bodyBase64);
  return new Response(body, { status, headers: upstream.headers ?? {} });
}

/**
 * エラーレスポンスを生成する（apiFetch のエラーハンドリングに乗せるため JSON 形式）
 * @param {number} status HTTP ステータス
 * @param {string} message エラーメッセージ
 * @returns {Response} エラーレスポンス
 */
function errorResponse(status, message) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * バイナリボディを base64 文字列へ変換する（/request の JSON エンベロープ用）
 * @param {Blob|Uint8Array} bytes 変換するバイト列
 * @returns {Promise<string>} base64 文字列
 */
export async function bytesToBase64(bytes) {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(await bytes.arrayBuffer());
  const CHUNK_SIZE = 0x8000;
  let binary = '';
  for (let i = 0; i < buffer.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...buffer.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary);
}

/**
 * base64 文字列をバイト列へデコードする
 * @param {string} base64 base64 文字列
 * @returns {Uint8Array} デコードしたバイト列
 */
function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
