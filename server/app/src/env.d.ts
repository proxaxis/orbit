/**
 * プロジェクト全体で共有する型定義。
 * 各 .js ファイルの JSDoc（@type / @param / @returns）から
 * import なしで参照できるよう global に登録する
 */
import type { Context, Hono } from 'hono';
import type Realm from 'realm';
import type { Auth } from 'googleapis';

declare global {
  // --- フレームワーク ---
  /** Hono のリクエストコンテキスト */
  type AppContext = Context;
  /** Hono アプリケーション（ルート登録関数の引数） */
  type AppHono = Hono;

  // --- 外部クライアント ---
  /** ioredis のクライアントインスタンス */
  type RedisClient = import('ioredis').Redis;
  /** googleapis の OAuth2 クライアント */
  type GoogleOAuth2Client = Auth.OAuth2Client;
  /** Google OAuth のトークンセット */
  type GoogleCredentials = Auth.Credentials;

  // --- 環境変数 ---
  /** src/assets/constants.js の env で検証・正規化される環境変数 */
  interface EnvironmentVariables {
    NODE_ENV: string;
    VITE_CLIENT_APP_BASE_URL: string;
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    GOOGLE_REDIRECT_URI_AUTH: string;
    GOOGLE_REDIRECT_URI_PHOTOS: string;
    GOOGLE_REDIRECT_URI_PEOPLE: string;
    GOOGLE_REDIRECT_URI_DRIVE: string;
    BFF_SESSION_SECRET: string;
    BFF_APP_PORT: number;
    REDIS_HOST: string;
    REDIS_PORT: number;
    REALM_PATH: string;
    VITE_VAPID_PUBLIC_KEY: string;
    VAPID_PRIVATE_KEY: string;
    VAPID_SUBJECT: string;
  }

  // --- ドメイン列挙型 ---
  /** OAuthGrant.type / 認可タイプ */
  type GrantType = 'main' | 'photo-sharing' | 'people' | 'drive';
  /** 追加認可タイプ（main を除く） */
  type AdditionalAuthType = Exclude<GrantType, 'main'>;
  /** POST /request の service 名 */
  type ProxyServiceName = 'calendar' | 'people' | 'photos' | 'drive';
  /** ApiRequest.state */
  type ApiRequestState = 'pending' | 'processing' | 'done' | 'failed';

  // --- Realm オブジェクト ---
  /** Realm に保持するユーザ */
  interface RealmUserProps {
    /** Google アカウント ID (sub) */
    id: string;
    createdAt: Date;
    updatedAt: Date;
  }
  type RealmUser = Realm.Object & RealmUserProps;

  /** 1ユーザ×1認可タイプの OAuth グラント。id = `${userId}/${type}` */
  interface RealmOAuthGrantProps {
    id: string;
    userId: string;
    type: GrantType;
    scopes: string[];
    accessToken: string | null;
    refreshToken: string | null;
    expiresAt: Date | null;
    updatedAt: Date;
  }
  type RealmOAuthGrant = Realm.Object & RealmOAuthGrantProps;

  /** upsertGrant に渡す更新値。省略項目は既存値を温存する */
  interface OAuthGrantData {
    scopes?: string[];
    accessToken?: string | null;
    refreshToken?: string | null;
    expiresAt?: Date | null;
  }

  /** セッション（署名付き Cookie の値と対応） */
  interface RealmSessionProps {
    id: string;
    userId: string;
    createdAt: Date;
    expiresAt: Date;
  }
  type RealmSession = Realm.Object & RealmSessionProps;

  /** POST /request の非同期キューオブジェクト */
  interface RealmApiRequestProps {
    id: string;
    /** 投入者のセッション（GET 時の IDOR 防止に照合） */
    sessionId: string;
    userId: string;
    state: ApiRequestState;
    /** true なら requestsJson/responsesJson に配列を保持 */
    isBatch: boolean;
    service: string;
    method: string;
    url: string;
    /** フィルタ済み転送ヘッダ（JSON オブジェクト） */
    headersJson: string | null;
    /** 上流へ送るボディ（base64。なければ null） */
    requestBodyBase64: string | null;
    /** グラント無し時の予備アクセストークン */
    fallbackToken: string | null;
    /** バッチ要素の配列（ApiRequestItem[] の JSON） */
    requestsJson: string | null;
    /** バッチ結果の配列（UpstreamResult[] の JSON） */
    responsesJson: string | null;
    attempts: number;
    status: number | null;
    responseHeadersJson: string | null;
    responseBodyBase64: string | null;
    errorStatus: number | null;
    errorMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
    /** 結果保持期限。切れたものは削除/410 */
    expiresAt: Date | null;
  }
  type RealmApiRequest = Realm.Object & RealmApiRequestProps;

  /** API リクエストの実行ログ */
  interface RealmApiRequestLogProps {
    id: string;
    sessionId: string;
    service: string;
    method: string;
    url: string;
    status: number;
    requestedAt: Date;
    durationMs: number;
  }
  type RealmApiRequestLog = Realm.Object & RealmApiRequestLogProps;

  // --- リクエストキュー関連 ---
  /** 上流へ転送する正規化済みリクエスト要素（単発・バッチ共通） */
  interface ApiRequestItem {
    service: ProxyServiceName;
    method: string;
    url: string;
    headers: Record<string, string>;
    requestBodyBase64: string | null;
    fallbackToken: string | null;
    grantType: GrantType;
  }

  /** 上流 API の中継結果（ボディは必ず base64） */
  interface UpstreamResult {
    status: number;
    headers: Record<string, string>;
    bodyBase64: string;
  }

  /** エンベロープ検証などの即時エラー */
  interface RequestValidationError {
    status: number;
    code: string;
    message: string;
  }

  /** normalizeRequestElement の戻り値（成功か検証エラーのどちらか） */
  type NormalizedRequestElement =
    | { item: ApiRequestItem; error?: undefined }
    | { item?: undefined; error: RequestValidationError };

  /** resolveItemToken の戻り値（トークン解決か失敗のどちらか） */
  type ResolvedToken =
    | { grant: RealmOAuthGrant | null; token: string; error?: undefined }
    | { grant?: undefined; token?: undefined; error: { status: number; code: string } };

  // --- GET /api/location ---
  /** Google Maps ページから抽出した場所情報。name は必須、address は取れた場合のみ */
  interface LocationInfo {
    name: string | null;
    address: string | null;
  }
}

export {};
