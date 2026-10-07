import { pathToFileURL } from 'node:url';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getSignedCookie, setSignedCookie, deleteCookie } from 'hono/cookie';
import { google } from 'googleapis';
import Redis from 'ioredis';

const app = new Hono();

// Redis クライアント初期化
const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD,
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
const SESSION_SECRET =
  process.env.SESSION_SECRET ?? 'E3LgvqwIuHPlBTmUBKtoi0KM99HcIObfAPeEaEy732YKx6YDm20sxIfCHKlWxmrF';

// 認可完了後にリダイレクトするフロントエンドのオリジン
const APP_ORIGIN = process.env.APP_ORIGIN ?? process.env.CLIENT_URL ?? '';

// 追加スコープ認可のコールバック URI（Google Cloud Console に登録が必要）
const PHOTO_SHARING_REDIRECT_URI =
  process.env.PHOTO_SHARING_REDIRECT_URI ??
  `${new URL(process.env.GOOGLE_REDIRECT_URI).origin}/enable?t=photo-sharing`;

const PHOTO_SHARING_SCOPES = [
  'https://www.googleapis.com/auth/photoslibrary.appendonly',
  'https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata',
  'https://www.googleapis.com/auth/photospicker.mediaitems.readonly',
];

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
    origin: APP_ORIGIN,
    credentials: true,
  })
);

/**
 * Google OAuth2 クライアント初期化
 */
const getOAuth2Client = (redirectUri = process.env.GOOGLE_REDIRECT_URI) =>
  new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );

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
      'https://www.googleapis.com/auth/contacts',
      'https://www.googleapis.com/auth/contacts.other.readonly',
    ],
  });

  return c.redirect(authUrl);
});

// OAuth コールバック - 認可コードからトークンを取得し、Redisに保存して HttpOnly Cookie を発行
app.get('/auth/callback', async (c) => {
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
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    }
  );

  return c.redirect(APP_ORIGIN);
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

  const client = getOAuth2Client(PHOTO_SHARING_REDIRECT_URI);

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
// 成否にかかわらずフロントの /enable?t=photo-sharing へリダイレクトする
app.get('/enable', async (c) => {
  const t = c.req.query('t');

  if (t !== 'photo-sharing') {
    return c.text('Unsupported enable type', 400);
  }

  const frontRedirect = `${APP_ORIGIN}/enable?t=photo-sharing`;
  const code = c.req.query('code');
  const state = c.req.query('state');

  // code / state がない場合（ユーザーが同意を拒否した場合等）もフロントへ戻す
  if (!code || !state) {
    return c.redirect(frontRedirect);
  }

  // state から認可フローを開始したセッションを復元（ワンタイム利用）
  const stateKey = getPhotoSharingStateKey(state);
  const sessionId = await redis.get(stateKey);
  if (sessionId) {
    await redis.del(stateKey);
  }

  if (!sessionId || !(await redis.exists(getSessionKey(sessionId)))) {
    console.warn('Photo sharing callback with invalid or expired state');
    return c.redirect(frontRedirect);
  }

  try {
    const client = getOAuth2Client(PHOTO_SHARING_REDIRECT_URI);
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

  return c.redirect(frontRedirect);
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
export { app, redis, SESSION_SECRET };

// サーバー起動（直接実行された場合のみ。テスト等で import された場合は起動しない）
const isDirectRun =
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const port = Number(process.env.SERVER_PORT);
  console.log(`Server is running on ${port}`);

  serve({
    fetch: app.fetch,
    port,
    hostname: '0.0.0.0',
  });
}
