import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getSignedCookie, setSignedCookie, deleteCookie } from 'hono/cookie';
import { google } from 'googleapis';
import Redis from 'ioredis';
import webpush from 'web-push';

/**
 * 環境変数
 * @typedef {object} EnvironmentVariables
 * @property {string} NODE_ENV
 * @property {string} GOOGLE_CLIENT_ID
 * @property {string} GOOGLE_CLIENT_SECRET
 * @property {string} GOOGLE_REDIRECT_URI_AUTH
 * @property {string} GOOGLE_REDIRECT_URI_PHOTOS
 * @property {string} REDIS_HOST
 * @property {number} REDIS_PORT
 * @property {string} REALM_PATH
 * @property {string} BFF_SESSION_SECRET
 * @property {number} BFF_APP_PORT
 * @property {string} VITE_CLIENT_APP_BASE_URL
 * @property {string} VAPID_PUBLIC_KEY
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
    'BFF_SESSION_SECRET',
    'BFF_APP_PORT',
    'REDIS_HOST',
    'REDIS_PORT',
    'REALM_PATH',
    'VAPID_PUBLIC_KEY',
    'VAPID_PRIVATE_KEY',
    'VAPID_SUBJECT',
  ];

  const vars = Object.fromEntries(names.map((name) => [name, process.env[name]]));

  const missing = names.filter((name) => !vars[name]);
  if (process.env.NODE_ENV === 'production' && missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);

  return /** @type {EnvironmentVariables} */ ({
    ...vars,
    REDIS_PORT: Number(vars.REDIS_PORT),
    BFF_APP_PORT: Number(vars.BFF_APP_PORT),
  });
})();

const app = new Hono();

// Redis クライアント初期化
const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: undefined,
  lazyConnect: false,
});

redis.on('connect', () => {
  console.log('Connected to Redis server');
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

// セッションキーのヘルパー関数（プレフィックスを付与して管理を容易にする）
const getSessionKey = (/** @type {string} */ sessionId) => `session:${sessionId}`;
// Photos スコープのリフレッシュトークンはメインセッションとは別キーで保存する
const getPhotoSharingKey = (/** @type {string} */ sessionId) =>
  `${getSessionKey(sessionId)}:photo-sharing`;
// 追加認可フローの state（CSRF 対策）を保存するキー
const getPhotoSharingStateKey = (/** @type {string} */ state) => `photo-sharing-state:${state}`;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30日（Cookieの有効期限と揃える）
const PHOTO_SHARING_STATE_TTL_SECONDS = 60 * 10; // state の有効期限は10分
const SESSION_SECRET = env.BFF_SESSION_SECRET;

const PHOTO_SHARING_SCOPES = [
  'https://www.googleapis.com/auth/photoslibrary.appendonly',
  'https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata',
  'https://www.googleapis.com/auth/photospicker.mediaitems.readonly',
];

// --- Web Push (VAPID) ---
// 秘密鍵はサーバのみで保持する。環境変数が未設定の場合は起動ごとに生成するが、
// applicationServerKey が変わると既存購読への送信が拒否されるため、
// 本番では VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY を固定して設定すること
const vapidKeys =
  env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY
    ? {
        publicKey: env.VAPID_PUBLIC_KEY,
        privateKey: env.VAPID_PRIVATE_KEY,
      }
    : webpush.generateVAPIDKeys();
if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
  console.warn(
    'VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY are not set; using ephemeral VAPID keys. ' +
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
          err instanceof Error ? err.message : String(err),
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
    scope: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/contacts.readonly',
      'https://www.googleapis.com/auth/contacts.other.readonly',
    ],
  });

  return c.redirect(authUrl);
});

// OAuth コールバック - 認可コードからトークンを取得し、Redisに保存して HttpOnly Cookie を発行
app.get('/auth', async (c) => {
  const code = c.req.query('code');
  if (!code) {
    return c.text('Authorization code missing', 400);
  }

  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);

  const sessionId = crypto.randomUUID();

  // Redis にリフレッシュトークンを保存（TTL: 30日）
  if (tokens.refresh_token) {
    await redis.set(
      getSessionKey(sessionId),
      tokens.refresh_token,
      'EX',
      SESSION_TTL_SECONDS
    );
  }

  // 署名付き HttpOnly Cookie をブラウザに付与
  await setSignedCookie(
    c,
    'session_id',
    sessionId,
    SESSION_SECRET,
    {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'Lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    }
  );

  return c.redirect(`${env.VITE_CLIENT_APP_BASE_URL}/authorized`);
});

// Photo Sharing の追加スコープ認可を開始 - 既存セッションに Photos の権限を追加するため
// Google の OAuth 認証画面へリダイレクト（コールバックは PHOTO_SHARING_REDIRECT_URI）
app.get('/auth/photo-sharing', async (c) => {
  const sessionId = await getSignedCookie(c, SESSION_SECRET, 'session_id');

  // 未ログインの場合はメインのログインフローへリダイレクト
  if (!sessionId || !(await redis.exists(getSessionKey(sessionId)))) {
    return c.redirect('/auth/login');
  }

  // state を発行してセッションに紐づけ、コールバックでの CSRF を防ぐ
  const { prompt, error } = parsePromptParam(c.req.query('prompt'));
  if (error) {
    return c.text(error, 400);
  }

  const state = crypto.randomUUID();
  await redis.set(
    getPhotoSharingStateKey(state),
    sessionId,
    'EX',
    PHOTO_SHARING_STATE_TTL_SECONDS
  );

  const client = getOAuth2Client(env.GOOGLE_REDIRECT_URI_PHOTOS);

  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    prompt: prompt ?? 'consent',
    include_granted_scopes: true,
    scope: PHOTO_SHARING_SCOPES,
    state,
  });

  return c.redirect(authUrl);
});

// 追加スコープ認可のコールバック - t パラメータで種別を判別してトークンを交換し、
// Photos 用リフレッシュトークンをセッションに紐づけて保存する。
app.get('/enable', async (c) => {
  const t = c.req.query('t');

  if (t !== 'photo-sharing') {
    return c.text('Unsupported enable type', 400);
  }

  const code = c.req.query('code');
  const state = c.req.query('state');

  // code / state がない場合（ユーザーが同意を拒否した場合等）もフロントへ戻す
  if (!code || !state) {
    return c.redirect(`${env.VITE_CLIENT_APP_BASE_URL}/unauthorized?t=photo-sharing`);
  }

  // state から認可フローを開始したセッションを復元（ワンタイム利用）
  const stateKey = getPhotoSharingStateKey(state);
  const sessionId = await redis.get(stateKey);
  if (sessionId) {
    await redis.del(stateKey);
  }

  if (!sessionId || !(await redis.exists(getSessionKey(sessionId)))) {
    console.warn('Photo sharing callback with invalid or expired state');
    return c.redirect(`${env.VITE_CLIENT_APP_BASE_URL}/unauthorized?t=photo-sharing`);
  }

  try {
    const client = getOAuth2Client(env.GOOGLE_REDIRECT_URI_PHOTOS);
    const { tokens } = await client.getToken(code);

    if (tokens.refresh_token) {
      await redis.set(
        getPhotoSharingKey(sessionId),
        tokens.refresh_token,
        'EX',
        SESSION_TTL_SECONDS
      );
    } else {
      console.warn('Photo sharing callback returned no refresh token');
    }
  } catch (err) {
    console.error('Failed to exchange photo sharing authorization code:', err);
  }

  return c.redirect(`${env.VITE_CLIENT_APP_BASE_URL}/authorized?t=photo-sharing`);
});

// 有効な Google Access Token を取得および更新
// ?t=photo-sharing の場合は Photos スコープで認可済みのトークンを返す
app.get('/api/token', async (c) => {
  const t = c.req.query('t');

  if (t && t !== 'photo-sharing') {
    return c.json({ error: 'UNSUPPORTED_TOKEN_TYPE' }, 400);
  }

  const sessionId = await getSignedCookie(
    c,
    SESSION_SECRET,
    'session_id'
  );

  if (!sessionId) {
    return c.json({ error: 'UNAUTHORIZED' }, 401);
  }

  // Redis からリフレッシュトークンを取得（photo-sharing は別キー）
  const key = t === 'photo-sharing' ? getPhotoSharingKey(sessionId) : getSessionKey(sessionId);
  const refreshToken = await redis.get(key);

  if (!refreshToken) {
    if (t === 'photo-sharing') {
      return c.json({ error: 'PHOTO_SHARING_NOT_AUTHORIZED' }, 404);
    }
    console.log('Unauthorized access attempt: No valid session or refresh token found.');
    return c.json({ error: 'UNAUTHORIZED' }, 401);
  }

  const client = getOAuth2Client();
  client.setCredentials({ refresh_token: refreshToken });

  try {
    const { token } = await client.getAccessToken();
    return c.json({ gAccessToken: token });
  } catch (err) {
    // GaxiosError は config.data にリフレッシュトークンを含むため、
    // エラーオブジェクト全体はログに出さずメッセージとレスポンスボディだけ残す
    const oauthError = /** @type {any} */ (err)?.response?.data;
    console.error(
      'Failed to refresh access token:',
      err instanceof Error ? err.message : String(err),
      oauthError
    );

    // invalid_grant はトークン失効/revoke 済みなので、残ったキーを破棄して再認可を促す
    if (oauthError?.error === 'invalid_grant') {
      await redis.del(key);
      if (t === 'photo-sharing') {
        return c.json({ error: 'PHOTO_SHARING_NOT_AUTHORIZED' }, 404);
      }
      return c.json({ error: 'UNAUTHORIZED' }, 401);
    }

    return c.json({ error: 'TOKEN_REFRESH_FAILED' }, 401);
  }
});

// Push 購読に使う VAPID 公開鍵を返す（公開情報のため認証不要。秘密鍵はサーバのみで保持）
app.get('/api/push/vapid-key', (c) => {
  return c.json({ publicKey: vapidKeys.publicKey });
});

// Push 購読の登録と通知スケジュールの登録/置き換え
// endpoint ごとに購読を upsert し、送信予定は POST のたび全置き換え（空配列で全解除）
app.post('/api/push/subscriptions', async (c) => {
  const sessionId = await getSignedCookie(
    c,
    SESSION_SECRET,
    'session_id'
  );

  if (!sessionId || !(await redis.exists(getSessionKey(sessionId)))) {
    return c.json({ error: 'UNAUTHORIZED' }, 401);
  }

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

// ログアウト - Redis のセッションキーと追加スコープのトークンを破棄し、Cookie を削除。
// 保持しているリフレッシュトークンは Google 側でも revoke する
// （revoke に失敗してもログアウト自体は成功とする）
app.post('/auth/logout', async (c) => {
  const sessionId = await getSignedCookie(
    c,
    SESSION_SECRET,
    'session_id'
  );

  if (sessionId) {
    const keys = [getSessionKey(sessionId), getPhotoSharingKey(sessionId)];
    const tokens = await redis.mget(keys);
    await redis.del(keys);

    // ログアウトした端末の Push 購読と送信予定も解除する
    const endpointHashes = await redis.smembers(getPushSubscriptionsIndexKey(sessionId));
    await redis.del(getPushSubscriptionsIndexKey(sessionId));
    for (const endpointHash of endpointHashes) {
      await removePushSubscription(endpointHash);
    }

    for (const token of tokens) {
      if (!token) {
        continue;
      }
      try {
        const res = await fetch(
          `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
          { method: 'POST', signal: AbortSignal.timeout(5000) }
        );
        if (!res.ok) {
          console.warn(`Token revocation returned status ${res.status}`);
        }
      } catch (err) {
        console.warn('Failed to revoke Google token:', err);
      }
    }
  }
  deleteCookie(c, 'session_id');

  return c.json({ ok: true });
});

// テストからルーティングを検証できるようエクスポート
export { app, redis, SESSION_SECRET, drainDuePushNotifications };

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
