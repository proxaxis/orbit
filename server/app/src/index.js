import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getSignedCookie, setSignedCookie, deleteCookie } from 'hono/cookie';
import { google } from 'googleapis';

const app = new Hono();

// CORS 設定（Vite 開発サーバーからの Cookie 送信を許可）
app.use(
  '*',
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);

/**
 * Google OAuth2 クライアント初期化
 */
const getOAuth2Client = () => new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

/**
 * 簡易セッションストレージ
 */
const refreshTokens = new Map();

// ログイン開始 - Google の OAuth 認証画面へリダイレクト
app.get('/auth/login', (c) => {
  const client = getOAuth2Client();

  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
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

// OAuth コールバック - 認可コードからトークンを取得し、HttpOnly Cookie を発行
app.get('/auth/callback', async (c) => {
  const code = c.req.query('code');
  if (!code) {
    return c.text('Authorization code missing', 400);
  }

  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);

  // セッション ID を生成してリフレッシュトークンを保存
  const sessionId = crypto.randomUUID();
  if (tokens.refresh_token) {
    refreshTokens.set(sessionId, tokens.refresh_token);
  }

  // 署名付き HttpOnly Cookie をブラウザに付与
  await setSignedCookie(
    c,
    'session_id',
    sessionId,
    process.env.SESSION_SECRET || 'fallback-secret-key-min-32-chars',
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30日間
    }
  );

  // フロントエンドのカレンダー画面へ戻す
  return c.redirect(process.env.CLIENT_URL ?? '');
});

// 有効な Google Access Token を取得および更新 - Vue 側が Google API を直接叩く前に呼び出す
app.get('/api/token', async (c) => {
  const sessionId = await getSignedCookie(
    c,
    process.env.SESSION_SECRET || 'fallback-secret-key-min-32-chars',
    'session_id'
  );

  console.log('Session ID:', sessionId);

  if (!sessionId || !refreshTokens.has(sessionId)) {
    console.log('Unauthorized access attempt: No valid session or refresh token found.');
    return c.json({ error: 'UNAUTHORIZED' }, 401);
  }

  const refreshToken = refreshTokens.get(sessionId);
  const client = getOAuth2Client();
  client.setCredentials({ refresh_token: refreshToken });

  try {
    // リフレッシュトークンを使って常に有効なアクセストークンを取得
    const { token } = await client.getAccessToken();
    return c.json({ gAccessToken: token });
  } catch (err) {
    console.error('Failed to refresh access token:', err);
    return c.json({ error: 'TOKEN_REFRESH_FAILED' }, 401);
  }
});

// ログアウト - セッションを破棄し、Cookie を削除
app.post('/auth/logout', async (c) => {
  const sessionId = await getSignedCookie(
    c,
    process.env.SESSION_SECRET || 'fallback-secret-key-min-32-chars',
    'session_id'
  );

  if (sessionId) {
    refreshTokens.delete(sessionId);
  }
  deleteCookie(c, 'session_id');

  return c.json({ ok: true });
});

// サーバー起動
const port = Number(process.env.SERVER_PORT);
console.log(`Server is running on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
