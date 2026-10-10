import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getSignedCookie, setSignedCookie, deleteCookie } from 'hono/cookie';
import { google } from 'googleapis';
import Redis from 'ioredis';
import Realm from 'realm';
import webpush from 'web-push';

/**
 * 環境変数
 * @typedef {object} EnvironmentVariables
 * @property {string} NODE_ENV
 * @property {string} GOOGLE_CLIENT_ID
 * @property {string} GOOGLE_CLIENT_SECRET
 * @property {string} GOOGLE_REDIRECT_URI_AUTH
 * @property {string} GOOGLE_REDIRECT_URI_PHOTOS
 * @property {string} GOOGLE_REDIRECT_URI_PEOPLE
 * @property {string} GOOGLE_REDIRECT_URI_DRIVE
 * @property {string} REDIS_HOST
 * @property {number} REDIS_PORT
 * @property {string} REALM_PATH
 * @property {string} BFF_SESSION_SECRET
 * @property {number} BFF_APP_PORT
 * @property {string} VITE_CLIENT_APP_BASE_URL
 * @property {string} VITE_VAPID_PUBLIC_KEY
 * @property {string} VAPID_PRIVATE_KEY
 * @property {string} VAPID_SUBJECT
 */

/** @type {EnvironmentVariables} @throws {Error} 未定義について本番環境では例外を投げる */
const env = (() => {
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
  if (process.env.NODE_ENV === 'production' && missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);

  return /** @type {EnvironmentVariables} */ ({
    ...vars,
    REDIS_PORT: Number(vars.REDIS_PORT),
    BFF_APP_PORT: Number(vars.BFF_APP_PORT),
  });
})();

const app = new Hono();

// Redis クライアント初期化（OAuth state と Push スケジュール用。エンティティの永続化は Realm）
const redis = new (/** @type {any} */ (Redis))({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: undefined,
  lazyConnect: false,
});

redis.on('connect', () => {
  console.log('Connected to Redis server');
});

redis.on('error', (/** @type {any} */ err) => {
  console.error('Redis connection error:', err);
});

// 追加認可フローの state（CSRF 対策）を保存するキー。短命なので Realm ではなく Redis に置く
const getAuthStateKey = (/** @type {string} */ state) => `auth-state:${state}`;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30日（Cookieの有効期限と揃える）
const AUTH_STATE_TTL_SECONDS = 60 * 10; // state の有効期限は10分
const SESSION_SECRET = env.BFF_SESSION_SECRET;

// クライアントと BFF が別オリジンでも Cookie が送られるよう SameSite=None; Secure を必須とする
const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: /** @type {'None'} */ ('None'),
  path: '/',
  maxAge: SESSION_TTL_SECONDS,
};

// Google Photos Library API の広範スコープは廃止済みのため、
// appendonly + appcreateddata + picker の現行スコープを使う
const PHOTO_SHARING_SCOPES = [
  'https://www.googleapis.com/auth/photoslibrary.appendonly',
  'https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata',
  'https://www.googleapis.com/auth/photospicker.mediaitems.readonly',
];

const PEOPLE_SCOPES = [
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/contacts.other.readonly',
];

// 設定のクラウド同期用（appDataFolder 限定）。メイン認可には含めないオプトイン
const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.appdata'];

// メイン認可のスコープ。People API はオプトインのため含めない
const MAIN_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.profile',
];

// 追加認可タイプごとの設定。コールバックは共通で /enable に戻し、t で識別する
const ADDITIONAL_AUTH = {
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
const ADDITIONAL_AUTH_TYPES = new Set(Object.keys(ADDITIONAL_AUTH));

// --- Realm（ユーザ・OAuth グラント・セッション・リクエストログの永続化） ---
const realm = await Realm.open({
  path: env.REALM_PATH, // 未指定なら Realm のデフォルトパス（cwd の default.realm）
  schemaVersion: 3,
  // 追加型スキーマ変更は空のマイグレーションで吸収する
  migration: () => {},
  deleteRealmIfMigrationNeeded: env.NODE_ENV !== 'production',
  schema: [
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
        type: 'string', // 'main' | 'photo-sharing' | 'people'
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
        state: 'string', // 'pending' | 'processing' | 'done' | 'failed'
        isBatch: 'bool', // true なら requestsJson/responsesJson に配列を保持
        service: 'string',
        method: 'string',
        url: 'string',
        headersJson: 'string?', // フィルタ済み転送ヘッダ（JSON オブジェクト）
        requestBodyBase64: 'string?', // 上流へ送るボディ（base64。なければ null）
        fallbackToken: 'string?', // グラント無し時の予備アクセストークン
        requestsJson: 'string?', // バッチ要素の配列（{service,method,url,headers,requestBodyBase64,fallbackToken}）
        responsesJson: 'string?', // バッチ結果の配列（{status,headers,bodyBase64}）
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
  ],
});

/** 期限切れセッションは遅延削除する。有効な Realm Session オブジェクトを返す */
const getSession = (/** @type {string | false | undefined} */ sessionId) => {
  if (!sessionId) return null;
  const session = /** @type {any} */ (realm.objectForPrimaryKey('Session', sessionId));
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    try {
      realm.write(() => realm.delete(session));
    } catch {
      // 既に削除済みなら無視
    }
    return null;
  }
  return session;
};

const createSession = (/** @type {string} */ userId) => {
  const now = Date.now();
  const id = crypto.randomUUID();
  realm.write(() => {
    realm.create('Session', {
      id,
      userId,
      createdAt: new Date(now),
      expiresAt: new Date(now + SESSION_TTL_SECONDS * 1000),
    });
  });
  return id;
};

const upsertUser = (/** @type {string} */ userId) => {
  realm.write(() => {
    const existing = realm.objectForPrimaryKey('User', userId);
    realm.create(
      'User',
      {
        id: userId,
        createdAt: existing?.createdAt ?? new Date(),
        updatedAt: new Date(),
      },
      Realm.UpdateMode.Modified
    );
  });
};

/**
 * グラントを upsert。新しい値が無い項目（特に refreshToken）は既存値を温存する
 * @param {string} userId
 * @param {string} type
 * @param {{ scopes?: string[], accessToken?: string | null, refreshToken?: string | null, expiresAt?: Date | null }} data
 */
const upsertGrant = (userId, type, data) => {
  const id = `${userId}/${type}`;
  realm.write(() => {
    const existing = /** @type {any} */ (realm.objectForPrimaryKey('OAuthGrant', id));
    realm.create(
      'OAuthGrant',
      {
        id,
        userId,
        type,
        scopes: data.scopes ?? (existing ? [...existing.scopes] : []),
        accessToken: data.accessToken ?? existing?.accessToken ?? null,
        refreshToken: data.refreshToken ?? existing?.refreshToken ?? null,
        expiresAt: data.expiresAt ?? existing?.expiresAt ?? null,
        updatedAt: new Date(),
      },
      Realm.UpdateMode.Modified
    );
  });
  return realm.objectForPrimaryKey('OAuthGrant', id);
};

const getGrant = (/** @type {string} */ userId, /** @type {string} */ type) =>
  realm.objectForPrimaryKey('OAuthGrant', `${userId}/${type}`);

const deleteGrant = (/** @type {any} */ grant) => {
  try {
    realm.write(() => realm.delete(grant));
  } catch {
    // 既に削除済みなら無視
  }
};

// アクセストークンの残存有効期限がこれを切ったらリフレッシュする
const ACCESS_TOKEN_REFRESH_MARGIN_MS = 60 * 1000;

const isAccessTokenValid = (/** @type {any} */ grant) =>
  !!grant?.accessToken &&
  !!grant?.expiresAt &&
  grant.expiresAt.getTime() > Date.now() + ACCESS_TOKEN_REFRESH_MARGIN_MS;

/** refreshAccessToken で更新して REALM を書き戻す。invalid_grant は呼び出し側で処理する */
const refreshGrantToken = async (/** @type {any} */ grant) => {
  const client = getOAuth2Client();
  client.setCredentials({ refresh_token: grant.refreshToken });
  const { credentials } = await client.refreshAccessToken();
  realm.write(() => {
    grant.accessToken = credentials.access_token ?? grant.accessToken;
    if (credentials.refresh_token) {
      grant.refreshToken = credentials.refresh_token;
    }
    if (credentials.expiry_date) {
      grant.expiresAt = new Date(credentials.expiry_date);
    }
    grant.updatedAt = new Date();
  });
  return grant.accessToken;
};

/**
 * REALM 上のグラントから有効なアクセストークンを返す。期限切れならリフレッシュする
 * @param {any} grant Realm の OAuthGrant オブジェクト
 * @param {{ forceRefresh?: boolean }} [opts]
 * @returns {Promise<string | null>}
 */
const getValidAccessToken = async (grant, opts = {}) => {
  if (!opts.forceRefresh && isAccessTokenValid(grant)) {
    return grant.accessToken;
  }
  if (grant.refreshToken) {
    return refreshGrantToken(grant);
  }
  // リフレッシュ不能なら残っているトークンを最後まで使う（無ければ null）
  return opts.forceRefresh ? null : (grant.accessToken ?? null);
};

const isInvalidGrantError = (/** @type {any} */ err) =>
  err?.response?.data?.error === 'invalid_grant';

const errMessage = (/** @type {unknown} */ err) =>
  err instanceof Error ? err.message : String(err);

// --- Web Push (VAPID) ---
// 秘密鍵はサーバのみで保持する。環境変数が未設定の場合は起動ごとに生成するが、
// applicationServerKey が変わると既存購読への送信が拒否されるため、
// 本番では VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY を固定して設定すること
const vapidKeys =
  env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY
    ? {
        publicKey: env.VITE_VAPID_PUBLIC_KEY,
        privateKey: env.VAPID_PRIVATE_KEY,
      }
    : webpush.generateVAPIDKeys();
if (!env.VITE_VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
  console.warn(
    'VITE_VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY are not set; using ephemeral VAPID keys. ' +
      'Existing push subscriptions will break on restart.'
  );
}
webpush.setVapidDetails(
  env.VAPID_SUBJECT ?? 'mailto:webpush@localhost',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// Push サービス側で保持する猶予（端末オフライン時の再配信期限）
const PUSH_TTL_SECONDS = 60 * 60 * 3;
// スケジューラが次回の due を確認する最大間隔
const PUSH_SCHEDULER_MAX_DELAY_MS = 60 * 1000;
// 1回のドレインで処理する通知の上限
const PUSH_DRAIN_BATCH = 100;

// Push 関連の Redis キー
const PUSH_DUE_KEY = 'push:due'; // ZSET: score=fireAt, member=JSON {h,k,n}
const getPushSubscriptionKey = (/** @type {string} */ endpointHash) =>
  `push:subscription:${endpointHash}`;
const getPushSubscriptionsIndexKey = (/** @type {string} */ sessionId) =>
  `push:subscriptions:${sessionId}`;
const getPushScheduleKey = (/** @type {string} */ endpointHash) =>
  `push:schedule:${endpointHash}`;
const getEndpointHash = (/** @type {string} */ endpoint) =>
  createHash('sha256').update(endpoint).digest('hex');

// Google が定義する prompt パラメータの有効値（スペース区切りで複数指定可）
const ALLOWED_PROMPT_TOKENS = new Set(['none', 'consent', 'select_account']);

/**
 * ?prompt= クエリを検証する。
 * 未指定・空文字なら prompt=null（デフォルト動作）、全トークンが許可値なら
 * 正規化した文字列を返し、それ以外は error を返す
 * @param {string | undefined} raw
 * @returns {{ prompt: string | null, error: string | null }}
 */
const parsePromptParam = (raw) => {
  if (!raw || !raw.trim()) {
    return { prompt: null, error: null };
  }
  const tokens = raw.trim().split(/\s+/);
  if (!tokens.every((token) => ALLOWED_PROMPT_TOKENS.has(token))) {
    return { prompt: null, error: 'Invalid prompt parameter' };
  }
  return { prompt: tokens.join(' '), error: null };
};

// CORS 設定（Vite 開発サーバーからの Cookie 送信を許可）
app.use(
  '*',
  cors({
    origin: env.VITE_CLIENT_APP_BASE_URL,
    credentials: true,
  })
);

/**
 * Google OAuth2 クライアント初期化
 */
const getOAuth2Client = (redirectUri = env.GOOGLE_REDIRECT_URI_AUTH) =>
  new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );

/**
 * 認可済みトークンから Google アカウント ID (sub) を取得する。
 * id_token があればそれをデコードし、無ければ userinfo エンドポイントを叩く
 */
const getGoogleUserId = async (/** @type {any} */ client, /** @type {any} */ tokens) => {
  if (tokens.id_token) {
    try {
      const payload = JSON.parse(
        Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString('utf8')
      );
      if (typeof payload?.sub === 'string' && payload.sub) {
        return payload.sub;
      }
    } catch {
      // デコード失敗時は userinfo にフォールバック
    }
  }
  const { data } = await google
    .oauth2({ version: 'v2', auth: client })
    .userinfo.get();
  return data.id ?? null;
};

const getSessionFromCookie = async (/** @type {any} */ c) => {
  const sessionId = await getSignedCookie(c, SESSION_SECRET, 'session_id');
  return sessionId ? getSession(sessionId) : null;
};

/**
 * 購読・スケジュール・セッション索引をまとめて削除する
 * @param {string} endpointHash
 */
const removePushSubscription = async (endpointHash) => {
  const raw = await redis.get(getPushSubscriptionKey(endpointHash));
  const members = await redis.hvals(getPushScheduleKey(endpointHash));

  const pipeline = redis.pipeline();
  if (members.length) {
    pipeline.zrem(PUSH_DUE_KEY, members);
  }
  pipeline.del(getPushScheduleKey(endpointHash), getPushSubscriptionKey(endpointHash));

  if (raw) {
    try {
      const { sessionId } = JSON.parse(raw);
      if (sessionId) {
        pipeline.srem(getPushSubscriptionsIndexKey(sessionId), endpointHash);
      }
    } catch {
      // 壊れたデータは索引の掃除だけスキップして削除を続行
    }
  }
  await pipeline.exec();
};

// fireAt を過ぎた通知を取り出して Push 送信する。
// ZREM で先に請求するため複数インスタンスがいても二重送信しない
const drainDuePushNotifications = async () => {
  const members = await redis.zrangebyscore(
    PUSH_DUE_KEY,
    0,
    Date.now(),
    'LIMIT',
    0,
    PUSH_DRAIN_BATCH
  );

  for (const member of members) {
    if ((await redis.zrem(PUSH_DUE_KEY, member)) !== 1) {
      continue;
    }

    let item;
    try {
      item = JSON.parse(member);
    } catch {
      continue;
    }
    const { h: endpointHash, k: key, n: notification } = item ?? {};
    if (!endpointHash || !key || !notification) {
      continue;
    }

    // 送信成否にかかわらず送信済みとして破棄する
    await redis.hdel(getPushScheduleKey(endpointHash), key);
    const raw = await redis.get(getPushSubscriptionKey(endpointHash));
    if (!raw) {
      continue;
    }

    let subscription;
    try {
      subscription = JSON.parse(raw);
    } catch {
      continue;
    }

    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: subscription.keys },
        JSON.stringify({ key, notification }),
        { TTL: PUSH_TTL_SECONDS }
      );
    } catch (err) {
      const status = /** @type {any} */ (err)?.statusCode;
      if (status === 404 || status === 410) {
        // 失効した購読は以後の送信予定ごと削除する
        await removePushSubscription(endpointHash);
      } else {
        console.error(
          'Failed to send push notification:',
          errMessage(err),
          status
        );
      }
    }
  }
};

// 次の due 時刻までスリープする自己再スケジュール型タイマー。
// 新しい通知が追加されたときは schedulePushDrain(0) で即座に起こす
/** @type {ReturnType<typeof setTimeout> | null} */
let pushTimer = null;
const schedulePushDrain = (/** @type {number} */ delayMs) => {
  if (pushTimer) {
    clearTimeout(pushTimer);
  }
  pushTimer = setTimeout(async () => {
    try {
      await drainDuePushNotifications();
      const next = await redis.zrange(PUSH_DUE_KEY, '0', '0', 'WITHSCORES');
      const nextDelay =
        next.length >= 2
          ? Math.min(Math.max(Number(next[1]) - Date.now(), 0), PUSH_SCHEDULER_MAX_DELAY_MS)
          : PUSH_SCHEDULER_MAX_DELAY_MS;
      schedulePushDrain(nextDelay);
    } catch (err) {
      console.error('Push scheduler error:', err);
      schedulePushDrain(PUSH_SCHEDULER_MAX_DELAY_MS);
    }
  }, delayMs);
  pushTimer.unref?.();
};
schedulePushDrain(0);

// ログイン開始 - Google の OAuth 認証画面へリダイレクト
// ?prompt= を指定すると検証のうえ認可 URL へ転送する（アカウント切り替え用）
app.get('/auth/login', (c) => {
  const { prompt, error } = parsePromptParam(c.req.query('prompt'));
  if (error) {
    return c.text(error, 400);
  }

  const client = getOAuth2Client();

  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    prompt: prompt ?? 'consent',
    scope: MAIN_SCOPES,
  });

  return c.redirect(authUrl);
});

// メイン OAuth コールバック - 認可コードからトークンを取得し、Realm に
// User/OAuthGrant/Session を保存して署名付き HttpOnly Cookie を発行する
app.get('/auth', async (c) => {
  const unauthorized = () =>
    c.redirect(`${env.VITE_CLIENT_APP_BASE_URL}/unauthorized`);

  const code = c.req.query('code');
  if (!code) {
    return unauthorized();
  }

  const client = getOAuth2Client();
  let tokens;
  try {
    ({ tokens } = await client.getToken(code));
  } catch (err) {
    console.error('Failed to exchange authorization code:', errMessage(err));
    return unauthorized();
  }

  let userId;
  try {
    client.setCredentials(tokens);
    userId = await getGoogleUserId(client, tokens);
  } catch (err) {
    console.error('Failed to fetch Google user info:', errMessage(err));
  }
  if (!userId) {
    return unauthorized();
  }

  upsertUser(userId);
  upsertGrant(userId, 'main', {
    scopes: tokens.scope ? tokens.scope.split(' ') : MAIN_SCOPES,
    accessToken: tokens.access_token ?? null,
    refreshToken: tokens.refresh_token ?? null,
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
  });

  // 再ログイン時は古いセッションを破棄してから新規発行する
  const previous = await getSessionFromCookie(c);
  if (previous) {
    try {
      realm.write(() => realm.delete(previous));
    } catch {
      // 既に削除済みなら無視
    }
  }
  const sessionId = createSession(userId);

  // 署名付き HttpOnly Cookie をブラウザに付与
  await setSignedCookie(c, 'session_id', sessionId, SESSION_SECRET, SESSION_COOKIE_OPTIONS);

  return c.redirect(`${env.VITE_CLIENT_APP_BASE_URL}/authorized`);
});

// 追加スコープ認可の開始 - 既存セッションに Photos / People の権限を追加するため
// Google の OAuth 認証画面へリダイレクトする（コールバックは /enable?t=<type>）
const startAdditionalAuth = (/** @type {string} */ type) => async (/** @type {any} */ c) => {
  const session = await getSessionFromCookie(c);

  // 未ログインの場合はメインのログインフローへリダイレクト
  if (!session) {
    return c.redirect('/auth/login');
  }

  // state を発行してセッションと認可タイプに紐づけ、コールバックでの CSRF を防ぐ
  const { prompt, error } = parsePromptParam(c.req.query('prompt'));
  if (error) {
    return c.text(error, 400);
  }

  const cfg = ADDITIONAL_AUTH[/** @type {'photo-sharing' | 'people'} */ (type)];
  const state = crypto.randomUUID();
  await redis.set(
    getAuthStateKey(state),
    JSON.stringify({ s: session.id, t: type }),
    'EX',
    AUTH_STATE_TTL_SECONDS
  );

  const client = getOAuth2Client(cfg.redirectUri());

  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    prompt: prompt ?? 'consent',
    include_granted_scopes: true,
    scope: cfg.scopes,
    state,
  });

  return c.redirect(authUrl);
};

app.get('/auth/photo-sharing', startAdditionalAuth('photo-sharing'));
app.get('/auth/people', startAdditionalAuth('people'));
app.get('/auth/drive', startAdditionalAuth('drive'));

// 追加スコープ認可のコールバック - state に保持した認可タイプで判別してトークンを交換し、
// OAuthGrant をセッションのユーザに紐づけて upsert する
app.get('/enable', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');

  // state から認可フローを開始したセッションとタイプを復元（ワンタイム利用）
  const stateKey = state ? getAuthStateKey(state) : null;
  const stateRaw = stateKey ? await redis.get(stateKey) : null;
  if (stateRaw && stateKey) {
    await redis.del(stateKey);
  }

  /** @type {string | undefined} */
  let sessionId;
  /** @type {string | undefined} */
  let type;
  if (stateRaw) {
    try {
      const parsed = JSON.parse(stateRaw);
      sessionId = parsed?.s;
      type = parsed?.t;
    } catch {
      sessionId = stateRaw; // 旧形式（セッションIDのみ）はクエリの t に委ねる
    }
  }
  type ??= c.req.query('t');

  if (!ADDITIONAL_AUTH_TYPES.has(type ?? '')) {
    return c.text('Unsupported enable type', 400);
  }
  const grantType = /** @type {'photo-sharing' | 'people'} */ (type);

  const redirectTo = (/** @type {string} */ path) =>
    c.redirect(`${env.VITE_CLIENT_APP_BASE_URL}/${path}?t=${grantType}`);

  // code / state がない場合（ユーザーが同意を拒否した場合等）もフロントへ戻す
  const session = sessionId ? getSession(sessionId) : null;
  if (!code || !stateRaw || !session) {
    if (!code || !session) {
      console.warn('Additional auth callback without code, state, or valid session');
    }
    return redirectTo('unauthorized');
  }

  try {
    const cfg = ADDITIONAL_AUTH[grantType];
    const client = getOAuth2Client(cfg.redirectUri());
    const { tokens } = await client.getToken(code);

    upsertGrant(session.userId, grantType, {
      scopes: tokens.scope ? tokens.scope.split(' ') : cfg.scopes,
      accessToken: tokens.access_token ?? null,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    });
  } catch (err) {
    console.error(`Failed to exchange ${grantType} authorization code:`, errMessage(err));
    return redirectTo('unauthorized');
  }

  return redirectTo('authorized');
});

// 有効な Google Access Token を取得および更新
// ?t=photo-sharing / ?t=people の場合は追加スコープで認可済みのグラントを使う
app.get('/api/token', async (c) => {
  const t = c.req.query('t');
  const type = t || 'main';

  if (t && !ADDITIONAL_AUTH_TYPES.has(t)) {
    return c.json({ error: 'UNSUPPORTED_TOKEN_TYPE' }, 400);
  }

  const session = await getSessionFromCookie(c);
  if (!session) {
    return c.json({ error: 'UNAUTHORIZED' }, 401);
  }

  const notAuthorized = () =>
    type === 'main'
      ? c.json({ error: 'UNAUTHORIZED' }, 401)
      : c.json({ error: `${type.toUpperCase().replace(/-/g, '_')}_NOT_AUTHORIZED` }, 404);

  const grant = getGrant(session.userId, type);
  if (!grant) {
    return notAuthorized();
  }

  try {
    const token = await getValidAccessToken(grant);
    if (!token) {
      return notAuthorized();
    }
    return c.json({ gAccessToken: token });
  } catch (err) {
    // GaxiosError は config.data にリフレッシュトークンを含むため、
    // エラーオブジェクト全体はログに出さずメッセージとレスポンスボディだけ残す
    const oauthError = /** @type {any} */ (err)?.response?.data;
    console.error('Failed to refresh access token:', errMessage(err), oauthError);

    // invalid_grant はトークン失効/revoke 済みなので、グラントを破棄して再認可を促す
    if (isInvalidGrantError(err)) {
      deleteGrant(grant);
      return notAuthorized();
    }

    return c.json({ error: 'TOKEN_REFRESH_FAILED' }, 401);
  }
});

// --- Google API プロキシ ---
// service → グラントタイプと許可 URL の対応。SSRF 防止のため許可リスト外は拒否する
const PROXY_SERVICES = {
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
const PROXY_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
// クライアントから送られても上流へ転送しないヘッダ。Authorization は REALM の値で上書きする
const PROXY_BLOCKED_HEADERS = new Set([
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
const PROXY_RELAY_HEADERS = [
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
const API_REQUEST_RESULT_TTL_MS = 10 * 60 * 1000; // done/failed の結果保持期間
const API_REQUEST_PENDING_TTL_MS = 15 * 60 * 1000; // pending の安全期限
const API_REQUEST_STALE_MS = 2 * 60 * 1000; // processing が滞留したとみなす時間
const API_REQUEST_MAX_ATTEMPTS = 3;
const API_REQUEST_DRAIN_BATCH = 20;
const API_REQUEST_POLL_MS = 1000;
const API_REQUEST_MAX_BATCH = 50; // 1 ジョブに入れられる要素数の上限

const finishApiRequest = (/** @type {any} */ req, /** @type {object} */ patch) => {
  try {
    realm.write(() => {
      Object.assign(req, patch);
      req.updatedAt = new Date();
    });
  } catch (err) {
    console.error('Failed to update ApiRequest:', errMessage(err));
  }
};

const failApiRequest = (/** @type {any} */ req, /** @type {number} */ status, /** @type {string} */ message) =>
  finishApiRequest(req, {
    state: 'failed',
    errorStatus: status,
    errorMessage: message,
    expiresAt: new Date(Date.now() + API_REQUEST_RESULT_TTL_MS),
  });

// 要素の service に対応するグラントを解決してアクセストークンを返す。
// 解決不能なら { error: { status, code } } を返す
const resolveItemToken = async (/** @type {string} */ userId, /** @type {string} */ grantType, /** @type {string | null} */ fallbackToken) => {
  const grant = getGrant(userId, grantType);
  if (grant) {
    try {
      const token = await getValidAccessToken(grant);
      if (token) {
        return { grant, token };
      }
      return { error: { status: 403, code: 'SCOPE_NOT_AUTHORIZED' } };
    } catch (err) {
      if (isInvalidGrantError(err)) {
        deleteGrant(grant);
        return { error: { status: 403, code: 'SCOPE_NOT_AUTHORIZED' } };
      }
      return { error: { status: 502, code: 'TOKEN_REFRESH_FAILED' } };
    }
  }
  if (fallbackToken) {
    return { grant: null, token: fallbackToken };
  }
  return { error: { status: 403, code: 'SCOPE_NOT_AUTHORIZED' } };
};

// 上流 API を 1 回呼び、{status, headers, bodyBase64} を返す。
// 上流が 401 を返したらリフレッシュして 1 回だけ再試行する。
// リフレッシュが invalid_grant ならグラントを破棄して bffCode='GRANT_REVOKED' を投げる
const fetchUpstream = async (/** @type {any} */ item, /** @type {string} */ token, /** @type {any} */ grant) => {
  const fwdHeaders = new Headers();
  for (const [k, v] of Object.entries(item.headers ?? {})) {
    if (typeof v === 'string') {
      fwdHeaders.set(k, v);
    }
  }
  const upstreamBody = item.requestBodyBase64
    ? Buffer.from(item.requestBodyBase64, 'base64')
    : undefined;

  const doFetch = (/** @type {string} */ bearer) => {
    fwdHeaders.set('authorization', `Bearer ${bearer}`);
    return fetch(item.url, {
      method: item.method,
      headers: fwdHeaders,
      body: /** @type {any} */ (upstreamBody),
      redirect: 'manual',
      // 滞留した processing を他ワーカーが再クレームして二重送信しないよう
      // STALE より短いタイムアウトで打ち切る
      signal: AbortSignal.timeout(60 * 1000),
    });
  };

  let res = await doFetch(token);
  if (res.status === 401 && grant?.refreshToken) {
    try {
      const newToken = await getValidAccessToken(grant, { forceRefresh: true });
      if (newToken) {
        res = await doFetch(newToken);
      }
    } catch (err) {
      if (isInvalidGrantError(err)) {
        deleteGrant(grant);
        throw Object.assign(new Error('SCOPE_NOT_AUTHORIZED'), { bffCode: 'GRANT_REVOKED' });
      }
      console.error('Failed to refresh access token after upstream 401:', errMessage(err));
      // リフレッシュ失敗時は元の 401 レスポンスをそのまま格納する
    }
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const responseHeaders = /** @type {Record<string, string>} */ ({});
  for (const name of PROXY_RELAY_HEADERS) {
    const value = res.headers.get(name);
    if (value) {
      responseHeaders[name] = value;
    }
  }
  return { status: res.status, headers: responseHeaders, bodyBase64: buffer.toString('base64') };
};

// 要素単位の失敗を上流レスポンスと同じ形に合成する（バッチでは要素ごとに成否を返す）
const elementErrorResult = (/** @type {number} */ status, /** @type {string} */ code) => ({
  status,
  headers: { 'content-type': 'application/json' },
  bodyBase64: Buffer.from(JSON.stringify({ error: { code } }), 'utf8').toString('base64'),
});

// API リクエストログを REALM に記録する（失敗しても結果は残す）
const writeApiRequestLog = (/** @type {string} */ sessionId, /** @type {any} */ item, /** @type {number} */ status, /** @type {number} */ durationMs) => {
  try {
    realm.write(() => {
      realm.create('ApiRequestLog', {
        id: crypto.randomUUID(),
        sessionId,
        service: item.service,
        method: item.method,
        url: item.url,
        status,
        requestedAt: new Date(Date.now() - durationMs),
        durationMs,
      });
    });
  } catch (err) {
    console.warn('Failed to write ApiRequestLog:', errMessage(err));
  }
};

// 上流へ転送し、結果（または上流 401）を ApiRequest に書き戻す。
// バッチは要素を順次実行し、個々の失敗は要素の status に格納してジョブは done にする
const processApiRequest = async (/** @type {any} */ req) => {
  const startedAt = Date.now();
  const resultExpiry = () => new Date(Date.now() + API_REQUEST_RESULT_TTL_MS);
  try {
    if (req.isBatch) {
      /** @type {any[] | null} */
      let items = null;
      try {
        items = JSON.parse(req.requestsJson);
      } catch {
        // 壊れたペイロードはジョブ自体の失敗
      }
      if (!Array.isArray(items) || !items.length) {
        return failApiRequest(req, 500, 'Corrupt batch payload');
      }

      const responses = [];
      for (const item of items) {
        const elementStartedAt = Date.now();
        const svc = PROXY_SERVICES[/** @type {keyof typeof PROXY_SERVICES} */ (item.service)];
        const tokenResult = svc
          ? await resolveItemToken(req.userId, svc.grantType, item.fallbackToken)
          : { error: { status: 400, code: 'INVALID_REQUEST' } };

        /** @type {{ status: number, headers: Record<string, string>, bodyBase64: string }} */
        let element;
        if (tokenResult.error) {
          element = elementErrorResult(tokenResult.error.status, tokenResult.error.code);
        } else {
          try {
            element = await fetchUpstream(item, tokenResult.token, tokenResult.grant);
          } catch (err) {
            element =
              /** @type {any} */ (err)?.bffCode === 'GRANT_REVOKED'
                ? elementErrorResult(403, 'SCOPE_NOT_AUTHORIZED')
                : elementErrorResult(502, errMessage(err));
          }
        }
        responses.push(element);
        writeApiRequestLog(req.sessionId, item, element.status, Date.now() - elementStartedAt);
      }

      return finishApiRequest(req, {
        state: 'done',
        responsesJson: JSON.stringify(responses),
        errorStatus: null,
        errorMessage: null,
        expiresAt: resultExpiry(),
      });
    }

    const svc = PROXY_SERVICES[/** @type {keyof typeof PROXY_SERVICES} */ (req.service)];
    if (!svc) {
      return failApiRequest(req, 400, 'INVALID_REQUEST');
    }
    /** @type {any} */
    let headers = {};
    try {
      headers = JSON.parse(req.headersJson ?? '{}');
    } catch {
      // 壊れたヘッダは無視して空から始める
    }
    const item = {
      service: req.service,
      method: req.method,
      url: req.url,
      headers,
      requestBodyBase64: req.requestBodyBase64,
      fallbackToken: req.fallbackToken,
    };

    const tokenResult = await resolveItemToken(req.userId, svc.grantType, item.fallbackToken);
    if (tokenResult.error) {
      return failApiRequest(req, tokenResult.error.status, tokenResult.error.code);
    }

    /** @type {{ status: number, headers: Record<string, string>, bodyBase64: string }} */
    let element;
    try {
      element = await fetchUpstream(item, tokenResult.token, tokenResult.grant);
    } catch (err) {
      if (/** @type {any} */ (err)?.bffCode === 'GRANT_REVOKED') {
        return failApiRequest(req, 403, 'SCOPE_NOT_AUTHORIZED');
      }
      return failApiRequest(req, 502, errMessage(err));
    }

    finishApiRequest(req, {
      state: 'done',
      status: element.status,
      responseHeadersJson: JSON.stringify(element.headers),
      responseBodyBase64: element.bodyBase64,
      errorStatus: null,
      errorMessage: null,
      expiresAt: resultExpiry(),
    });
    writeApiRequestLog(req.sessionId, item, element.status, Date.now() - startedAt);
  } catch (err) {
    console.error('ApiRequest worker error:', errMessage(err));
    failApiRequest(req, 502, errMessage(err));
  }
};

// pending を 1 件だけ processing にする。write トランザクション内で行うため
// 複数インスタンスがいても二重取得しない
const claimNextApiRequest = () => {
  /** @type {any} */
  let claimed = null;
  realm.write(() => {
    const pending = realm
      .objects('ApiRequest')
      .filtered('state == $0', 'pending')
      .sorted('createdAt');
    for (const req of pending) {
      req.state = 'processing';
      req.attempts += 1;
      req.updatedAt = new Date();
      req.expiresAt = null; // 実行中は期限切れ掃除の対象外にする
      claimed = req;
      break;
    }
  });
  return claimed;
};

const drainApiRequests = async () => {
  const now = Date.now();
  realm.write(() => {
    // 滞留した processing を pending に戻す（回数超過なら failed）
    const stale = [
      ...realm
        .objects('ApiRequest')
        .filtered('state == "processing" AND updatedAt < $0', new Date(now - API_REQUEST_STALE_MS)),
    ];
    for (const req of stale) {
      if (req.attempts >= API_REQUEST_MAX_ATTEMPTS) {
        req.state = 'failed';
        req.errorStatus = 502;
        req.errorMessage = 'Request processing timed out';
        req.expiresAt = new Date(now + API_REQUEST_RESULT_TTL_MS);
      } else {
        req.state = 'pending';
        req.expiresAt = new Date(now + API_REQUEST_PENDING_TTL_MS);
      }
      req.updatedAt = new Date(now);
    }
    // 期限切れ（孤児 pending と保持切れの結果）を掃除する
    const expired = realm
      .objects('ApiRequest')
      .filtered('expiresAt != null AND expiresAt < $0', new Date(now));
    if (expired.length) {
      realm.delete(expired);
    }
  });

  for (let i = 0; i < API_REQUEST_DRAIN_BATCH; i++) {
    const req = claimNextApiRequest();
    if (!req) {
      break;
    }
    await processApiRequest(req);
  }
};

// POST されたら即時キックし、通常は定周期で pending を拾う（他インスタンス積み残し対策）
/** @type {ReturnType<typeof setTimeout> | null} */
let apiRequestTimer = null;
const scheduleApiRequestDrain = (/** @type {number} */ delayMs) => {
  if (apiRequestTimer) {
    clearTimeout(apiRequestTimer);
  }
  apiRequestTimer = setTimeout(async () => {
    try {
      await drainApiRequests();
    } catch (err) {
      console.error('ApiRequest scheduler error:', err);
    }
    scheduleApiRequestDrain(API_REQUEST_POLL_MS);
  }, delayMs);
  apiRequestTimer.unref?.();
};
scheduleApiRequestDrain(0);

// 1 要素分のエンベロープを検証・正規化する。失敗時は { error } を返す
const normalizeRequestElement = (/** @type {any} */ el, /** @type {string} */ userId) => {
  const service = el?.service;
  const method = typeof el?.method === 'string' ? el.method.toUpperCase() : '';
  const svc = PROXY_SERVICES[/** @type {keyof typeof PROXY_SERVICES} */ (service)];

  if (!svc || !PROXY_METHODS.has(method) || typeof el?.url !== 'string') {
    return {
      error: { status: 400, code: 'INVALID_REQUEST', message: 'Invalid request envelope' },
    };
  }

  /** @type {URL | null} */
  let parsed;
  try {
    parsed = new URL(el.url);
  } catch {
    parsed = null;
  }
  if (
    !parsed ||
    parsed.protocol !== 'https:' ||
    (parsed.port !== '' && parsed.port !== '443') ||
    !svc.allow(parsed)
  ) {
    return {
      error: { status: 400, code: 'URL_NOT_ALLOWED', message: 'URL is not allowed for this service' },
    };
  }

  // グラントも予備トークンも無ければ拒否（ワーカー側でも再検査される）
  const grant = getGrant(userId, svc.grantType);
  const fallbackToken =
    typeof el?.accessToken === 'string' && el.accessToken ? el.accessToken : null;
  if (!grant && !fallbackToken) {
    return {
      error: {
        status: 403,
        code: 'SCOPE_NOT_AUTHORIZED',
        message: `No '${svc.grantType}' grant for this user`,
      },
    };
  }

  // 転送ヘッダとボディをこの時点で確定させる。
  // Authorization はクライアントから送られても採用せず、ワーカーが REALM の値で付与する
  const headers = /** @type {Record<string, string>} */ ({});
  if (el?.headers && typeof el.headers === 'object' && !Array.isArray(el.headers)) {
    for (const [k, v] of Object.entries(el.headers)) {
      if (typeof v === 'string' && !PROXY_BLOCKED_HEADERS.has(k.toLowerCase())) {
        headers[k.toLowerCase()] = v;
      }
    }
  }

  /** @type {string | null} */
  let requestBodyBase64 = null;
  if (el?.bodyBase64 != null) {
    if (typeof el.bodyBase64 !== 'string') {
      return {
        error: { status: 400, code: 'INVALID_REQUEST', message: 'bodyBase64 must be a base64 string' },
      };
    }
    requestBodyBase64 = el.bodyBase64;
  } else if (el?.body != null) {
    requestBodyBase64 = Buffer.from(JSON.stringify(el.body), 'utf8').toString('base64');
    if (!headers['content-type']) {
      headers['content-type'] = 'application/json';
    }
  }

  return {
    item: {
      service,
      method,
      url: parsed.href,
      headers,
      requestBodyBase64,
      fallbackToken,
      grantType: svc.grantType,
    },
  };
};

const apiRequestError = (/** @type {any} */ c, /** @type {{ status: number, code: string, message: string }} */ err) =>
  c.json({ error: { message: err.message, code: err.code } }, /** @type {any} */ (err.status));

// クライアントからの Google API リクエストをキューに投入する。
// 単発エンベロープまたは { requests: [...] } のバッチ形式を受け付け、
// セッション Cookie でユーザを特定して 1 ジョブとして積む
// （実際の転送はワーカーが非同期に行う。結果は GET /request/:id で取得）
app.post('/request', async (c) => {
  const session = await getSessionFromCookie(c);
  if (!session) {
    return c.json({ error: 'UNAUTHORIZED' }, 401);
  }

  const body = await c.req.json().catch(() => null);

  /** @type {any[] | null} */
  let batchItems = null;
  /** @type {any | null} */
  let singleItem = null;

  if (Array.isArray(body?.requests)) {
    if (!body.requests.length || body.requests.length > API_REQUEST_MAX_BATCH) {
      return apiRequestError(c, {
        status: 400,
        code: 'INVALID_REQUEST',
        message: `requests must be a non-empty array of at most ${API_REQUEST_MAX_BATCH} elements`,
      });
    }
    batchItems = [];
    // 1 件でも検証に落ちればジョブ全体を拒否する（部分投入しない）
    for (const el of body.requests) {
      const normalized = normalizeRequestElement(el, session.userId);
      if (normalized.error) {
        return apiRequestError(c, normalized.error);
      }
      batchItems.push(normalized.item);
    }
  } else {
    const normalized = normalizeRequestElement(body, session.userId);
    if (normalized.error) {
      return apiRequestError(c, normalized.error);
    }
    singleItem = normalized.item;
  }

  const requestId = crypto.randomUUID();
  const now = new Date();
  realm.write(() => {
    realm.create('ApiRequest', {
      id: requestId,
      sessionId: session.id,
      userId: session.userId,
      state: 'pending',
      isBatch: !!batchItems,
      service: batchItems ? 'batch' : singleItem.service,
      method: batchItems ? '-' : singleItem.method,
      url: batchItems ? `batch:${batchItems.length}` : singleItem.url,
      headersJson: batchItems ? null : JSON.stringify(singleItem.headers),
      requestBodyBase64: batchItems ? null : singleItem.requestBodyBase64,
      fallbackToken: batchItems ? null : singleItem.fallbackToken,
      requestsJson: batchItems ? JSON.stringify(batchItems) : null,
      responsesJson: null,
      attempts: 0,
      status: null,
      responseHeadersJson: null,
      responseBodyBase64: null,
      errorStatus: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + API_REQUEST_PENDING_TTL_MS),
    });
  });
  scheduleApiRequestDrain(0);

  return c.json({ requestId }, 202);
});

// キュー結果の取得。requestId は投入者のセッションに紐付くため他ユーザは参照できない
app.get('/request/:id', async (c) => {
  const session = await getSessionFromCookie(c);
  if (!session) {
    return c.json({ error: 'UNAUTHORIZED' }, 401);
  }

  const req = /** @type {any} */ (realm.objectForPrimaryKey('ApiRequest', c.req.param('id')));
  if (!req || req.sessionId !== session.id) {
    return c.json({ error: 'NOT_FOUND' }, 404);
  }
  if (req.expiresAt && req.expiresAt.getTime() <= Date.now()) {
    realm.write(() => realm.delete(req));
    return c.json({ error: 'GONE' }, 410);
  }
  if (req.state === 'done') {
    if (req.isBatch) {
      // バッチは requests と同じ順序・要素数で responses を返す
      return c.json({
        state: 'done',
        responses: JSON.parse(req.responsesJson ?? '[]'),
      });
    }
    return c.json({
      state: 'done',
      response: {
        status: req.status ?? 0,
        headers: JSON.parse(req.responseHeadersJson ?? '{}'),
        bodyBase64: req.responseBodyBase64 ?? '',
      },
    });
  }
  if (req.state === 'failed') {
    return c.json({
      state: 'failed',
      error: {
        status: req.errorStatus ?? 502,
        message: req.errorMessage ?? 'Upstream request failed',
      },
    });
  }
  return c.json({ state: 'pending' });
});

// Push 購読に使う VAPID 公開鍵を返す（公開情報のため認証不要。秘密鍵はサーバのみで保持）
app.get('/api/push/vapid-key', (c) => {
  return c.json({ publicKey: vapidKeys.publicKey });
});

// Push 購読の登録と通知スケジュールの登録/置き換え
// endpoint ごとに購読を upsert し、送信予定は POST のたび全置き換え（空配列で全解除）
app.post('/api/push/subscriptions', async (c) => {
  const session = await getSessionFromCookie(c);
  if (!session) {
    return c.json({ error: 'UNAUTHORIZED' }, 401);
  }
  const sessionId = session.id;

  const body = await c.req.json().catch(() => null);
  const subscription = body?.subscription;
  const notifications = body?.notifications;

  const validSubscription =
    typeof subscription?.endpoint === 'string' &&
    subscription.endpoint.startsWith('https://') &&
    typeof subscription?.keys?.p256dh === 'string' &&
    typeof subscription?.keys?.auth === 'string';
  const validNotifications =
    Array.isArray(notifications) &&
    notifications.every(
      (n) =>
        typeof n?.key === 'string' &&
        n.key.length > 0 &&
        typeof n?.fireAt === 'number' &&
        Number.isFinite(n.fireAt) &&
        typeof n?.notification?.title === 'string'
    );

  if (!validSubscription || !validNotifications) {
    return c.json({ error: 'INVALID_REQUEST' }, 400);
  }

  const endpointHash = getEndpointHash(subscription.endpoint);

  // ログインユーザー（セッション）に紐付けて購読を保存。セッションと同じ TTL で失効させる
  await redis.set(
    getPushSubscriptionKey(endpointHash),
    JSON.stringify({
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      sessionId,
    }),
    'EX',
    SESSION_TTL_SECONDS
  );
  await redis.sadd(getPushSubscriptionsIndexKey(sessionId), endpointHash);
  await redis.expire(getPushSubscriptionsIndexKey(sessionId), SESSION_TTL_SECONDS);

  // この endpoint の既存スケジュールを全て破棄してから登録し直す
  const scheduleKey = getPushScheduleKey(endpointHash);
  const oldMembers = await redis.hvals(scheduleKey);
  if (oldMembers.length) {
    await redis.zrem(PUSH_DUE_KEY, oldMembers);
  }
  await redis.del(scheduleKey);

  for (const n of notifications) {
    const member = JSON.stringify({
      h: endpointHash,
      k: n.key,
      n: n.notification,
    });
    await redis.hset(scheduleKey, n.key, member);
    await redis.zadd(PUSH_DUE_KEY, n.fireAt, member);
  }
  if (notifications.length) {
    await redis.expire(scheduleKey, SESSION_TTL_SECONDS);
  }

  // 既に fireAt を過ぎた分や直近の通知を即時に処理する
  schedulePushDrain(0);

  return c.json({ ok: true });
});

// ログアウト - Realm のセッションと Cookie を破棄し、Push 購読も解除する。
// ユーザーの他に有効なセッションが残っていなければ、保持している
// リフレッシュトークンは Google 側でも revoke してグラントを削除する
// （revoke に失敗してもログアウト自体は成功とする）
app.post('/auth/logout', async (c) => {
  const sessionId = await getSignedCookie(c, SESSION_SECRET, 'session_id');

  if (sessionId) {
    const session = /** @type {any} */ (realm.objectForPrimaryKey('Session', sessionId));
    const userId = /** @type {string | undefined} */ (session?.userId);
    if (session) {
      try {
        realm.write(() => realm.delete(session));
      } catch {
        // 既に削除済みなら無視
      }
    }

    // ログアウトした端末の Push 購読と送信予定も解除する
    const endpointHashes = await redis.smembers(getPushSubscriptionsIndexKey(sessionId));
    await redis.del(getPushSubscriptionsIndexKey(sessionId));
    for (const endpointHash of endpointHashes) {
      await removePushSubscription(endpointHash);
    }

    // 最後のセッションを閉じた場合はグラントごと破棄する
    if (userId && realm.objects('Session').filtered('userId == $0', userId).length === 0) {
      const grants = [...realm.objects('OAuthGrant').filtered('userId == $0', userId)];
      const tokens = grants.map((g) => g.refreshToken).filter(Boolean);
      if (grants.length) {
        realm.write(() => {
          for (const grant of grants) {
            realm.delete(grant);
          }
        });
      }
      for (const token of tokens) {
        try {
          const res = await fetch(
            `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(/** @type {string} */ (token))}`,
            { method: 'POST', signal: AbortSignal.timeout(5000) }
          );
          if (!res.ok) {
            console.warn(`Token revocation returned status ${res.status}`);
          }
        } catch (err) {
          console.warn('Failed to revoke Google token:', errMessage(err));
        }
      }
    }
  }
  deleteCookie(c, 'session_id', {
    path: '/',
    secure: true,
    sameSite: 'None',
  });

  return c.json({ ok: true });
});

// テストからルーティングと REALM を検証できるようエクスポート
export {
  app,
  redis,
  realm,
  SESSION_SECRET,
  drainDuePushNotifications,
  drainApiRequests,
  createSession,
  upsertUser,
  upsertGrant,
  getGrant,
};

// サーバー起動（直接実行された場合のみ。テスト等で import された場合は起動しない）
const isDirectRun =
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  console.log(`Server is running on ${env.BFF_APP_PORT}`);

  serve({
    fetch: app.fetch,
    port: env.BFF_APP_PORT,
    hostname: '0.0.0.0',
  });
}
