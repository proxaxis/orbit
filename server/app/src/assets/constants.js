/**
 * 環境変数の読み込み・検証と、アプリ全体で共有する定数
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

// .env を読み込む。コンテナ/ホスト側に古い値が注入されているケースを
// 確実に修正できるよう、loadEnvFile（非上書き）ではなく parseEnv で
// 読み込み、既存の環境変数より .env の値を優先する。
// 参照先は --env-file と同じく cwd の .env。無い環境（CI 等）は環境変数のみで動く
try {
  const parsed = parseEnv(readFileSync('.env', 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }
} catch {
  // .env が無くてもよい（環境変数のみで動く）
}

/**
 * 環境変数を読み込む。本番（NODE_ENV=production）では必須変数が
 * 未設定なら起動時に例外を投げる。開発時は未設定でも進行し、
 * 各機能がデフォルト値（ephemeral VAPID 鍵等）にフォールバックする
 * @type {EnvironmentVariables}
 * @throws {Error} 本番で必須変数が未定義の場合
 */
export const env = (() => {
  /** @type {(keyof EnvironmentVariables)[]} */
  const names = [
    'NODE_ENV',
    'VITE_CLIENT_APP_BASE_URL',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REDIRECT_URI_AUTH',
    'GOOGLE_REDIRECT_URI_PHOTOS',
    'GOOGLE_REDIRECT_URI_PEOPLE',
    'GOOGLE_REDIRECT_URI_DRIVE',
    'BFF_SESSION_SECRET',
    'BFF_APP_PORT',
    'REDIS_HOST',
    'REDIS_PORT',
    'REALM_PATH',
    'VITE_VAPID_PUBLIC_KEY',
    'VAPID_PRIVATE_KEY',
    'VAPID_SUBJECT',
  ];

  const vars = Object.fromEntries(names.map((name) => [name, process.env[name]]));

  // 追加認可用の redirect URI は任意。未設定なら /enable 共通の PHOTOS URI を使う
  const optional = new Set(['GOOGLE_REDIRECT_URI_PEOPLE', 'GOOGLE_REDIRECT_URI_DRIVE']);
  const required = names.filter((name) => !optional.has(name));
  const missing = required.filter((name) => !vars[name]);
  if (process.env.NODE_ENV === 'production' && missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return /** @type {EnvironmentVariables} */ ({
    ...vars,
    REDIS_PORT: Number(vars.REDIS_PORT),
    BFF_APP_PORT: Number(vars.BFF_APP_PORT),
  });
})();

// --- セッション / Cookie ---
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30日（Cookieの有効期限と揃える）
export const AUTH_STATE_TTL_SECONDS = 60 * 10; // OAuth state の有効期限は10分
export const SESSION_SECRET = env.BFF_SESSION_SECRET;

// クライアントと BFF が別オリジンでも Cookie が送られるよう SameSite=None; Secure を必須とする
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: /** @type {'None'} */ ('None'),
  path: '/',
  maxAge: SESSION_TTL_SECONDS,
};

// --- OAuth スコープ ---
// Google Photos Library API の広範スコープは廃止済みのため、
// appendonly + appcreateddata + picker の現行スコープを使う
export const PHOTO_SHARING_SCOPES = [
  'https://www.googleapis.com/auth/photoslibrary.appendonly',
  'https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata',
  'https://www.googleapis.com/auth/photospicker.mediaitems.readonly',
];

export const PEOPLE_SCOPES = [
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/contacts.other.readonly',
];

// 設定のクラウド同期用（appDataFolder 限定）。メイン認可には含めないオプトイン
export const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.appdata'];

// メイン認可のスコープ。People / Drive API はオプトインのため含めない
export const MAIN_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.profile',
];

// 追加認可タイプごとの設定。コールバックは共通で /enable に戻し、t/state で識別する
/** @type {Record<AdditionalAuthType, { scopes: string[], redirectUri: () => string }>} */
export const ADDITIONAL_AUTH = {
  'photo-sharing': {
    scopes: PHOTO_SHARING_SCOPES,
    redirectUri: () => env.GOOGLE_REDIRECT_URI_PHOTOS,
  },
  people: {
    scopes: PEOPLE_SCOPES,
    redirectUri: () => env.GOOGLE_REDIRECT_URI_PEOPLE || env.GOOGLE_REDIRECT_URI_PHOTOS,
  },
  drive: {
    scopes: DRIVE_SCOPES,
    redirectUri: () => env.GOOGLE_REDIRECT_URI_DRIVE || env.GOOGLE_REDIRECT_URI_PHOTOS,
  },
};
/** @type {Set<string>} */
export const ADDITIONAL_AUTH_TYPES = new Set(Object.keys(ADDITIONAL_AUTH));

// Google が定義する prompt パラメータの有効値（スペース区切りで複数指定可）
export const ALLOWED_PROMPT_TOKENS = new Set(['none', 'consent', 'select_account']);

// アクセストークンの残存有効期限がこれを切ったらリフレッシュする
export const ACCESS_TOKEN_REFRESH_MARGIN_MS = 60 * 1000;

// --- Google API プロキシ ---
// service → グラントタイプと許可 URL の対応。SSRF 防止のため許可リスト外は拒否する
/** @type {Record<ProxyServiceName, { grantType: GrantType, allow: (u: URL) => boolean }>} */
export const PROXY_SERVICES = {
  calendar: {
    grantType: 'main',
    allow: (/** @type {URL} */ u) =>
      u.hostname === 'www.googleapis.com' && u.pathname.startsWith('/calendar/'),
  },
  people: {
    grantType: 'people',
    allow: (/** @type {URL} */ u) => u.hostname === 'people.googleapis.com',
  },
  photos: {
    grantType: 'photo-sharing',
    allow: (/** @type {URL} */ u) =>
      u.hostname === 'photoslibrary.googleapis.com' ||
      u.hostname === 'photospicker.googleapis.com' ||
      u.hostname === 'googleusercontent.com' ||
      u.hostname.endsWith('.googleusercontent.com'),
  },
  drive: {
    grantType: 'drive',
    allow: (/** @type {URL} */ u) =>
      u.hostname === 'www.googleapis.com' &&
      (u.pathname.startsWith('/drive/') || u.pathname.startsWith('/upload/drive/')),
  },
};

export const PROXY_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

// クライアントから送られても上流へ転送しないヘッダ。Authorization は REALM の値で上書きする
export const PROXY_BLOCKED_HEADERS = new Set([
  'authorization',
  'host',
  'cookie',
  'content-length',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'expect',
  'te',
  'trailer',
  'proxy-authenticate',
  'proxy-authorization',
]);

// 上流レスポンスからクライアントへ中継するヘッダ（Content-Type・ボディ・ステータスは必須）
export const PROXY_RELAY_HEADERS = [
  'content-type',
  'content-disposition',
  'location',
  'accept-ranges',
  'cache-control',
  'etag',
  'retry-after',
];

// --- 非同期リクエストキュー ---
// POST /request はバリデーションだけ同期的に行い、ApiRequest を Realm に積んで
// 202 + requestId を即返しする。上流転送は drainApiRequests が行う。
// pending → processing のクレームは write トランザクション内なので複数ワーカーでも重複しない
export const API_REQUEST_RESULT_TTL_MS = 10 * 60 * 1000; // done/failed の結果保持期間
export const API_REQUEST_PENDING_TTL_MS = 15 * 60 * 1000; // pending の安全期限
export const API_REQUEST_STALE_MS = 2 * 60 * 1000; // processing が滞留したとみなす時間
export const API_REQUEST_MAX_ATTEMPTS = 3;
export const API_REQUEST_DRAIN_BATCH = 20;
export const API_REQUEST_POLL_MS = 1000;
export const API_REQUEST_MAX_BATCH = 50; // 1 ジョブに入れられる要素数の上限
// 滞留した processing を他ワーカーが再クレームして二重送信しないよう
// STALE より短いタイムアウトで上流 fetch を打ち切る
export const UPSTREAM_FETCH_TIMEOUT_MS = 60 * 1000;

// --- Web Push ---
// Push サービス側で保持する猶予（端末オフライン時の再配信期限）
export const PUSH_TTL_SECONDS = 60 * 60 * 3;
// スケジューラが次回の due を確認する最大間隔
export const PUSH_SCHEDULER_MAX_DELAY_MS = 60 * 1000;
// 1回のドレインで処理する通知の上限
export const PUSH_DRAIN_BATCH = 100;

// --- GET /api/location（Google Maps 情報抽出） ---
// 取得・解析合わせた全体のタイムアウト
export const LOCATION_FETCH_TIMEOUT_MS = 8 * 1000;
// 追跡するリダイレクトの最大回数（短縮URL maps.app.goo.gl → google.com/maps 用）
export const LOCATION_MAX_REDIRECTS = 5;
// レスポンスボディは先頭 1MB のみ読む（メタ情報は head 内に収まる）
export const LOCATION_MAX_BODY_BYTES = 1024 * 1024;
// 最終 URL をキーにした抽出結果のメモリキャッシュ
export const LOCATION_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const LOCATION_CACHE_MAX_ENTRIES = 500;
// Google がスクリプトのみのページを返さないよう一般的なブラウザ相当の UA を使う
export const LOCATION_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// --- Redis キー ---
/** 追加認可フローの state（CSRF 対策）。短命なので Realm ではなく Redis に置く */
export const getAuthStateKey = (/** @type {string} */ state) => `auth-state:${state}`;
/** ZSET: score=fireAt, member=JSON {h,k,n} */
export const PUSH_DUE_KEY = 'push:due';
export const getPushSubscriptionKey = (/** @type {string} */ endpointHash) =>
  `push:subscription:${endpointHash}`;
export const getPushSubscriptionsIndexKey = (/** @type {string} */ sessionId) =>
  `push:subscriptions:${sessionId}`;
export const getPushScheduleKey = (/** @type {string} */ endpointHash) =>
  `push:schedule:${endpointHash}`;
export const getEndpointHash = (/** @type {string} */ endpoint) =>
  createHash('sha256').update(endpoint).digest('hex');

// --- Realm ---
export const REALM_SCHEMA_VERSION = 3;

/** Realm オブジェクトスキーマ（追加型変更は空マイグレーションで吸収） */
/** @type {import('realm').ObjectSchema[]} */
export const REALM_SCHEMA = [
  {
    name: 'User',
    primaryKey: 'id',
    properties: {
      id: 'string', // Google アカウント ID (sub)
      createdAt: 'date',
      updatedAt: 'date',
    },
  },
  {
    name: 'OAuthGrant', // 1ユーザ×1認可タイプ。id = `${userId}/${type}`
    primaryKey: 'id',
    properties: {
      id: 'string',
      userId: 'string',
      type: 'string', // GrantType
      scopes: 'string[]',
      accessToken: 'string?',
      refreshToken: 'string?',
      expiresAt: 'date?',
      updatedAt: 'date',
    },
  },
  {
    name: 'Session',
    primaryKey: 'id',
    properties: {
      id: 'string',
      userId: 'string',
      createdAt: 'date',
      expiresAt: 'date',
    },
  },
  {
    name: 'ApiRequestLog',
    primaryKey: 'id',
    properties: {
      id: 'string',
      sessionId: 'string',
      service: 'string',
      method: 'string',
      url: 'string',
      status: 'int',
      requestedAt: 'date',
      durationMs: 'double',
    },
  },
  {
    // POST /request の非同期キュー。上流結果は done/failed で保持する
    name: 'ApiRequest',
    primaryKey: 'id',
    properties: {
      id: 'string',
      sessionId: 'string', // 投入者のセッション（GET 時の IDOR 防止に照合）
      userId: 'string',
      state: 'string', // ApiRequestState
      isBatch: 'bool', // true なら requestsJson/responsesJson に配列を保持
      service: 'string',
      method: 'string',
      url: 'string',
      headersJson: 'string?', // フィルタ済み転送ヘッダ（JSON オブジェクト）
      requestBodyBase64: 'string?', // 上流へ送るボディ（base64。なければ null）
      fallbackToken: 'string?', // グラント無し時の予備アクセストークン
      requestsJson: 'string?', // バッチ要素の配列
      responsesJson: 'string?', // バッチ結果の配列
      attempts: 'int',
      status: 'int?',
      responseHeadersJson: 'string?',
      responseBodyBase64: 'string?',
      errorStatus: 'int?',
      errorMessage: 'string?',
      createdAt: 'date',
      updatedAt: 'date',
      expiresAt: 'date?', // 結果保持期限。切れたものは削除/410
    },
  },
];
